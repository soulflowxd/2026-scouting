import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action, env, internalAction, internalMutation, internalQuery, query, type ActionCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { requireApprovedUserFromDb } from "./lib/authz"
import { ensureCompletionReview } from "./lib/scoutingCompletion"
import { parseTbaResult, reportResult, tbaResultValidator } from "./lib/tbaMatchResult"

const matchArgs = { eventId: v.id("events"), matchNumber: v.number() }
async function context(ctx: import("./_generated/server").QueryCtx, args: { eventId: Id<"events">; matchNumber: number }) {
  const event = await ctx.db.get(args.eventId)
  const match = await ctx.db.query("matches").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", args.eventId).eq("matchNumber", args.matchNumber)).unique()
  // Custom rosters have no official schedule. Never invent TBA match keys.
  if (!event || /^\d{4}ntx$/i.test(event.eventKey) || !match || match.tbaMatchKey !== `${event.eventKey}_qm${args.matchNumber}`) return null
  return match
}
export const forMatch = query({
  args: matchArgs,
  handler: async (ctx, args) => { await requireApprovedUserFromDb(ctx); return context(ctx, args) },
})
export const getContext = internalQuery({ args: matchArgs, handler: context })
export const applyResult = internalMutation({
  args: { matchId: v.id("matches"), result: tbaResultValidator },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId)
    if (!match) return
    await ensureCompletionReview(ctx, match)
    await ctx.db.patch(match._id, { tbaResult: args.result, tbaCheckedAt: Date.now() })
    const reports = await ctx.db.query("matchReports").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", match.eventId).eq("matchNumber", match.matchNumber)).take(500)
    for (const report of reports) {
      const side = match.redTeams.includes(report.teamNumber) ? "red" : match.blueTeams.includes(report.teamNumber) ? "blue" : null
      if (side) await ctx.db.patch(report._id, reportResult(args.result[side]))
    }
  },
})

async function fetchResult(ctx: ActionCtx, match: Doc<"matches"> | null): Promise<string> {
  if (!match) return "manual"
  if (match.tbaCheckedAt && Date.now() - match.tbaCheckedAt < 60_000) return "cached"
  const key = env.TBA_API_KEY?.trim()
  if (!key) return "unavailable"
  try {
    const response = await fetch(`https://www.thebluealliance.com/api/v3/match/${encodeURIComponent(match.tbaMatchKey)}`, {
      headers: { "X-TBA-Auth-Key": key }, signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return response.status === 404 ? "pending" : "unavailable"
    const result = parseTbaResult(await response.json(), match.tbaMatchKey)
    if (!result) return "pending"
    await ctx.runMutation(internal.tbaMatches.applyResult, { matchId: match._id, result })
    return "updated"
  } catch { return "unavailable" }
}
export const refresh = action({
  args: matchArgs,
  handler: async (ctx, args): Promise<string> => {
    const match: Doc<"matches"> | null = await ctx.runQuery(api.tbaMatches.forMatch, args)
    return fetchResult(ctx, match)
  },
})
// Retry after submission so a result posted a few minutes later can fill existing reports.
export const refreshAfterReport = internalAction({
  args: { ...matchArgs, attempt: v.number() },
  handler: async (ctx, { attempt, ...args }): Promise<void> => {
    const match: Doc<"matches"> | null = await ctx.runQuery(internal.tbaMatches.getContext, args)
    const status = await fetchResult(ctx, match)
    if ((status === "pending" || status === "unavailable") && attempt < 12) {
      await ctx.scheduler.runAfter(60_000, internal.tbaMatches.refreshAfterReport, { ...args, attempt: attempt + 1 })
    }
  },
})
