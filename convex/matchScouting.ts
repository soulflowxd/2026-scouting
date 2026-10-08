import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireScoutingOpen } from "./lib/scoutingAccess"
import { internal } from "./_generated/api"
import {
  requireAdminFromDb,
  requireApprovedUserFromDb,
} from "./lib/authz"
import { matchReportInputValidator } from "./validators"
import { reportResult } from "./lib/tbaMatchResult"
import { requireAssignedTeam } from "./lib/scoutAssignmentAccess"

const tagAllowlist = new Set([
  "Fast",
  "Accurate",
  "Good driver",
  "Plays defense",
  "Tippy",
  "Broke down",
  "Inconsistent",
  "Good at crossing Bump/Trench",
  "Strong climber",
])

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

export const matchesForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)
    const stats = await ctx.db
      .query("externalStats")
      .withIndex("by_eventId_and_teamNumber", (q) => q.eq("eventId", args.eventId))
      .take(500)
    return matches.map((match) => ({
      ...match,
      teamStats: [...match.redTeams, ...match.blueTeams].map((teamNumber) => {
        const stat = stats.find((item) => item.teamNumber === teamNumber)
        return {
          teamNumber,
          epa: stat?.epa,
          averageRp: stat?.averageRp,
        }
      }),
    }))
  },
})

export const claimsForMatch = query({
  args: { eventId: v.id("events"), matchNumber: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matchRobotClaims")
      .withIndex("by_eventId_and_matchNumber_and_teamNumber_and_status", (q) =>
        q.eq("eventId", args.eventId).eq("matchNumber", args.matchNumber),
      )
      .take(20)
  },
})

export const claimRobot = mutation({
  args: { eventId: v.id("events"), matchNumber: v.number(), teamNumber: v.number() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    await requireScoutingOpen(ctx, args.eventId)
    const activeForRobot = await ctx.db
      .query("matchRobotClaims")
      .withIndex("by_eventId_and_matchNumber_and_teamNumber_and_status", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("matchNumber", args.matchNumber)
          .eq("teamNumber", args.teamNumber)
          .eq("status", "active"),
      )
      .unique()
    if (activeForRobot && activeForRobot.scoutToken !== user.tokenIdentifier) {
      throw new ConvexError(`Robot already claimed by ${activeForRobot.scoutName ?? "another scout"}. Ask them or an admin to release it.`)
    }
    if (activeForRobot) return activeForRobot._id
    await requireAssignedTeam(ctx, args, user)

    const activeForScout = await ctx.db
      .query("matchRobotClaims")
      .withIndex("by_eventId_and_matchNumber_and_scoutToken_and_status", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("matchNumber", args.matchNumber)
          .eq("scoutToken", user.tokenIdentifier)
          .eq("status", "active"),
      )
      .unique()
    if (activeForScout && activeForScout.teamNumber !== args.teamNumber) {
      throw new ConvexError(`Scout already claimed team ${activeForScout.teamNumber} in this match. Release that claim before selecting another robot.`)
    }

    return await ctx.db.insert("matchRobotClaims", {
      ...args,
      scoutToken: user.tokenIdentifier,
      scoutName: user.name ?? user.email ?? undefined,
      status: "active",
      claimedAt: Date.now(),
    })
  },
})

export const releaseClaim = mutation({
  args: { claimId: v.id("matchRobotClaims") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    const claim = await ctx.db.get(args.claimId)
    if (!claim) throw new ConvexError("Claim not found")
    if (claim.substituteToken) throw new ConvexError("Finish or cancel the substitute handoff before releasing this robot")
    if (
      claim.scoutToken !== user.tokenIdentifier &&
      user.role !== "admin" &&
      user.role !== "superAdmin"
    ) {
      throw new ConvexError("Only the scout who owns this claim or an admin can release it")
    }
    await ctx.db.patch(args.claimId, {
      status: "released",
      releasedAt: Date.now(),
    })
  },
})

export const availableSubstitutes = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUserFromDb(ctx)
    const members = await ctx.db.query("members").take(500)
    return members.filter(member => !member.mergedInto && member.tokenIdentifier !== user.tokenIdentifier &&
      (member.approvalStatus === undefined || member.approvalStatus === "approved"))
      .map(member => ({ _id: member._id, name: member.name || "Scout" }))
  },
})

export const requestSubstitute = mutation({
  args: { claimId: v.id("matchRobotClaims"), substituteId: v.id("members") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    const claim = await ctx.db.get(args.claimId)
    if (!claim || claim.status !== "active" || claim.scoutToken !== user.tokenIdentifier) throw new ConvexError("Only the assigned scout can request a break")
    await requireScoutingOpen(ctx, claim.eventId)
    if (claim.substituteToken) throw new ConvexError("A substitute request is already pending")
    const substitute = await ctx.db.get(args.substituteId)
    if (!substitute || substitute.mergedInto || substitute.approvalStatus === "pending" || substitute.approvalStatus === "rejected" || substitute.tokenIdentifier === user.tokenIdentifier) throw new ConvexError("Choose another approved scout")
    await ctx.db.patch(claim._id, { substituteToken: substitute.tokenIdentifier, substituteName: substitute.name || "Scout", breakRequestedAt: Date.now(), substituteAcceptedAt: undefined })
  },
})

