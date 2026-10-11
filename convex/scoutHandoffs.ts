import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { requireApprovedUserFromDb } from "./lib/authz"
import { requireScoutingOpen } from "./lib/scoutingAccess"
import { assignmentContext, assignmentSlots, matchHasStarted, matchPlan } from "./lib/scoutMatchAssignments"

export async function scope(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, memberId: Id<"members">, fromMatchNumber?: number) {
  const context = await assignmentContext(ctx, eventId)
  if (!context.event) throw new ConvexError("Event not found")
  const matches = (await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)).sort((a, b) => a.matchNumber - b.matchNumber)
  const started = new Set<number>()
  for (const match of matches) if (match.assignmentFrozenAt || await matchHasStarted(ctx, match)) started.add(match.matchNumber)
  const boundary = Math.max(0, ...started) + 1
  const from = fromMatchNumber ?? matches.find(match => match.matchNumber >= boundary)?.matchNumber ?? boundary
  if (!Number.isSafeInteger(from) || from < boundary) throw new ConvexError("Choose a match after the matches already finished or reported")
  const teamNumbers = context.groups.filter(group => group.scout === memberId).map(group => group.teamNumber).sort((a, b) => a - b)
  const driverStations = context.event.scoutAssignmentMode === "manual" ? context.stations.filter(slot => slot.memberId === memberId).map(slot => slot.station).sort() : []
  const matchSlots = matches.filter(match => match.matchNumber >= from).flatMap(match => matchPlan(context, match).filter(slot => slot.scout === memberId).map(slot => ({ matchNumber: match.matchNumber, teamNumber: slot.teamNumber })))
  return { context, matches, fromMatchNumber: from, teamNumbers, driverStations, matchSlots, boundary }
}

function sameScope(a: Pick<Doc<"scoutAssignmentHandoffs">, "teamNumbers" | "matchSlots" | "driverStations">, b: Awaited<ReturnType<typeof scope>>) {
  return JSON.stringify(a.teamNumbers) === JSON.stringify(b.teamNumbers) && JSON.stringify(a.matchSlots.filter(slot => slot.matchNumber >= b.fromMatchNumber)) === JSON.stringify(b.matchSlots) && JSON.stringify(a.driverStations) === JSON.stringify(b.driverStations)
}

function checkRecipient(data: Awaited<ReturnType<typeof scope>>, toMemberId: Id<"members">) {
  const recipient = data.context.members.find(member => member._id === toMemberId)
  if (!recipient) throw new ConvexError("Choose another approved scout")
  if (data.driverStations.length && data.context.stations.some(slot => slot.memberId === toMemberId)) throw new ConvexError("This scout already has a driver station. Choose a scout without overlapping assignments.")
  for (const slot of data.matchSlots) {
    const match = data.matches.find(match => match.matchNumber === slot.matchNumber)!
    if (matchPlan(data.context, match).some(row => row.scout === toMemberId)) throw new ConvexError(`This scout already has an assignment in QM${slot.matchNumber}. Choose a scout without overlapping matches.`)
  }
  return recipient
}

export const options = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireApprovedUserFromDb(ctx)
    if (!user.memberId) throw new ConvexError("Scout account not found")
    const data = await scope(ctx, eventId, user.memberId)
    const roster = await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
    return {
      fromMatchNumber: data.fromMatchNumber,
      matches: data.matches.filter(match => match.matchNumber >= data.boundary).map(match => match.matchNumber),
      teamLabels: data.teamNumbers.map(number => roster.find(team => team.teamNumber === number)?.eventTeamAlias || String(number)),
      matchCount: data.matchSlots.length,
      driverStations: data.driverStations,
      selfId: user.memberId,
      owners: data.context.members.filter(member => member._id !== user.memberId && (
        data.context.event?.scoutAssignmentMode === "manual"
          ? data.context.stations.some(slot => slot.memberId === member._id)
          : data.context.groups.some(group => group.scout === member._id) || data.matches.some(match => match.matchNumber >= data.boundary && matchPlan(data.context, match).some(slot => slot.scout === member._id))
      )).map(member => ({ _id: member._id, name: member.name || member.email || "Scout" })),
      // Participant inclusion is deliberately not an eligibility requirement.
      scouts: data.context.members.filter(member => member._id !== user.memberId).map(member => ({ _id: member._id, name: member.name || member.email || "Scout" })),
    }
  },
})

