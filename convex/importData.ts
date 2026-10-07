import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { match13RatingValidator } from "./lib/match13"

function omitUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T
}

export const getEventForRefresh = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) return null
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)
    return {
      eventKey: event.eventKey,
      teams: teams.map((team) => ({
        teamNumber: team.teamNumber,
        tbaTeamKey: team.tbaTeamKey,
      })),
    }
  },
})

export const beginImport = internalMutation({
  args: { eventKey: v.string(), createdByToken: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("events")
      .withIndex("by_eventKey", (q) => q.eq("eventKey", args.eventKey))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        importStatus: "importing",
        importMessage: "Importing event data",
        activeAt: Date.now(),
      })
      return existing._id
    }
    return await ctx.db.insert("events", {
      eventKey: args.eventKey,
      importStatus: "importing",
      importMessage: "Importing event data",
      activeAt: Date.now(),
      createdByToken: args.createdByToken,
    })
  },
})

export const markImportError = internalMutation({
  args: { eventId: v.id("events"), message: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      importStatus: "error",
      importMessage: args.message.slice(0, 500),
    })
  },
})

export const applyEventImport = internalMutation({
  args: {
    eventId: v.id("events"),
    eventName: v.optional(v.string()),
    teams: v.array(
      v.object({
        tbaTeamKey: v.string(),
        teamNumber: v.number(),
        nickname: v.string(),
        city: v.optional(v.string()),
        stateProv: v.optional(v.string()),
        country: v.optional(v.string()),
      }),
    ),
    matches: v.array(
      v.object({
        tbaMatchKey: v.string(),
        matchNumber: v.number(),
        redTeams: v.array(v.number()),
        blueTeams: v.array(v.number()),
        scheduledTime: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const team of args.teams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_eventId_and_teamNumber", (q) =>
          q.eq("eventId", args.eventId).eq("teamNumber", team.teamNumber),
        )
        .unique()
      const doc = { eventId: args.eventId, ...team }
      if (existing) {
        await ctx.db.patch(existing._id, doc)
      } else {
        await ctx.db.insert("teams", doc)
      }
    }

    for (const match of args.matches) {
      const existing = await ctx.db
        .query("matches")
        .withIndex("by_eventId_and_matchNumber", (q) =>
          q.eq("eventId", args.eventId).eq("matchNumber", match.matchNumber),
        )
        .unique()
      const doc = { eventId: args.eventId, ...match }
      if (existing) {
        await ctx.db.patch(existing._id, doc)
      } else {
        await ctx.db.insert("matches", doc)
      }
    }

    await ctx.db.patch(args.eventId, omitUndefined({
      name: args.eventName,
      importStatus: "ready",
      importMessage: `Imported ${args.teams.length} teams and ${args.matches.length} qualification matches`,
      importedAt: Date.now(),
    }))
  },
})

export const applyStatsRefresh = internalMutation({
  args: {
    eventId: v.id("events"),
    refreshedAt: v.number(),
    stats: v.array(
      v.object({
        teamNumber: v.number(),
        opr: v.optional(v.number()),
        dpr: v.optional(v.number()),
        ccwm: v.optional(v.number()),
        wins: v.optional(v.number()),
        losses: v.optional(v.number()),
        ties: v.optional(v.number()),
        averageRp: v.optional(v.number()),
        xp: v.optional(v.number()),
        xpSeason: v.optional(match13RatingValidator),
        xpAll: v.optional(match13RatingValidator),
        match13Epa: v.optional(v.number()),
        autoXp: v.optional(v.number()),
        teleopXp: v.optional(v.number()),
        endgameXp: v.optional(v.number()),
        predictedRp1: v.optional(v.number()),
        predictedRp2: v.optional(v.number()),
        predictedRp3: v.optional(v.number()),
        epa: v.optional(v.number()),
        autoEpa: v.optional(v.number()),
        teleopEpa: v.optional(v.number()),
        endgameEpa: v.optional(v.number()),
      }),
    ),
    predictions: v.array(
      v.object({
        matchNumber: v.number(),
        redWinProb: v.optional(v.number()),
        blueWinProb: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const stat of args.stats) {
      const existing = await ctx.db
        .query("externalStats")
        .withIndex("by_eventId_and_teamNumber", (q) =>
          q.eq("eventId", args.eventId).eq("teamNumber", stat.teamNumber),
        )
        .unique()
      const doc = { eventId: args.eventId, refreshedAt: args.refreshedAt, ...stat }
      if (existing) await ctx.db.patch(existing._id, doc)
      else await ctx.db.insert("externalStats", doc)
    }

    for (const prediction of args.predictions) {
      const existing = await ctx.db
        .query("winPredictions")
        .withIndex("by_eventId_and_matchNumber", (q) =>
          q.eq("eventId", args.eventId).eq("matchNumber", prediction.matchNumber),
        )
        .unique()
      const doc = {
        eventId: args.eventId,
        source: "statbotics",
        refreshedAt: args.refreshedAt,
        ...prediction,
      }
      if (existing) await ctx.db.patch(existing._id, doc)
      else await ctx.db.insert("winPredictions", doc)
    }

    await ctx.db.patch(args.eventId, { statsRefreshedAt: args.refreshedAt })
  },
})
