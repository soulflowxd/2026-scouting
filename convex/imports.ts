import { v } from "convex/values"
import { internal } from "./_generated/api"
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { readEnv, readOptionalEnv } from "./lib/env"

type TbaTeam = {
  key: string
  team_number: number
  nickname?: string
  city?: string
  state_prov?: string
  country?: string
}

type TbaMatch = {
  key: string
  comp_level: string
  match_number: number
  time?: number
  predicted_time?: number
  actual_time?: number
  alliances: {
    red: { team_keys: string[] }
    blue: { team_keys: string[] }
  }
}

type TbaStatus = {
  qual?: {
    ranking?: {
      record?: { wins?: number; losses?: number; ties?: number }
      sort_orders?: number[]
    }
  }
}

type StatboticsTeamEvent = {
  epa?: {
    total_points?: { mean?: number }
    auto_points?: { mean?: number }
    teleop_points?: { mean?: number }
    endgame_points?: { mean?: number }
  }
}

function omitUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

function teamNumberFromKey(teamKey: string) {
  return Number(teamKey.replace(/^frc/, ""))
}

export const importEvent = action({
  args: { eventKey: v.string() },
  handler: async (ctx, args) => {
    const admin: { tokenIdentifier: string } = await ctx.runQuery(
      internal.members.currentAdmin,
      {},
    )
    const eventKey = args.eventKey.trim().toLowerCase()
    const tbaKey = readEnv("TBA_API_KEY")
    if (!tbaKey) throw new Error("Missing TBA_API_KEY")

    const eventId: Id<"events"> = await ctx.runMutation(
      internal.imports.beginImport,
      { eventKey, createdByToken: admin.tokenIdentifier },
    )

    try {
      const headers = { "X-TBA-Auth-Key": tbaKey }
      const [teams, matches] = await Promise.all([
        fetchJson<TbaTeam[]>(
          `https://www.thebluealliance.com/api/v3/event/${eventKey}/teams`,
          headers,
        ),
        fetchJson<TbaMatch[]>(
          `https://www.thebluealliance.com/api/v3/event/${eventKey}/matches/simple`,
          headers,
        ),
      ])

      const qualMatches = matches
        .filter((match) => match.comp_level === "qm")
        .map((match) =>
          omitUndefined({
            tbaMatchKey: match.key,
            matchNumber: match.match_number,
            redTeams: match.alliances.red.team_keys.map(teamNumberFromKey),
            blueTeams: match.alliances.blue.team_keys.map(teamNumberFromKey),
            scheduledTime:
              match.actual_time ?? match.predicted_time ?? match.time,
          }),
        )

      await ctx.runMutation(internal.imports.applyEventImport, {
        eventId,
        teams: teams.map((team) =>
          omitUndefined({
            tbaTeamKey: team.key,
            teamNumber: team.team_number,
            nickname: team.nickname ?? `Team ${team.team_number}`,
            city: team.city,
            stateProv: team.state_prov,
            country: team.country,
          }),
        ),
        matches: qualMatches,
      })

      await ctx.runAction(internal.imports.refreshStatsInternal, { eventId })
      return { eventId, teamCount: teams.length, matchCount: qualMatches.length }
    } catch (error) {
      await ctx.runMutation(internal.imports.markImportError, {
        eventId,
        message: error instanceof Error ? error.message : "Import failed",
      })
      throw error
    }
  },
})

export const refreshStats = action({
  args: { eventId: v.id("events") },
  handler: async (
    ctx,
    args,
  ): Promise<{ statsCount: number; predictionCount: number }> => {
    await ctx.runQuery(internal.members.currentAdmin, {})
    const result: { statsCount: number; predictionCount: number } =
      await ctx.runAction(internal.imports.refreshStatsInternal, args)
    return result
  },
})

