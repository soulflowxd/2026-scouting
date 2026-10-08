import { ConvexError } from "convex/values"
import type { MutationCtx } from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { assignmentContext, matchPlan } from "./scoutMatchAssignments"
export async function requireAssignedTeam(ctx: MutationCtx, args: { eventId: Id<"events">; teamNumber: number; matchNumber: number }, user: { tokenIdentifier: string; role: string }) {
  const event = await ctx.db.get(args.eventId)
  if (!event?.scoutAssignmentsEnabled || user.role === "admin" || user.role === "superAdmin") return
  const match = await ctx.db.query("matches").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", args.eventId).eq("matchNumber", args.matchNumber)).unique()
  if (match) {
    const context = await assignmentContext(ctx, args.eventId)
    const assigned = matchPlan(context, match).find(row => row.teamNumber === args.teamNumber)
    const member = context.members.find(row => row._id === assigned?.scout)
    if (member?.tokenIdentifier === user.tokenIdentifier) return
    throw new ConvexError("You can scout your assigned teams only. Check your assignment for this match or arrange a substitute handoff.")
  }
  const scheduled = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).first()
  if (scheduled) throw new ConvexError("This match is not in the event schedule")
  const assignment = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).unique()
  const member = assignment && await ctx.db.get(assignment.memberId)
  if (!member || member.tokenIdentifier !== user.tokenIdentifier || member.mergedInto) throw new ConvexError("You can scout your assigned teams only. Ask an admin to change your assignment or arrange a substitute handoff.")
}
