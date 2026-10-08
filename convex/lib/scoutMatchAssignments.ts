import type { QueryCtx, MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { planMatchAssignments } from "./scoutAssignmentPlan"

export async function assignmentContext(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId)
  const groups = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(500)
  const participants = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", eventId)).take(500)
  const members = (await ctx.db.query("members").take(500)).filter(member => !member.mergedInto && member.approvalStatus !== "pending" && member.approvalStatus !== "rejected")
  const eligible = new Set(members.map(member => member._id))
  return { event, groups: groups.map(group => ({ teamNumber: group.teamNumber, scout: group.memberId as string })), scouts: participants.filter(row => eligible.has(row.memberId)).map(row => row.memberId as string), members }
}
export function matchPlan(context: Awaited<ReturnType<typeof assignmentContext>>, match: { redTeams: number[]; blueTeams: number[]; matchNumber: number }) {
  return planMatchAssignments(context.groups, context.scouts, match, context.event?.scoutAssignmentSeed ?? 0)
}
