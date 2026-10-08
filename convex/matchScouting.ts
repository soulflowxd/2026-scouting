import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireScoutingOpen } from "./lib/scoutingAccess"
import { internal } from "./_generated/api"
import {
  requireAdminFromDb,
  requireApprovedUserFromDb,
} from "./lib/authz"
import { matchReportInputValidator } from "./validators"

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
    const doc = {
      ...args,
      autoFuel: clamp(args.autoFuel, 0, 200),
      teleopFuel: clamp(args.teleopFuel, 0, 300),
      driverRating: clamp(args.driverRating, 1, 10),
      defenseRating: clamp(args.defenseRating, 1, 10),
      autoAllianceFuel: clamp(args.autoAllianceFuel, 0, 600),
      opponentAutoFuel: clamp(args.opponentAutoFuel, 0, 600),
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
