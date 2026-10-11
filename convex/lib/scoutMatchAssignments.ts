import type { QueryCtx, MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { planMatchAssignments } from "./scoutAssignmentPlan"

export async function assignmentContext(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId)
  const groups = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(500)
  const roster = await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
  const retired = new Set(roster.filter(team => team.rosterArchived || team.mergedIntoTeamNumber).map(team => team.teamNumber))
  const participants = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", eventId)).take(500)
  const stations = await ctx.db.query("scoutDriverStationAssignments").withIndex("by_eventId_and_station", q => q.eq("eventId", eventId)).take(6)
  const members = (await ctx.db.query("members").take(500)).filter(member => !member.mergedInto && member.approvalStatus !== "pending" && member.approvalStatus !== "rejected")
  // No override means included. Legacy participant rows also remain included.
  const excluded = new Set(participants.filter(row => row.included === false).map(row => row.memberId))
  const scouts = members.filter(member => !excluded.has(member._id)).map(member => member._id)
  return { event, groups: groups.filter(group => !retired.has(group.teamNumber)).map(group => ({ teamNumber: group.teamNumber, scout: group.memberId as string })), stations, scouts, members }
}
export function matchPlan(context: Awaited<ReturnType<typeof assignmentContext>>, match: Pick<Doc<"matches">, "redTeams" | "blueTeams" | "matchNumber" | "assignmentSlots" | "completionAssignments">) {
  const roster = new Set([...match.redTeams, ...match.blueTeams])
  if (match.assignmentSlots) return match.assignmentSlots.filter(slot => roster.has(slot.teamNumber)).map(slot => ({ teamNumber: slot.teamNumber, scout: slot.memberId as string }))
  if (match.completionAssignments) return match.completionAssignments.flatMap(slot => {
    const member = context.members.find(member => member.tokenIdentifier === slot.scoutToken)
    return member && roster.has(slot.teamNumber) ? [{ teamNumber: slot.teamNumber, scout: member._id as string }] : []
  })
  if (context.event?.scoutAssignmentMode === "manual") {
    return context.stations.flatMap(slot => {
      const teamNumber = (slot.station.startsWith("Red") ? match.redTeams : match.blueTeams)[Number(slot.station.slice(-1)) - 1]
      return teamNumber !== undefined && context.scouts.includes(slot.memberId) ? [{ teamNumber, scout: slot.memberId as string }] : []
    })
  }
  return planMatchAssignments(context.groups, context.scouts, match, context.event?.scoutAssignmentSeed ?? 0)
}

export function assignmentSlots(context: Awaited<ReturnType<typeof assignmentContext>>, match: Parameters<typeof matchPlan>[1]) {
  return matchPlan(context, match).flatMap(slot => {
    const member = context.members.find(member => member._id === slot.scout)
    return member ? [{ teamNumber: slot.teamNumber, memberId: member._id, scoutToken: member.tokenIdentifier, scoutName: member.name || member.email || "Scout" }] : []
  })
}

export async function matchHasStarted(ctx: QueryCtx | MutationCtx, match: Doc<"matches">) {
  return !!(match.completionReviewAt || match.tbaResult || await ctx.db.query("matchReports").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", match.eventId).eq("matchNumber", match.matchNumber)).first())
}

// Freeze past responsibility before changing groups or participant membership.
export async function preserveAssignmentHistory(ctx: MutationCtx, eventId: Id<"events">) {
  const context = await assignmentContext(ctx, eventId)
  const matches = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
  for (const match of matches) {
    if (match.assignmentFrozenAt || await matchHasStarted(ctx, match)) {
      if (!match.assignmentSlots) await ctx.db.patch(match._id, { assignmentSlots: assignmentSlots(context, match) })
    } else if (match.assignmentSlots) await ctx.db.patch(match._id, { assignmentSlots: undefined })
  }
}
