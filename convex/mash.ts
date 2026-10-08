import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireApprovedUserFromDb } from "./lib/authz"

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireApprovedUserFromDb(ctx)
    const votes = await ctx.db.query("mashVotes").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(5000)
    return votes.map(vote => ({ _id: vote._id, left: vote.left, right: vote.right, winner: vote.winner, mine: vote.ownerToken === user.tokenIdentifier }))
  },
})

export const vote = mutation({
  args: { eventId: v.id("events"), left: v.number(), right: v.number(), winner: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    if (!Number.isInteger(args.left) || !Number.isInteger(args.right) || args.left === args.right || (args.winner !== null && args.winner !== args.left && args.winner !== args.right)) throw new Error("Invalid matchup")
    if (!await ctx.db.get(args.eventId)) throw new Error("Event not found")
    for (const teamNumber of [args.left, args.right]) {
      const team = await ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", teamNumber)).unique()
      if (!team) throw new Error("Team not in this event")
    }
    const votes = await ctx.db.query("mashVotes").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).take(5000)
    if (votes.length >= 5000) throw new Error("This event has reached its 5,000-comparison limit")
    return await ctx.db.insert("mashVotes", { ...args, ownerToken: user.tokenIdentifier })
  },
})

export const undo = mutation({
  args: { voteId: v.id("mashVotes") },
  handler: async (ctx, { voteId }) => {
    const user = await requireApprovedUserFromDb(ctx)
    const vote = await ctx.db.get(voteId)
    if (!vote || vote.ownerToken !== user.tokenIdentifier) throw new Error("You can only undo your own votes")
    await ctx.db.delete(voteId)
  },
})
