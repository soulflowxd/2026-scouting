import { v } from "convex/values"
import { query } from "./_generated/server"
import { requireApprovedUserFromDb } from "./lib/authz"

export const leaderboard = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const actor = await requireApprovedUserFromDb(ctx)
    if (!(await ctx.db.get(eventId))) return []
    const [matches, pits, members] = await Promise.all([
      ctx.db.query("matchReports").withIndex("by_eventId", q => q.eq("eventId", eventId)).collect(),
      ctx.db.query("pitReports").withIndex("by_eventId", q => q.eq("eventId", eventId)).collect(),
      ctx.db.query("members").collect(),
    ])
    const names = new Map(members.map(member => [member.tokenIdentifier, member.name?.trim() || "Scout"]))
    const counts = new Map<string, { match: number; pit: number }>()
    for (const report of matches) {
      const row = counts.get(report.scoutToken) ?? { match: 0, pit: 0 }
      row.match += 1
      counts.set(report.scoutToken, row)
    }
    for (const report of pits) {
      const row = counts.get(report.scoutToken) ?? { match: 0, pit: 0 }
      row.pit += 1
      counts.set(report.scoutToken, row)
    }
    if (!counts.has(actor.tokenIdentifier)) counts.set(actor.tokenIdentifier, { match: 0, pit: 0 })
    return [...counts].map(([token, count]) => ({
      name: names.get(token) ?? (token === actor.tokenIdentifier ? actor.name || "You" : "Scout"),
      match: count.match,
      pit: count.pit,
      isYou: token === actor.tokenIdentifier,
    })).sort((a, b) => b.match + b.pit - a.match - a.pit || b.match - a.match || a.name.localeCompare(b.name))
  },
})