export const myHandoffs = query({
  args: {},
  handler: async (ctx) => {
    if (!await ctx.auth.getUserIdentity()) return []
    const user = await requireApprovedUserFromDb(ctx)
    const outgoing = await ctx.db.query("matchRobotClaims").withIndex("by_scoutToken", q => q.eq("scoutToken", user.tokenIdentifier)).order("desc").take(200)
    const incoming = await ctx.db.query("matchRobotClaims").withIndex("by_substituteToken", q => q.eq("substituteToken", user.tokenIdentifier)).order("desc").take(200)
    return [...outgoing, ...incoming].filter(claim => claim.status === "active" && claim.substituteToken && claim.breakRequestedAt)
      .map(claim => ({ ...claim, incoming: claim.substituteToken === user.tokenIdentifier }))
  },
})

export const confirmSubstitute = mutation({
  args: { claimId: v.id("matchRobotClaims"), requestedAt: v.number(), action: v.union(v.literal("accept"), v.literal("confirm"), v.literal("cancel")) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    const claim = await ctx.db.get(args.claimId)
    if (!claim || claim.status !== "active" || !claim.substituteToken || claim.breakRequestedAt !== args.requestedAt) throw new ConvexError("This handoff is no longer active")
    const owner = claim.scoutToken === user.tokenIdentifier
    const substitute = claim.substituteToken === user.tokenIdentifier
    if (!owner && !substitute) throw new ConvexError("Only these two scouts can confirm this handoff")
    if (args.action === "cancel") {
      await ctx.db.patch(claim._id, { substituteToken: undefined, substituteName: undefined, breakRequestedAt: undefined, substituteAcceptedAt: undefined })
      return
    }
    await requireScoutingOpen(ctx, claim.eventId)
    if (args.action === "accept" && !substitute) throw new ConvexError("The substitute must accept on their own account")
    if (args.action === "confirm" && (!owner || !claim.substituteAcceptedAt)) throw new ConvexError("The substitute must accept before the original scout confirms")
    const member = await ctx.db.query("members").withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", claim.substituteToken!)).unique()
    if (!member || member.mergedInto || member.approvalStatus === "rejected" || member.approvalStatus === "pending") throw new ConvexError("The substitute is no longer approved")
    const occupied = await ctx.db.query("matchRobotClaims").withIndex("by_eventId_and_matchNumber_and_scoutToken_and_status", q => q.eq("eventId", claim.eventId).eq("matchNumber", claim.matchNumber).eq("scoutToken", claim.substituteToken!).eq("status", "active")).unique()
    if (occupied) throw new ConvexError("The substitute already has a robot assigned in this match")
    if (args.action === "accept") {
      await ctx.db.patch(claim._id, { substituteAcceptedAt: Date.now() })
      return
    }
    await ctx.db.patch(claim._id, {
      handoffFromToken: claim.scoutToken, handoffCompletedAt: Date.now(),
      scoutToken: claim.substituteToken, scoutName: claim.substituteName,
      substituteToken: undefined, substituteName: undefined, breakRequestedAt: undefined, substituteAcceptedAt: undefined,
    })
  },
})

export const adminReleaseClaim = mutation({
  args: { claimId: v.id("matchRobotClaims") },
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    const claim = await ctx.db.get(args.claimId)
    if (!claim) throw new Error("Claim not found")
    await ctx.db.patch(args.claimId, {
      status: "released",
      releasedAt: Date.now(),
    })
  },
})

