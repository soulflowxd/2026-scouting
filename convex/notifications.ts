import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireApprovedUserFromDb, requireUserFromDb } from "./lib/authz"
import { requireScoutingOpen } from "./lib/scoutingAccess"

export const pendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    if (!await ctx.auth.getUserIdentity()) return []
    const user = await requireUserFromDb(ctx)
    if ((user.role !== "admin" && user.role !== "superAdmin") || user.approvalStatus !== "approved") return []
    const members = await ctx.db.query("members").withIndex("by_approvalStatus", q => q.eq("approvalStatus", "pending")).take(500)
    return members.filter(member => !member.mergedInto).map(member => ({
      _id: member._id, name: member.name || member.email || "New scout", requestedAt: member.requestedAt ?? member._creationTime,
    }))
  },
})

export const mine = query({
  args: {},
  handler: async (ctx) => {
    if (!await ctx.auth.getUserIdentity()) return []
    const user = await requireUserFromDb(ctx)
    const notifications = await ctx.db
      .query("scoutNotifications")
      .withIndex("by_recipientToken_and_createdAt", (q) =>
        q.eq("recipientToken", user.tokenIdentifier),
      )
      .order("desc")
      .take(500)
    const pending = []
    for (const notification of notifications) {
      const completed = await ctx.db.query("breakdownFollowUps")
        .withIndex("by_eventId_and_matchNumber_and_teamNumber", (q) =>
          q.eq("eventId", notification.eventId).eq("matchNumber", notification.matchNumber).eq("teamNumber", notification.teamNumber))
        .unique()
      if (!completed) pending.push(notification)
    }
    return pending
  },
})

export const markRead = mutation({
  args: { notificationId: v.id("scoutNotifications") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    const notification = await ctx.db.get(args.notificationId)
    if (!notification || notification.recipientToken !== user.tokenIdentifier) {
      throw new Error("Notification not found")
    }
    // Opening an alert must never dismiss an unfinished pit follow-up.
    return null
  },
})

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    await requireApprovedUserFromDb(ctx)
    // Retained for older clients; only submitting a follow-up resolves alerts.
    return null
  },
})

export const submitBreakdownFollowUp = mutation({
  args: {
    notificationId: v.id("scoutNotifications"),
    whatBroke: v.string(),
    cause: v.string(),
    repairStatus: v.string(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    const notification = await ctx.db.get(args.notificationId)
    if (!notification || notification.recipientToken !== user.tokenIdentifier) {
      throw new ConvexError("Notification not found")
    }
    const whatBroke = args.whatBroke.trim()
    await requireScoutingOpen(ctx, notification.eventId)
    const cause = args.cause.trim()
    const repairStatus = args.repairStatus.trim()
    if (!whatBroke || !repairStatus) throw new ConvexError("Describe what broke and the repair status")
    if (!cause) throw new ConvexError("Describe what caused the breakdown, or enter unknown if the team is still investigating")
    if ([whatBroke, args.cause, repairStatus, args.notes].some((value) => value.length > 4000)) {
      throw new ConvexError("Keep each field under 4,000 characters")
    }
    const existing = await ctx.db.query("breakdownFollowUps")
      .withIndex("by_eventId_and_matchNumber_and_teamNumber", (q) =>
        q.eq("eventId", notification.eventId).eq("matchNumber", notification.matchNumber).eq("teamNumber", notification.teamNumber))
      .unique()
    if (existing) return existing._id
    return await ctx.db.insert("breakdownFollowUps", {
      eventId: notification.eventId,
      matchNumber: notification.matchNumber,
      teamNumber: notification.teamNumber,
      whatBroke,
      cause,
      repairStatus,
      notes: args.notes.trim(),
      scoutToken: user.tokenIdentifier,
      scoutName: user.name ?? user.email ?? "Scout",
      submittedAt: Date.now(),
    })
  },
})

export const syncBreakdownAlerts = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    const reports = await ctx.db
      .query("matchReports")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(500)
    const breakdowns = new Map<string, { matchNumber: number; teamNumber: number }>()
    for (const report of reports) {
      if (!report.tags.includes("Broke down")) continue
      breakdowns.set(`${report.matchNumber}:${report.teamNumber}`, {
        matchNumber: report.matchNumber,
        teamNumber: report.teamNumber,
      })
    }

    let created = 0
    for (const breakdown of breakdowns.values()) {
      const existing = await ctx.db
        .query("scoutNotifications")
        .withIndex(
          "by_recipientToken_and_eventId_and_matchNumber_and_teamNumber",
          (q) =>
            q
              .eq("recipientToken", user.tokenIdentifier)
              .eq("eventId", args.eventId)
              .eq("matchNumber", breakdown.matchNumber)
              .eq("teamNumber", breakdown.teamNumber),
        )
        .unique()
      if (existing) continue
      const notificationId = await ctx.db.insert("scoutNotifications", {
        recipientToken: user.tokenIdentifier,
        eventId: args.eventId,
        kind: "robotBreakdown",
        matchNumber: breakdown.matchNumber,
        teamNumber: breakdown.teamNumber,
        message: `Team ${breakdown.teamNumber} broke down in QM${breakdown.matchNumber}. Ask the team what failed on the robot.`,
        createdAt: Date.now(),
      })
      await ctx.scheduler.runAfter(0, internal.push.sendBreakdown, { notificationId })
      created += 1
    }
    return created
  },
})
