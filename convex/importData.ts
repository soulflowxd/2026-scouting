import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { match13RatingValidator } from "./lib/match13"
import { requireApprovedUserFromDb } from "./lib/authz"
import { firstEventReference } from "./lib/firstApi"
import { needsEventStats } from "./lib/demoTeams"

export const photoContext = internalQuery({
  args: { eventId: v.id("events"), teamNumber: v.number() },
  handler: async (ctx, args) => {
    await requireApprovedUserFromDb(ctx)
    const event = await ctx.db.get(args.eventId)
    const team = await ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).unique()
    if (!event || !team) throw new Error("Team not found in event")
    const year = Number(event.eventKey.slice(0, 4))
    if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new Error("Invalid event year")
    return { year, teamKey: team.tbaTeamKey }
  },
})

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
      firstEventCode: event.firstEventCode,
      firstTimezone: event.firstTimezone,
      firstScheduleCheckedAt: event.firstScheduleCheckedAt,
      teams: teams.map((team) => ({
        nickname: team.nickname,
        eventTeamAlias: team.eventTeamAlias,
        teamNumber: team.teamNumber,
        tbaTeamKey: team.tbaTeamKey,
      })),
    }
  },
})

export const applyTeamAliases = internalMutation({
  args: { eventId: v.id("events"), remapping: v.record(v.string(), v.string()) },
  handler: async (ctx, args) => {
    const teams = await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).take(500)
    for (const team of teams) {
      const mapped = args.remapping[team.tbaTeamKey]
      const eventTeamAlias = mapped && /^frc\d+[A-Za-z]+$/.test(mapped) ? mapped.slice(3) : undefined
      if (team.eventTeamAlias !== eventTeamAlias) await ctx.db.patch(team._id, { eventTeamAlias })
    }
    return null
  },
})

export const applyAvatars = internalMutation({
  args: { eventId: v.id("events"), avatars: v.array(v.object({ teamNumber: v.number(), avatar: v.optional(v.string()) })) },
  handler: async (ctx, args) => {
    if (args.avatars.length > 500) throw new Error("Too many avatars")
    for (const avatar of args.avatars) {
      const team = await ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", avatar.teamNumber)).unique()
      if (team) await ctx.db.patch(team._id, { avatar: avatar.avatar })
    }
    return null
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
      scoutingEnabled: false,
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
    firstEventCode: v.optional(v.string()),
    firstTimezone: v.optional(v.string()),
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
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error("Event not found")
    const officialNtx = event.eventKey === "2026ntx" && args.firstEventCode === "TXMCK1"
    if (officialNtx) {
      const existingTeams = await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).take(500)
      for (const team of existingTeams) {
        if (team.eventTeamAlias && !args.teams.some(row => row.teamNumber === team.teamNumber)) {
          await ctx.db.patch(team._id, { rosterArchived: true })
        }
      }
    }
    for (const team of args.teams) {
      const existing = await ctx.db
        .query("teams")
        .withIndex("by_eventId_and_teamNumber", (q) =>
          q.eq("eventId", args.eventId).eq("teamNumber", team.teamNumber),
        )
        .unique()
      const doc = { eventId: args.eventId, ...team, ...(officialNtx ? { rosterArchived: false } : {}) }
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
      firstEventCode: args.firstEventCode,
      firstTimezone: args.firstTimezone,
      firstScheduleCheckedAt: args.firstEventCode ? Date.now() : undefined,
      importStatus: "ready",
      importMessage: `Imported ${args.teams.length} teams and ${args.matches.length} qualification matches`,
      importedAt: Date.now(),
    }))
  },
})

export const firstEvents = internalQuery({
  args: {},
  handler: async ctx => {
    const events = await ctx.db.query("events").withIndex("by_firstEventCode", q => q.gt("firstEventCode", "")).take(50)
    const legacy = await ctx.db.query("events").withIndex("by_eventKey", q => q.eq("eventKey", "2026txmck")).unique()
    if (legacy && !events.some(event => event._id === legacy._id)) events.push(legacy)
    return events.filter(event => firstEventReference(event))
  },
})

export const firstEventCodeForKey = internalQuery({
  args: { eventKey: v.string() },
  handler: async (ctx, { eventKey }) => {
    const event = await ctx.db.query("events").withIndex("by_eventKey", q => q.eq("eventKey", eventKey)).unique()
    return event ? firstEventReference(event)?.code ?? null : null
  },
})

export const applyFirstRankings = internalMutation({
  args: {
    eventId: v.id("events"),
    rankings: v.array(v.object({ teamNumber: v.number(), eventRank: v.number(), averageRp: v.number(), wins: v.number(), losses: v.number(), ties: v.number() })),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event || !firstEventReference(event)) throw new Error("Unsupported FIRST event")
    for (const ranking of args.rankings) {
      const team = await ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", ranking.teamNumber)).unique()
      if (!team) continue
      const stat = await ctx.db.query("externalStats").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", ranking.teamNumber)).unique()
      // Rankings refresh independently of EPA/xP; never replace their snapshot.
      const eventOnly = needsEventStats(team)
      const verified = { eventId: args.eventId, refreshedAt: Date.now(), ...ranking, ...(eventOnly ? { eventOnly: true } : {}) }
      if (stat && eventOnly && !stat.eventOnly) await ctx.db.replace(stat._id, verified)
      else if (stat) await ctx.db.patch(stat._id, { ...ranking, ...(eventOnly ? { eventOnly: true } : {}) })
      else await ctx.db.insert("externalStats", verified)
    }
    return null
  },
})

export const applyStatsRefresh = internalMutation({
  args: {
    eventId: v.id("events"),
    refreshedAt: v.number(),
    teamYearOnly: v.optional(v.boolean()),
    stats: v.array(
      v.object({
        teamNumber: v.number(),
        opr: v.optional(v.number()),
        eventOnly: v.optional(v.boolean()),
        dpr: v.optional(v.number()),
        ccwm: v.optional(v.number()),
        wins: v.optional(v.number()),
        losses: v.optional(v.number()),
        ties: v.optional(v.number()),
        averageRp: v.optional(v.number()),
        eventRank: v.optional(v.number()),
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
    const event = await ctx.db.get(args.eventId)
    const firstEvent = event && firstEventReference(event)
    for (const stat of args.stats) {
      const existing = await ctx.db
        .query("externalStats")
        .withIndex("by_eventId_and_teamNumber", (q) =>
          q.eq("eventId", args.eventId).eq("teamNumber", stat.teamNumber),
        )
        .unique()
      const doc = omitUndefined({
        eventId: args.eventId, refreshedAt: args.refreshedAt, ...stat,
        ...(firstEvent && existing ? {
          averageRp: existing.averageRp, eventRank: existing.eventRank,
          wins: existing.wins, losses: existing.losses, ties: existing.ties,
        } : {}),
      })
      // Replace custom-event snapshots so unavailable season/event fields cannot
      // survive from an earlier import and masquerade as NTX results.
      if (existing && (args.teamYearOnly || stat.eventOnly)) await ctx.db.replace(existing._id, doc)
      else if (existing) await ctx.db.patch(existing._id, doc)
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
