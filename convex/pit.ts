import { mutation, query } from "./_generated/server"
import { requireUser } from "./lib/authz"
import { pitReportInputValidator } from "./validators"

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

export const getForTeam = query({
  args: {
    eventId: pitReportInputValidator.eventId,
    teamNumber: pitReportInputValidator.teamNumber,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pitReports")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .take(20)
  },
})

export const save = mutation({
  args: pitReportInputValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const preloadCount = clamp(args.preloadCount, 0, 8)
    const existing = await ctx.db
      .query("pitReports")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .take(20)
    const mine = existing.find(
      (report) => report.scoutToken === user.tokenIdentifier,
    )
    const doc = {
      ...args,
      preloadCount,
      scoutToken: user.tokenIdentifier,
      updatedAt: Date.now(),
    }
    if (mine) {
      await ctx.db.patch(mine._id, doc)
      return mine._id
    }
    return await ctx.db.insert("pitReports", doc)
  },
})
