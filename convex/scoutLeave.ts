import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdminFromDb, requireApprovedUserFromDb } from "./lib/authz"
import { requireScoutingOpen } from "./lib/scoutingAccess"
import { assignmentSlots } from "./lib/scoutMatchAssignments"
import { scope } from "./scoutHandoffs"

export const mine = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireApprovedUserFromDb(ctx)
    if (!user.memberId) return []
    return await ctx.db.query("scoutLeaveRequests").withIndex("by_eventId_and_memberId", q => q.eq("eventId", eventId).eq("memberId", user.memberId!)).order("desc").take(20)
  },
})

export const pending = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireAdminFromDb(ctx)
    return await ctx.db.query("scoutLeaveRequests").withIndex("by_eventId_and_status", q => q.eq("eventId", eventId).eq("status", "pending")).take(500)
  },
})

export const history = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireApprovedUserFromDb(ctx)
    return await ctx.db.query("scoutLeaveRequests").withIndex("by_eventId_and_status", q => q.eq("eventId", eventId).eq("status", "approved")).order("desc").take(100)
  },
})

export const request = mutation({
  args: { eventId: v.id("events"), reason: v.string() },
  handler: async (ctx, { eventId, reason }) => {
    const user = await requireApprovedUserFromDb(ctx)
    await requireScoutingOpen(ctx, eventId)
    if (!user.memberId) throw new ConvexError("Scout account not found")
    const text = reason.trim()
    if (!text || text.length > 300) throw new ConvexError("Enter a reason of up to 300 characters")
    const rows = await ctx.db.query("scoutLeaveRequests").withIndex("by_eventId_and_memberId", q => q.eq("eventId", eventId).eq("memberId", user.memberId!)).order("desc").take(100)
    if (rows.some(row => row.status === "pending")) throw new ConvexError("You already have a leave request awaiting approval")
    const data = await scope(ctx, eventId, user.memberId)
    if (!data.context.event?.scoutAssignmentsEnabled || (!data.matchSlots.length && !data.driverStations.length && !data.teamNumbers.length)) throw new ConvexError("You have no scouting assignments to leave")
    return await ctx.db.insert("scoutLeaveRequests", { eventId, memberId: user.memberId, scoutName: user.name || user.email || "Scout", reason: text, requestedAt: Date.now(), status: "pending" })
  },
})

export const cancel = mutation({
  args: { requestId: v.id("scoutLeaveRequests") },
  handler: async (ctx, { requestId }) => {
    const user = await requireApprovedUserFromDb(ctx)
    const row = await ctx.db.get(requestId)
    if (!row || row.memberId !== user.memberId || row.status !== "pending") throw new ConvexError("Only your pending request can be cancelled")
    await ctx.db.patch(requestId, { status: "cancelled", reviewedAt: Date.now() })
  },
})

export const review = mutation({
  args: { requestId: v.id("scoutLeaveRequests"), approve: v.boolean() },
  handler: async (ctx, { requestId, approve }) => {
    const admin = await requireAdminFromDb(ctx)
    const row = await ctx.db.get(requestId)
    if (!row || row.status !== "pending") throw new ConvexError("This request is no longer pending")
    const reviewedBy = admin.name || admin.email || "Admin"
    if (!approve) { await ctx.db.patch(requestId, { status: "rejected", reviewedAt: Date.now(), reviewedBy }); return }
    await requireScoutingOpen(ctx, row.eventId)
    const data = await scope(ctx, row.eventId, row.memberId)
    if (!data.context.event?.scoutAssignmentsEnabled) throw new ConvexError("Scouting assignments are disabled")
    if (!data.matchSlots.length && !data.driverStations.length && !data.teamNumbers.length) throw new ConvexError("Assignments changed. Reject this request; the scout has no remaining assignment")
    const active = (await Promise.all((["requested", "accepted"] as const).map(status => ctx.db.query("scoutAssignmentHandoffs").withIndex("by_eventId_and_status", q => q.eq("eventId", row.eventId).eq("status", status)).take(500)))).flat()
    if (active.some(item => [item.fromMemberId, item.toMemberId].some(id => id === row.memberId))) throw new ConvexError("Finish or cancel the pending handoff for these scouts first")
    for (const match of data.matches) {
      const slots = match.assignmentSlots ?? assignmentSlots(data.context, match)
      await ctx.db.patch(match._id, { assignmentSlots: match.matchNumber >= data.fromMatchNumber ? slots.filter(slot => slot.memberId !== row.memberId) : slots,
        ...(match.matchNumber < data.fromMatchNumber ? { assignmentFrozenAt: match.assignmentFrozenAt ?? Date.now() } : {}) })
    }
    for (const group of await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_memberId", q => q.eq("eventId", row.eventId).eq("memberId", row.memberId)).take(500)) await ctx.db.delete(group._id)
    for (const station of data.context.stations.filter(slot => slot.memberId === row.memberId)) await ctx.db.delete(station._id)
    for (const [memberId, included] of [[row.memberId, false]] as const) {
      const participant = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", row.eventId).eq("memberId", memberId)).unique()
      if (participant) await ctx.db.patch(participant._id, { included })
      else await ctx.db.insert("scoutAssignmentParticipants", { eventId: row.eventId, memberId, included })
    }
    await ctx.db.patch(requestId, { status: "approved", reviewedAt: Date.now(), reviewedBy, fromMatchNumber: data.fromMatchNumber, driverStations: data.driverStations, teamNumbers: data.teamNumbers, matchSlots: data.matchSlots })
  },
})