export const saveReport = mutation({
  args: matchReportInputValidator,
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    await requireScoutingOpen(ctx, args.eventId)
    const shifts = [args.shift1Cycles, args.shift2Cycles, args.shift3Cycles]
    if (args.totalMatchPoints !== undefined && (!Number.isInteger(args.totalMatchPoints) || args.totalMatchPoints < 0 || args.totalMatchPoints > 9999)) {
      throw new ConvexError("Total match points must be a whole number between 0 and 9999")
    }
    const separateShifts = shifts.some(value => value !== undefined) || args.transitionActivity !== undefined
    const cycleValues = [args.autoCycles, ...(separateShifts ? shifts : [args.teleopCyclesPerShift]), args.endgameCycles]
    if (cycleValues.some(value => value !== undefined) || args.autoFuel === undefined || args.teleopFuel === undefined) {
      if (cycleValues.some(value => value === undefined || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 999)) {
        throw new ConvexError("Enter whole-number cycle counts between 0 and 999 for auto, shift, and endgame")
      }
      if (!args.offShiftActivity?.trim()) throw new ConvexError("Describe what the robot does off-shift")
      if (separateShifts && !args.transitionActivity?.trim()) throw new ConvexError("Describe what the robot does in transition")
    }
    const claim = await ctx.db
      .query("matchRobotClaims")
      .withIndex("by_eventId_and_matchNumber_and_teamNumber_and_status", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("matchNumber", args.matchNumber)
          .eq("teamNumber", args.teamNumber)
          .eq("status", "active"),
      )
      .unique()
    if (claim && claim.scoutToken !== user.tokenIdentifier) {
      throw new ConvexError("Robot already claimed by another scout")
    }
    if (!claim) {
      await requireAssignedTeam(ctx, args, user)
      const activeForScout = await ctx.db
        .query("matchRobotClaims")
        .withIndex("by_eventId_and_matchNumber_and_scoutToken_and_status", (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("matchNumber", args.matchNumber)
            .eq("scoutToken", user.tokenIdentifier)
            .eq("status", "active"),
        )
        .unique()
      if (activeForScout && activeForScout.teamNumber !== args.teamNumber) {
        throw new ConvexError(`Scout already claimed team ${activeForScout.teamNumber} in this match. Release that claim first.`)
      }
      await ctx.db.insert("matchRobotClaims", {
        eventId: args.eventId,
        matchNumber: args.matchNumber,
        teamNumber: args.teamNumber,
        scoutToken: user.tokenIdentifier,
        scoutName: user.name ?? user.email ?? undefined,
        status: "active",
        claimedAt: Date.now(),
      })
    }

    const tags = args.tags.filter((tag) => tagAllowlist.has(tag)).slice(0, 12)
    const match = await ctx.db.query("matches").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", args.eventId).eq("matchNumber", args.matchNumber)).unique()
    const alliance = match?.redTeams.includes(args.teamNumber) ? "red" : match?.blueTeams.includes(args.teamNumber) ? "blue" : null
    const official = alliance && match?.tbaResult ? reportResult(match.tbaResult[alliance]) : {}
    const doc = {
      ...args,
      autoFuel: args.autoFuel === undefined ? undefined : clamp(args.autoFuel, 0, 200),
      teleopFuel: args.teleopFuel === undefined ? undefined : clamp(args.teleopFuel, 0, 300),
      offShiftActivity: args.offShiftActivity?.trim(),
      transitionActivity: args.transitionActivity?.trim(),
      driverRating: clamp(args.driverRating, 1, 10),
      defenseRating: clamp(args.defenseRating, 1, 10),
      autoAllianceFuel: args.autoAllianceFuel === undefined ? undefined : clamp(args.autoAllianceFuel, 0, 600),
      opponentAutoFuel: args.opponentAutoFuel === undefined ? undefined : clamp(args.opponentAutoFuel, 0, 600),
      ...official,
      tags,
      scoutToken: user.tokenIdentifier,
      updatedAt: Date.now(),
    }

    const existing = await ctx.db
      .query("matchReports")
      .withIndex(
        "by_eventId_and_matchNumber_and_teamNumber_and_scoutToken",
        (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("matchNumber", args.matchNumber)
            .eq("teamNumber", args.teamNumber)
            .eq("scoutToken", user.tokenIdentifier),
      )
      .order("desc").first()

    let reportId
    if (match) await ctx.scheduler.runAfter(0, internal.tbaMatches.refreshAfterReport, { eventId: args.eventId, matchNumber: args.matchNumber, attempt: 0 })
    if (existing) {
      await ctx.db.patch(existing._id, doc)
      reportId = existing._id
    } else {
      reportId = await ctx.db.insert("matchReports", doc)
    }

    if (tags.includes("Broke down")) {
      const members = (await ctx.db.query("members").take(500)).filter(
        (member) =>
          !member.mergedInto && (member.approvalStatus === undefined ||
          member.approvalStatus === "approved"),
      )
      const recipientTokens = new Set([
        user.tokenIdentifier,
        ...members.map((member) => member.tokenIdentifier),
      ])
      const createdAt = Date.now()
      await Promise.all(
        [...recipientTokens].map(async (recipientToken) => {
          const duplicate = await ctx.db
            .query("scoutNotifications")
            .withIndex(
              "by_recipientToken_and_eventId_and_matchNumber_and_teamNumber",
              (q) =>
                q
                  .eq("recipientToken", recipientToken)
                  .eq("eventId", args.eventId)
                  .eq("matchNumber", args.matchNumber)
                  .eq("teamNumber", args.teamNumber),
            )
            .first()
          if (!duplicate) {
            const notificationId = await ctx.db.insert("scoutNotifications", {
              recipientToken,
              eventId: args.eventId,
              kind: "robotBreakdown",
              matchNumber: args.matchNumber,
              teamNumber: args.teamNumber,
              message: `Team ${args.teamNumber} broke down in QM${args.matchNumber}. Ask the team what failed on the robot.`,
              createdAt,
            })
            await ctx.scheduler.runAfter(0, internal.push.sendBreakdown, { notificationId })
          }
        }),
      )
    }

    return reportId
  },
})