export const request = mutation({
  args: { eventId: v.id("events"), substituteId: v.id("members"), fromMatchNumber: v.number(), sourceId: v.optional(v.id("members")) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    await requireScoutingOpen(ctx, args.eventId)
    if (!user.memberId) throw new ConvexError("Scout account not found")
    const sourceId = args.sourceId ?? user.memberId
    const incomingRequest = sourceId !== user.memberId
    if (sourceId === args.substituteId || (incomingRequest && args.substituteId !== user.memberId)) throw new ConvexError("Choose another approved scout; request a handoff only for yourself")
    const data = await scope(ctx, args.eventId, sourceId, args.fromMatchNumber)
    const source = data.context.members.find(member => member._id === sourceId)
    if (!source) throw new ConvexError("Choose an approved scout with assignments")
    if (!data.context.event?.scoutAssignmentsEnabled) throw new ConvexError("Ask an admin to enable scouting assignments first")
    if (!data.teamNumbers.length && !data.matchSlots.length && !data.driverStations.length) throw new ConvexError("You have no assignments to hand off")
    const pending = (await Promise.all((["requested", "accepted"] as const).map(status => ctx.db.query("scoutAssignmentHandoffs").withIndex("by_eventId_and_status", q => q.eq("eventId", args.eventId).eq("status", status)).take(500)))).flat()
    if (pending.some(row => [row.fromMemberId, row.toMemberId].some(id => id === sourceId || id === args.substituteId))) throw new ConvexError("Finish or cancel the existing handoff for these scouts first")
    const recipient = checkRecipient(data, args.substituteId)
    return await ctx.db.insert("scoutAssignmentHandoffs", {
      eventId: args.eventId, fromMemberId: sourceId, toMemberId: recipient._id,
      fromToken: source.tokenIdentifier, toToken: recipient.tokenIdentifier, fromName: source.name || source.email || "Scout", toName: recipient.name || recipient.email || "Scout",
      fromMatchNumber: data.fromMatchNumber, teamNumbers: data.teamNumbers, matchSlots: data.matchSlots,
      driverStations: data.driverStations,
      status: incomingRequest ? "accepted" : "requested", requestedAt: Date.now(), ...(incomingRequest ? { acceptedAt: Date.now() } : {}),
    })
  },
})

export const mine = query({
  args: {},
  handler: async (ctx) => {
    if (!await ctx.auth.getUserIdentity()) return []
    const user = await requireApprovedUserFromDb(ctx)
    const rows = (await Promise.all((["requested", "accepted"] as const).flatMap(status => [
      ctx.db.query("scoutAssignmentHandoffs").withIndex("by_fromToken_and_status", q => q.eq("fromToken", user.tokenIdentifier).eq("status", status)).order("desc").take(200),
      ctx.db.query("scoutAssignmentHandoffs").withIndex("by_toToken_and_status", q => q.eq("toToken", user.tokenIdentifier).eq("status", status)).order("desc").take(200),
    ]))).flat()
    const rosters = new Map<Id<"events">, Doc<"teams">[]>()
    for (const eventId of new Set(rows.map(row => row.eventId))) rosters.set(eventId, await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500))
    return rows.map(row => ({ ...row, incoming: row.toToken === user.tokenIdentifier, teamLabels: row.teamNumbers.map(number => rosters.get(row.eventId)?.find(team => team.teamNumber === number)?.eventTeamAlias || String(number)) }))
  },
})

