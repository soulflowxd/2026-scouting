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
import { ensureCompletionReview } from "./lib/scoutingCompletion"

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

export const saveVideoLink = mutation({
  args: { matchId: v.id("matches"), videoUrl: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    const match = await ctx.db.get(args.matchId)
    if (!match || !(await ctx.db.get(match.eventId))) throw new ConvexError("Match not found")
    const videoUrl = args.videoUrl.trim()
    if (videoUrl) {
      let url: URL
      try { url = new URL(videoUrl) } catch { throw new ConvexError("Paste a valid Google Drive video link") }
      if (videoUrl.length > 2048 || url.protocol !== "https:" || url.hostname !== "drive.google.com" || url.username || url.password || url.port ||
          !(/^\/file\/(?:u\/\d+\/)?d\/[a-zA-Z0-9_-]+(?:\/|$)/.test(url.pathname) || (["/open", "/uc"].includes(url.pathname) && /^[a-zA-Z0-9_-]+$/.test(url.searchParams.get("id") ?? "")))) {
        throw new ConvexError("Paste a Google Drive file link, such as drive.google.com/file/d/…/view")
      }
    }
    // Video references remain editable after scouting closes and survive schedule refreshes.
    await ctx.db.patch(match._id, { videoUrl: videoUrl || undefined })
    return null
  },
})

export const removeReport = mutation({
  args: { reportId: v.id("matchReports") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    const report = await ctx.db.get(args.reportId)
    if (!report) throw new ConvexError("Match report not found")
    await ctx.db.delete(report._id)
    for await (const claim of ctx.db.query("matchRobotClaims")
      .withIndex("by_eventId_and_matchNumber_and_teamNumber_and_status", q => q.eq("eventId", report.eventId).eq("matchNumber", report.matchNumber).eq("teamNumber", report.teamNumber).eq("status", "active"))) {
      await ctx.db.patch(claim._id, { status: "released", releasedAt: Date.now(), substituteToken: undefined, substituteName: undefined, breakRequestedAt: undefined, substituteAcceptedAt: undefined })
    }
    if (report.tags.includes("Broke down")) {
      let stillReported = false
      for await (const other of ctx.db.query("matchReports")
        .withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", report.eventId).eq("matchNumber", report.matchNumber))) {
        if (other.teamNumber === report.teamNumber && other.tags.includes("Broke down")) {
          stillReported = true
          break
        }
      }
      if (!stillReported) {
        // Retract unsupported alerts, but retain independently recorded pit follow-ups.
        for await (const alert of ctx.db.query("scoutNotifications")
          .withIndex("by_eventId_and_matchNumber_and_teamNumber", q => q.eq("eventId", report.eventId).eq("matchNumber", report.matchNumber).eq("teamNumber", report.teamNumber))) {
          await ctx.db.delete(alert._id)
        }
      }
    }
    return null
  },
})

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

export const reportSubmitted = query({
  args: { eventId: v.id("events"), matchNumber: v.number(), teamNumber: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    await requireAssignedTeam(ctx, args, user)
    for await (const report of ctx.db.query("matchReports").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", args.eventId).eq("matchNumber", args.matchNumber))) {
      if (report.teamNumber === args.teamNumber) return true
    }
    return false
  },
})

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

// Compatibility endpoints for older open tabs. Claims are retired; reload for assignments.
export const claimsForMatch = query({
  args: { eventId: v.id("events"), matchNumber: v.number() },
  handler: async () => [],
})
export const claimRobot = mutation({
  args: { eventId: v.id("events"), matchNumber: v.number(), teamNumber: v.number() },
  handler: async (ctx, args) => {
    await requireApprovedUserFromDb(ctx)
    await requireScoutingOpen(ctx, args.eventId)
    throw new ConvexError("Manual claims have been removed. Refresh the app and use your scouting assignments.")
  },
})
export const releaseClaim = mutation({
  args: { claimId: v.id("matchRobotClaims") },
  handler: async (ctx) => { await requireApprovedUserFromDb(ctx); throw new ConvexError("Manual claims have been removed. Refresh the app.") },
})
export const requestSubstitute = mutation({
  args: { claimId: v.id("matchRobotClaims"), substituteId: v.id("members") },
  handler: async (ctx) => { await requireApprovedUserFromDb(ctx); throw new ConvexError("Refresh the app to hand off your scouting assignments.") },
})
export const myHandoffs = query({ args: {}, handler: async () => [] })
export const confirmSubstitute = mutation({
  args: { claimId: v.id("matchRobotClaims"), requestedAt: v.number(), action: v.union(v.literal("accept"), v.literal("confirm"), v.literal("cancel")) },
  handler: async (ctx) => { await requireApprovedUserFromDb(ctx); throw new ConvexError("Refresh the app to hand off your scouting assignments.") },
})
export const adminReleaseClaim = mutation({
  args: { claimId: v.id("matchRobotClaims") },
  handler: async (ctx) => { await requireAdminFromDb(ctx); throw new ConvexError("Manual claims have been removed.") },
})

export const saveReport = mutation({
  args: matchReportInputValidator,
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    if (args.clientSubmissionId) {
      if (args.clientSubmissionId.length > 100) throw new ConvexError("Invalid submission identifier")
      const previous = await ctx.db.query("matchReports").withIndex("by_eventId_and_matchNumber_and_teamNumber_and_scoutToken", q => q.eq("eventId", args.eventId).eq("matchNumber", args.matchNumber).eq("teamNumber", args.teamNumber)).first()
      if (previous?.clientSubmissionId === args.clientSubmissionId && previous.scoutToken === user.tokenIdentifier) return previous._id
    }
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
    const existing = await ctx.db
      .query("matchReports")
      .withIndex(
        "by_eventId_and_matchNumber_and_teamNumber_and_scoutToken",
        (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("matchNumber", args.matchNumber)
            .eq("teamNumber", args.teamNumber),
      )
      .order("desc").first()

    if (existing) throw new ConvexError("Match report already submitted. An admin must delete it before scouting this robot again.")
    await requireAssignedTeam(ctx, args, user)

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

    if (args.autoPath && (args.autoPath.length > 200 || args.autoPath.reduce((count, path) => count + path.length, 0) > 2000 || args.autoPath.some(path => !path.length || path.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 500)))) {
      throw new ConvexError("Observed auto path is invalid or too large")
    }
    if (match) await ctx.scheduler.runAfter(0, internal.tbaMatches.refreshAfterReport, { eventId: args.eventId, matchNumber: args.matchNumber, attempt: 0 })
    const reportId = await ctx.db.insert("matchReports", doc)
    if (match) await ensureCompletionReview(ctx, match)

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
