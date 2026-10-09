import { internalMutation } from "./_generated/server"
import { v, ConvexError } from "convex/values"

// Operator-only cleanup; never exposed as a client API.
export const clearBatch = internalMutation({
  args: {
    eventKey: v.union(v.literal("2026new"), v.literal("2026txhou1")),
    kind: v.union(v.literal("pitReports"), v.literal("matchReports"), v.literal("breakdownFollowUps"), v.literal("scoutNotifications"), v.literal("matchRobotClaims"), v.literal("reviews")),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { eventKey, kind, cursor }) => {
    const event = await ctx.db.query("events").withIndex("by_eventKey", q => q.eq("eventKey", eventKey)).unique()
    if (!event) throw new ConvexError("Event not found")
    if (kind === "reviews") {
      const page = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", event._id)).paginate({ numItems: 100, cursor: cursor ?? null })
      let cleared = 0
      for (const match of page.page) {
        if (match.completionReviewAt !== undefined || match.completionAssignments !== undefined) {
          await ctx.db.patch(match._id, { completionReviewAt: undefined, completionAssignments: undefined })
          cleared++
        }
      }
      return { cleared, done: page.isDone, cursor: page.continueCursor }
    }
    const rows = kind === "pitReports"
      ? await ctx.db.query("pitReports").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100)
      : kind === "matchReports"
        ? await ctx.db.query("matchReports").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100)
        : kind === "breakdownFollowUps"
          ? await ctx.db.query("breakdownFollowUps").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", event._id)).take(100)
          : kind === "scoutNotifications"
            ? await ctx.db.query("scoutNotifications").withIndex("by_eventId_and_matchNumber_and_teamNumber", q => q.eq("eventId", event._id)).take(100)
            : await ctx.db.query("matchRobotClaims").withIndex("by_eventId_and_matchNumber_and_teamNumber_and_status", q => q.eq("eventId", event._id)).take(100)
    for (const row of rows) await ctx.db.delete(row._id)
    return { cleared: rows.length, done: rows.length < 100, cursor: "" }
  },
})
