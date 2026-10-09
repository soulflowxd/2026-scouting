import type { QueryCtx, MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { planMatchAssignments } from "./scoutAssignmentPlan"

export async function assignmentContext(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId)
  const groups = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(500)
  const participants = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", eventId)).take(500)
  const members = (await ctx.db.query("members").take(500)).filter(member => !member.mergedInto && member.approvalStatus !== "pending" && member.approvalStatus !== "rejected")
  // No override means included. Legacy participant rows also remain included.
  const excluded = new Set(participants.filter(row => row.included === false).map(row => row.memberId))
  const scouts = members.filter(member => !excluded.has(member._id)).map(member => member._id)
  return { event, groups: groups.map(group => ({ teamNumber: group.teamNumber, scout: group.memberId as string })), scouts, members }
}
export function matchPlan(context: Awaited<ReturnType<typeof assignmentContext>>, match: { redTeams: number[]; blueTeams: number[]; matchNumber: number }) {
  return planMatchAssignments(context.groups, context.scouts, match, context.event?.scoutAssignmentSeed ?? 0)
}