export const refreshStatsInternal = internalAction({
  args: { eventId: v.id("events") },
  handler: async (
    ctx,
    args,
  ): Promise<{ statsCount: number; predictionCount: number }> => {
    const eventData: {
      eventKey: string
      teams: { teamNumber: number; tbaTeamKey: string }[]
    } | null = await ctx.runQuery(internal.imports.getEventForRefresh, args)
    if (!eventData) throw new Error("Event not found")

    const tbaKey = readEnv("TBA_API_KEY")
    if (!tbaKey) throw new Error("Missing TBA_API_KEY")
    const tbaHeaders = { "X-TBA-Auth-Key": tbaKey }
    const eventKey = eventData.eventKey

    const oprs = await fetchJson<{
      oprs?: Record<string, number>
      dprs?: Record<string, number>
      ccwms?: Record<string, number>
    }>(`https://www.thebluealliance.com/api/v3/event/${eventKey}/oprs`, tbaHeaders)

    const statuses = await Promise.all(
      eventData.teams.map(async (team) => {
        try {
          const status = await fetchJson<TbaStatus>(
            `https://www.thebluealliance.com/api/v3/team/${team.tbaTeamKey}/event/${eventKey}/status`,
            tbaHeaders,
          )
          return { teamNumber: team.teamNumber, status }
        } catch {
          return { teamNumber: team.teamNumber, status: null }
        }
      }),
    )

    const statboticsKey = readOptionalEnv("STATBOTICS_API_KEY")
    const statboticsHeaders: Record<string, string> = statboticsKey
      ? { Authorization: `Bearer ${statboticsKey}` }
      : {}

    const epaRows = await Promise.all(
      eventData.teams.map(async (team) => {
        try {
          const row = await fetchJson<StatboticsTeamEvent>(
            `https://api.statbotics.io/v3/team_event/${team.teamNumber}/${eventKey}`,
            statboticsHeaders,
          )
          return { teamNumber: team.teamNumber, row }
        } catch {
          return { teamNumber: team.teamNumber, row: null }
        }
      }),
    )

    let predictions: {
      matchNumber: number
      redWinProb?: number
      blueWinProb?: number
    }[] = []
    try {
      const rows = await fetchJson<Record<string, unknown>[]>(
        `https://api.statbotics.io/v3/event/${eventKey}/predictions`,
        statboticsHeaders,
      )
      predictions = rows
        .map((row) => {
          const matchNumber = Number(row.match_number ?? row.matchNumber)
          const redWinProb = Number(row.red_win_prob ?? row.redWinProb)
          const blueWinProb = Number(row.blue_win_prob ?? row.blueWinProb)
          return omitUndefined({
            matchNumber,
            redWinProb: Number.isFinite(redWinProb) ? redWinProb : undefined,
            blueWinProb: Number.isFinite(blueWinProb) ? blueWinProb : undefined,
          })
        })
        .filter((row) => Number.isFinite(row.matchNumber))
    } catch {
      // Statbotics predictions are optional; TBA import remains useful without them.
    }

    const refreshedAt = Date.now()
    await ctx.runMutation(internal.imports.applyStatsRefresh, {
      eventId: args.eventId,
      refreshedAt,
      stats: eventData.teams.map((team) => {
        const status = statuses.find(
          (item) => item.teamNumber === team.teamNumber,
        )?.status
        const epa = epaRows.find((item) => item.teamNumber === team.teamNumber)
          ?.row?.epa
        const record = status?.qual?.ranking?.record
        const sortOrders = status?.qual?.ranking?.sort_orders ?? []
        const teamKey = String(team.teamNumber)
        return omitUndefined({
          teamNumber: team.teamNumber,
          opr: oprs.oprs?.[teamKey],
          dpr: oprs.dprs?.[teamKey],
          ccwm: oprs.ccwms?.[teamKey],
          wins: record?.wins,
          losses: record?.losses,
          ties: record?.ties,
          averageRp: sortOrders.length > 1 ? sortOrders[1] : undefined,
          epa: epa?.total_points?.mean,
          autoEpa: epa?.auto_points?.mean,
          teleopEpa: epa?.teleop_points?.mean,
          endgameEpa: epa?.endgame_points?.mean,
        })
      }),
      predictions,
    })

    return {
      statsCount: eventData.teams.length,
      predictionCount: predictions.length,
    }
  },
})

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
      })
      return existing._id
    }
    return await ctx.db.insert("events", {
      eventKey: args.eventKey,
      importStatus: "importing",
      importMessage: "Importing event data",
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

    await ctx.db.patch(args.eventId, {
      importStatus: "ready",
      importMessage: `Imported ${args.teams.length} teams and ${args.matches.length} qualification matches`,
      importedAt: Date.now(),
    })
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
