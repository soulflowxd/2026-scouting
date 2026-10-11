import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { assignmentContext, matchPlan } from "./scoutMatchAssignments"

type Context = Awaited<ReturnType<typeof assignmentContext>>
type Responsibility = { teamNumber: number; scoutToken: string; scoutName: string }

export function completionResponsibilities(context: Context, match: Doc<"matches">): Responsibility[] {
  const roster = new Set([...match.redTeams, ...match.blueTeams])
  if (match.completionAssignments) return match.completionAssignments.filter(slot => roster.has(slot.teamNumber))
  if (match.assignmentSlots) return match.assignmentSlots.filter(slot => roster.has(slot.teamNumber)).map(({ teamNumber, scoutToken, scoutName }) => ({ teamNumber, scoutToken, scoutName }))
  if (!context.event?.scoutAssignmentsEnabled) return []
  return matchPlan(context, match).flatMap(slot => {
    const member = context.members.find(member => member._id === slot.scout)
    return member ? [{ teamNumber: slot.teamNumber, scoutToken: member.tokenIdentifier, scoutName: member.name || member.email || "Scout" }] : []
  })
}

export async function ensureCompletionReview(ctx: MutationCtx, match: Doc<"matches">) {
  if (match.completionAssignments !== undefined) return
  const context = await assignmentContext(ctx, match.eventId)
  await ctx.db.patch(match._id, {
    completionReviewAt: match.completionReviewAt ?? Date.now(),
    completionAssignments: completionResponsibilities(context, match),
  })
}
