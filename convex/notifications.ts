import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireApprovedUserFromDb } from "./lib/authz"

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.auth.getUserIdentity()
    if (!user) return []
    return await ctx.db
      .query("scoutNotifications")
      .withIndex("by_recipientToken_and_createdAt", (q) =>
        q.eq("recipientToken", user.tokenIdentifier),
      )
      .order("desc")
      .take(30)
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
    if (!notification.readAt) {
      await ctx.db.patch(args.notificationId, { readAt: Date.now() })
    }
    return null
  },
})

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUserFromDb(ctx)
    const notifications = await ctx.db
      .query("scoutNotifications")
      .withIndex("by_recipientToken_and_createdAt", (q) =>
        q.eq("recipientToken", user.tokenIdentifier),
      )
      .order("desc")
      .take(100)
    const readAt = Date.now()
    await Promise.all(
      notifications
        .filter((notification) => !notification.readAt)
        .map((notification) => ctx.db.patch(notification._id, { readAt })),
    )
    return null
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
      await ctx.db.insert("scoutNotifications", {
        recipientToken: user.tokenIdentifier,
        eventId: args.eventId,
        kind: "robotBreakdown",
        matchNumber: breakdown.matchNumber,
        teamNumber: breakdown.teamNumber,
        message: `Team ${breakdown.teamNumber} broke down in QM${breakdown.matchNumber}. Ask the team what failed on the robot.`,
        createdAt: Date.now(),
      })
      created += 1
    }
    return created
  },
})
