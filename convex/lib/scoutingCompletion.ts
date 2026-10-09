import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { assignmentContext, matchPlan } from "./scoutMatchAssignments"

type Context = Awaited<ReturnType<typeof assignmentContext>>
type Responsibility = { teamNumber: number; scoutToken: string; scoutName: string }

export function completionResponsibilities(context: Context, match: Doc<"matches">, claims: Doc<"matchRobotClaims">[]): Responsibility[] {
  const active = claims.filter(claim => claim.status === "active")
  const claimedTeams = new Set(active.map(claim => claim.teamNumber))
  const occupiedScouts = new Set(active.map(claim => claim.scoutToken))
  const members = new Map(context.members.map(member => [member._id as string, member]))
  const planned = match.completionAssignments ?? (context.event?.scoutAssignmentsEnabled ? matchPlan(context, match).flatMap(slot => {
    const member = members.get(slot.scout)
    return member ? [{ teamNumber: slot.teamNumber, scoutToken: member.tokenIdentifier, scoutName: member.name || member.email || "Scout" }] : []
  }) : [])
  const roster = new Set([...match.redTeams, ...match.blueTeams])
  return [
    ...planned.filter(slot => roster.has(slot.teamNumber) && !claimedTeams.has(slot.teamNumber) && !occupiedScouts.has(slot.scoutToken)),
    ...active.filter(claim => roster.has(claim.teamNumber)).map(claim => ({ teamNumber: claim.teamNumber, scoutToken: claim.scoutToken,
      scoutName: context.members.find(member => member.tokenIdentifier === claim.scoutToken)?.name || claim.scoutName || "Scout" })),
  ]
}

export async function ensureCompletionReview(ctx: MutationCtx, match: Doc<"matches">) {
  if (match.completionAssignments !== undefined) return
  const context = await assignmentContext(ctx, match.eventId)
  const claims = await ctx.db.query("matchRobotClaims").withIndex("by_eventId_and_matchNumber_and_teamNumber_and_status", q => q.eq("eventId", match.eventId).eq("matchNumber", match.matchNumber)).take(500)
  await ctx.db.patch(match._id, {
    completionReviewAt: match.completionReviewAt ?? Date.now(),
    completionAssignments: completionResponsibilities(context, match, claims),
  })
}
