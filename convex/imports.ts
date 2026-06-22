import { v } from "convex/values"
import { internal } from "./_generated/api"
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { readEnv } from "./lib/env"

type TbaTeam = {
  key: string
  team_number: number
  nickname?: string
  city?: string
  state_prov?: string
  country?: string
}

type TbaEvent = {
  name?: string
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

type TbaRankings = {
  rankings?: {
    team_key: string
    rank?: number
    record?: { wins?: number; losses?: number; ties?: number }
    sort_orders?: number[]
  }[]
}

type StatboticsTeamEvent = Record<string, unknown> & {
  epa?: {
    total_points?: { mean?: number }
    auto_points?: { mean?: number }
    teleop_points?: { mean?: number }
    endgame_points?: { mean?: number }
  }
}

type StatboticsCsvRow = {
  team: number
  event?: string
  year?: number
  totalEpa?: number
  autoEpa?: number
  teleopEpa?: number
  endgameEpa?: number
  averageRp?: number
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

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`)
  return await response.text()
}

function teamNumberFromKey(teamKey: string) {
  return Number(teamKey.replace(/^frc/, ""))
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function nestedFiniteRecordNumber(
  row: Record<string, unknown> | null | undefined,
  path: string[],
) {
  let current: unknown = row
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return finiteNumber(current)
}

function firstFiniteRecordNumber(
  row: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  if (!row) return undefined
  for (const key of keys) {
    const value = finiteNumber(row[key])
    if (value !== undefined) return value
  }
  return undefined
}

function eventYear(eventKey: string) {
  const year = Number(eventKey.slice(0, 4))
  return Number.isInteger(year) ? year : null
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === "," && !quoted) {
      values.push(current)
      current = ""
    } else {
      current += char
    }
  }
  values.push(current)
  return values
}

function csvNumber(value: string | undefined) {
  if (!value || value === "NULL") return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function parseStatboticsTeamEventCsv(
  csv: string,
  eventKey: string,
  teamNumbers: Set<number>,
): StatboticsCsvRow[] {
  const [headerLine, ...lines] = csv.split(/\r?\n/)
  const headers = parseCsvLine(headerLine)
  const indexOf = (name: string) => headers.indexOf(name)
  const teamIndex = indexOf("team")
  const eventIndex = indexOf("event")
  const epaIndex = indexOf("epa_end")
  const autoIndex = indexOf("auto_epa_end")
  const teleopIndex = indexOf("teleop_epa_end")
  const endgameIndex = indexOf("endgame_epa_end")
  const rpIndex = indexOf("rps_per_match")
  const rows: StatboticsCsvRow[] = []
  for (const line of lines) {
    if (!line || !line.includes(eventKey)) continue
    const values = parseCsvLine(line)
    if (values[eventIndex] !== eventKey) continue
    const team = csvNumber(values[teamIndex])
    if (team === undefined || !teamNumbers.has(team)) continue
    rows.push({
      team,
      event: eventKey,
      totalEpa: csvNumber(values[epaIndex]),
      autoEpa: csvNumber(values[autoIndex]),
      teleopEpa: csvNumber(values[teleopIndex]),
      endgameEpa: csvNumber(values[endgameIndex]),
      averageRp: csvNumber(values[rpIndex]),
    })
  }
  return rows
}

function parseStatboticsTeamYearCsv(
  csv: string,
  year: number,
  teamNumbers: Set<number>,
): StatboticsCsvRow[] {
  const [headerLine, ...lines] = csv.split(/\r?\n/)
  const headers = parseCsvLine(headerLine)
  const indexOf = (name: string) => headers.indexOf(name)
  const yearIndex = indexOf("year")
  const teamIndex = indexOf("team")
  const epaIndex = indexOf("epa_end")
  const autoIndex = indexOf("auto_epa_end")
  const teleopIndex = indexOf("teleop_epa_end")
  const endgameIndex = indexOf("endgame_epa_end")
  const rows: StatboticsCsvRow[] = []
  for (const line of lines) {
    if (!line || !line.includes(`,${year},`)) continue
    const values = parseCsvLine(line)
    if (csvNumber(values[yearIndex]) !== year) continue
    const team = csvNumber(values[teamIndex])
    if (team === undefined || !teamNumbers.has(team)) continue
    rows.push({
      team,
      year,
      totalEpa: csvNumber(values[epaIndex]),
      autoEpa: csvNumber(values[autoIndex]),
      teleopEpa: csvNumber(values[teleopIndex]),
      endgameEpa: csvNumber(values[endgameIndex]),
    })
  }
  return rows
}

async function fetchStatboticsCsvRows(
  eventKey: string,
  year: number | null,
  teamNumbers: Set<number>,
) {
  try {
    const csv = await fetchText(
      "https://raw.githubusercontent.com/avgupta456/statbotics-csvs/main/v2/team_events.csv",
    )
    const rows = parseStatboticsTeamEventCsv(csv, eventKey, teamNumbers)
    if (rows.length > 0) return rows
  } catch {
    // REST remains primary; CSV archive is best-effort fallback.
  }
  if (!year) return []
  try {
    const csv = await fetchText(
      "https://raw.githubusercontent.com/avgupta456/statbotics-csvs/main/v2/team_years.csv",
    )
    return parseStatboticsTeamYearCsv(csv, year, teamNumbers)
  } catch {
    return []
  }
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
      const [event, teams, matches] = await Promise.all([
        fetchJson<TbaEvent>(
          `https://www.thebluealliance.com/api/v3/event/${eventKey}`,
          headers,
        ),
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
        eventName: event.name,
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

    let rankings: NonNullable<TbaRankings["rankings"]> = []
    try {
      const rankingData = await fetchJson<TbaRankings>(
        `https://www.thebluealliance.com/api/v3/event/${eventKey}/rankings`,
        tbaHeaders,
      )
      rankings = rankingData.rankings ?? []
    } catch {
      rankings = []
    }

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

    const statboticsHeaders: Record<string, string> = {}

    const statboticsYear = eventYear(eventKey)
    const teamNumbers = new Set(eventData.teams.map((team) => team.teamNumber))
    let statboticsTeamRows: StatboticsTeamEvent[] = []
    try {
      statboticsTeamRows = await fetchJson<StatboticsTeamEvent[]>(
        `https://api.statbotics.io/v3/team_events?event=${encodeURIComponent(eventKey)}&limit=1000`,
        statboticsHeaders,
      )
    } catch {
      try {
        statboticsTeamRows = statboticsYear
          ? await fetchJson<StatboticsTeamEvent[]>(
              `https://api.statbotics.io/v3/team_years?year=${statboticsYear}&limit=1000`,
              statboticsHeaders,
            )
          : []
      } catch {
        statboticsTeamRows = []
      }
    }
    if (statboticsTeamRows.length === 0) {
      statboticsTeamRows = await fetchStatboticsCsvRows(
        eventKey,
        statboticsYear,
        teamNumbers,
      )
    }
    const epaRows = await Promise.all(
      eventData.teams.map(async (team) => {
        const batchRow =
          statboticsTeamRows.find(
            (row) => Number(row.team) === team.teamNumber,
          ) ?? null
        if (batchRow) return { teamNumber: team.teamNumber, row: batchRow }
        try {
          const row = await fetchJson<StatboticsTeamEvent>(
            `https://api.statbotics.io/v3/team_event/${team.teamNumber}/${eventKey}`,
            statboticsHeaders,
          )
          return { teamNumber: team.teamNumber, row }
        } catch {
          try {
            const row = statboticsYear
              ? await fetchJson<StatboticsTeamEvent>(
                  `https://api.statbotics.io/v3/team_year/${team.teamNumber}/${statboticsYear}`,
                  statboticsHeaders,
                )
              : null
            return { teamNumber: team.teamNumber, row }
          } catch {
            return { teamNumber: team.teamNumber, row: null }
          }
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
        `https://api.statbotics.io/v3/matches?event=${encodeURIComponent(eventKey)}&limit=1000`,
        statboticsHeaders,
      )
      predictions = rows
        .map((row) => {
          const matchNumber = Number(row.match_number ?? row.matchNumber ?? row.qual)
          const redWinProb = Number(
            row.red_win_prob ??
              row.redWinProb ??
              row.epa_win_prob ??
              nestedFiniteRecordNumber(row, ["pred", "red_win_prob"]) ??
              nestedFiniteRecordNumber(row, ["pred", "redWinProb"]),
          )
          const blueWinProb = Number(
            row.blue_win_prob ??
              row.blueWinProb ??
              (Number.isFinite(redWinProb) ? 1 - redWinProb : undefined),
          )
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
        const ranking = rankings.find((item) => item.team_key === team.tbaTeamKey)
        const epaRow = epaRows.find((item) => item.teamNumber === team.teamNumber)
          ?.row
        const epa = epaRow?.epa
        const record = ranking?.record ?? status?.qual?.ranking?.record
        const sortOrders =
          ranking?.sort_orders ?? status?.qual?.ranking?.sort_orders ?? []
        const teamKey = team.tbaTeamKey
        return omitUndefined({
          teamNumber: team.teamNumber,
          opr: oprs.oprs?.[teamKey],
          dpr: oprs.dprs?.[teamKey],
          ccwm: oprs.ccwms?.[teamKey],
          wins: record?.wins,
          losses: record?.losses,
          ties: record?.ties,
          averageRp:
            nestedFiniteRecordNumber(epaRow, ["record", "qual", "rps_per_match"]) ??
            firstFiniteRecordNumber(epaRow, ["averageRp", "rps_per_match"]) ??
            (sortOrders.length > 0 ? sortOrders[0] : undefined),
          epa:
            nestedFiniteRecordNumber(epaRow, ["epa", "total_points"]) ??
            epa?.total_points?.mean ??
            nestedFiniteRecordNumber(epaRow, ["epa", "breakdown", "total_points"]) ??
            firstFiniteRecordNumber(epaRow, [
              "totalEpa",
              "epa",
              "epa_total",
              "norm_epa",
              "epa_end",
              "epa_mean",
            ]),
          autoEpa:
            nestedFiniteRecordNumber(epaRow, ["epa", "breakdown", "auto_points"]) ??
            epa?.auto_points?.mean ??
            firstFiniteRecordNumber(epaRow, [
              "autoEpa",
              "auto_epa",
              "epa_auto",
              "epa_auto_points",
            ]),
          teleopEpa:
            nestedFiniteRecordNumber(epaRow, ["epa", "breakdown", "teleop_points"]) ??
            epa?.teleop_points?.mean ??
            firstFiniteRecordNumber(epaRow, [
              "teleopEpa",
              "teleop_epa",
              "epa_teleop",
              "epa_teleop_points",
            ]),
          endgameEpa:
            nestedFiniteRecordNumber(epaRow, ["epa", "breakdown", "endgame_points"]) ??
            epa?.endgame_points?.mean ??
            firstFiniteRecordNumber(epaRow, [
              "endgameEpa",
              "endgame_epa",
              "epa_endgame",
              "epa_endgame_points",
            ]),
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