export const respond = mutation({
  args: { handoffId: v.id("scoutAssignmentHandoffs"), action: v.union(v.literal("accept"), v.literal("confirm"), v.literal("cancel")) },
  handler: async (ctx, { handoffId, action }) => {
    const user = await requireApprovedUserFromDb(ctx)
    const handoff = await ctx.db.get(handoffId)
    if (!handoff || (handoff.status !== "requested" && handoff.status !== "accepted")) throw new ConvexError("This handoff is no longer active")
    const owner = user.memberId === handoff.fromMemberId
    const incoming = user.memberId === handoff.toMemberId
    if (!owner && !incoming) throw new ConvexError("Only these two scouts can respond to this handoff")
    if (action === "cancel") { await ctx.db.patch(handoffId, { status: "cancelled", cancelledAt: Date.now() }); return }
    await requireScoutingOpen(ctx, handoff.eventId)
    if (action === "accept" && !incoming) throw new ConvexError("The substitute must accept on their own account")
    if (action === "confirm" && (!owner || handoff.status !== "accepted")) throw new ConvexError("The substitute must accept before the original scout confirms")
    const current = await scope(ctx, handoff.eventId, handoff.fromMemberId)
    const data = await scope(ctx, handoff.eventId, handoff.fromMemberId, Math.max(current.boundary, handoff.fromMatchNumber))
    if (!data.context.event?.scoutAssignmentsEnabled || !sameScope(handoff, data)) throw new ConvexError("Assignments changed. Cancel this request and arrange a new handoff.")
    const recipient = checkRecipient(data, handoff.toMemberId)
    if (action === "accept") { await ctx.db.patch(handoffId, { status: "accepted", acceptedAt: Date.now() }); return }
    // Snapshot every scheduled match before groups change. Earlier matches never transfer.
    for (const match of data.matches) {
      const slots = match.assignmentSlots ?? assignmentSlots(data.context, match)
      const next = match.matchNumber >= data.fromMatchNumber ? slots.map(slot => slot.memberId === handoff.fromMemberId ? { ...slot, memberId: recipient._id, scoutToken: recipient.tokenIdentifier, scoutName: recipient.name || recipient.email || "Scout" } : slot) : slots
      await ctx.db.patch(match._id, { assignmentSlots: next, ...(match.matchNumber < data.fromMatchNumber ? { assignmentFrozenAt: match.assignmentFrozenAt ?? Date.now() } : {}) })
    }
    const groups = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_memberId", q => q.eq("eventId", handoff.eventId).eq("memberId", handoff.fromMemberId)).take(500)
    for (const group of groups) await ctx.db.patch(group._id, { memberId: recipient._id })
    for (const station of data.context.stations.filter(slot => slot.memberId === handoff.fromMemberId && handoff.driverStations.includes(slot.station))) await ctx.db.patch(station._id, { memberId: recipient._id })
    for (const [memberId, included] of [[handoff.fromMemberId, false], [recipient._id, true]] as const) {
      const participant = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", handoff.eventId).eq("memberId", memberId)).unique()
      if (participant) await ctx.db.patch(participant._id, { included })
      else await ctx.db.insert("scoutAssignmentParticipants", { eventId: handoff.eventId, memberId, included })
    }
    await ctx.db.patch(handoffId, { status: "confirmed", confirmedAt: Date.now(), fromMatchNumber: data.fromMatchNumber, matchSlots: data.matchSlots })
  },
})

export const history = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireApprovedUserFromDb(ctx)
    const roster = await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
    return (await ctx.db.query("scoutAssignmentHandoffs").withIndex("by_eventId_and_status", q => q.eq("eventId", eventId).eq("status", "confirmed")).order("desc").take(100)).map(row => ({ ...row, teamLabels: row.teamNumbers.map(number => roster.find(team => team.teamNumber === number)?.eventTeamAlias || String(number)) }))
  },
})
