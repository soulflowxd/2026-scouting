"use node";

import { v } from "convex/values"
import { internal } from "./_generated/api"
import { action, internalAction } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { readEnv } from "./lib/env"
import { match13Stats, scopedMatch13Stats, type Match13Team } from "./lib/match13"
import { tbaAvatars } from "./lib/tbaAvatars"
import { eventTeamKeys, eventTeamNumber, eventTeamValue } from "./lib/tbaTeamKeys"
import { needsEventStats } from "./lib/demoTeams"

type TbaTeam = {
  key: string
  team_number: number
  nickname?: string
  city?: string
  state_prov?: string
  country?: string
}

export const robotPhotos = action({
  args: { eventId: v.id("events"), teamNumber: v.number() },
  handler: async (ctx, args): Promise<{ photos: { id: string; url: string }[] }> => {
    const context = await ctx.runQuery(internal.importData.photoContext, args)
    const key = readEnv("TBA_API_KEY")
    if (!key) throw new Error("TBA photos unavailable")
    const response = await fetch(`https://www.thebluealliance.com/api/v3/team/${encodeURIComponent(context.teamKey)}/media/${context.year}`, { headers: { "X-TBA-Auth-Key": key }, signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error("TBA photos unavailable")
    const media: unknown = await response.json()
    const photos: { id: string; url: string }[] = []
    if (Array.isArray(media)) for (const item of media) {
      if (item?.type !== "imgur" || typeof item.direct_url !== "string") continue
      try {
        const url = new URL(item.direct_url)
        if (url.protocol === "https:" && url.hostname === "i.imgur.com" && !url.username && !url.password && !url.port) photos.push({ id: `tba:${item.foreign_key}`, url: url.href })
      } catch { /* Ignore malformed media URLs. */ }
    }
    return { photos: photos.slice(0, 20) }
  },
})

type TbaEvent = {
  name?: string
  remap_teams?: Record<string, string> | null
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
      rank?: number
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
      internal.importData.beginImport,
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
            redTeams: match.alliances.red.team_keys.map(key => eventTeamNumber(key, event.remap_teams)),
            blueTeams: match.alliances.blue.team_keys.map(key => eventTeamNumber(key, event.remap_teams)),
            scheduledTime:
              match.actual_time ?? match.predicted_time ?? match.time,
          }),
        )

      await ctx.runMutation(internal.importData.applyEventImport, {
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
      await ctx.runMutation(internal.importData.markImportError, {
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
      teams: { teamNumber: number; tbaTeamKey: string; nickname?: string; eventTeamAlias?: string }[]
    } | null = await ctx.runQuery(internal.importData.getEventForRefresh, args)
    if (!eventData) throw new Error("Event not found")
    await ctx.scheduler.runAfter(0, internal.imports.refreshAvatarsInternal, args)

    const tbaKey = readEnv("TBA_API_KEY")
    const eventKey = eventData.eventKey
    // NTX is a manually maintained event, not a TBA event.
    const teamYearOnly = /^\d{4}ntx$/.test(eventKey)
    if (!tbaKey && !teamYearOnly) throw new Error("Missing TBA_API_KEY")
    const tbaHeaders = { "X-TBA-Auth-Key": tbaKey }
    const event: TbaEvent = teamYearOnly ? {} : await fetchJson<TbaEvent>(
      `https://www.thebluealliance.com/api/v3/event/${eventKey}`, tbaHeaders,
    )
    if (!teamYearOnly) await ctx.runMutation(internal.importData.applyTeamAliases, {
      eventId: args.eventId, remapping: event.remap_teams ?? {},
    })
    const eventOnlyTeams = new Set(eventData.teams.filter(team => needsEventStats(team) || eventTeamKeys(team.tbaTeamKey, event.remap_teams).some(key => /^frc\d+[a-z]$/i.test(key))).map(team => team.teamNumber))

    let oprs: {
      oprs?: Record<string, number>
      dprs?: Record<string, number>
      ccwms?: Record<string, number>
    } = {}
    try {
      if (teamYearOnly) throw new Error("No event OPRs")
      oprs = await fetchJson<{
        oprs?: Record<string, number>
        dprs?: Record<string, number>
        ccwms?: Record<string, number>
      }>(`https://www.thebluealliance.com/api/v3/event/${eventKey}/oprs`, tbaHeaders)
    } catch {
      oprs = {}
    }

    let rankings: NonNullable<TbaRankings["rankings"]> = []
    try {
      if (teamYearOnly) throw new Error("No event rankings")
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
        if (teamYearOnly) return { teamNumber: team.teamNumber, status: null }
        try {
          const status = await fetchJson<TbaStatus>(
            `https://www.thebluealliance.com/api/v3/team/${eventTeamKeys(team.tbaTeamKey, event.remap_teams)[0]}/event/${eventKey}/status`,
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
    const eligibleTeams = eventData.teams.filter(team => !teamYearOnly || (team.tbaTeamKey === `frc${team.teamNumber}` && !eventOnlyTeams.has(team.teamNumber)))
    const teamNumbers = new Set(eligibleTeams.map((team) => team.teamNumber))
    let statboticsTeamRows: StatboticsTeamEvent[] = []
    try {
      if (teamYearOnly) throw new Error("Use current-year team stats")
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
    if (statboticsTeamRows.length === 0 && !teamYearOnly) {
      statboticsTeamRows = await fetchStatboticsCsvRows(
        eventKey,
        statboticsYear,
        teamNumbers,
      )
    }
    const epaRows = await Promise.all(
      eventData.teams.map(async (team) => {
        if (!teamNumbers.has(team.teamNumber)) return { teamNumber: team.teamNumber, row: null }
        const batchRow =
          statboticsTeamRows.find(
            (row) => Number(row.team) === team.teamNumber && (!teamYearOnly || Number(row.year) === statboticsYear) && (!eventOnlyTeams.has(team.teamNumber) || (row.event === eventKey && Number(row.year) === statboticsYear)),
          ) ?? null
        if (batchRow) return { teamNumber: team.teamNumber, row: batchRow }
        try {
          if (teamYearOnly) throw new Error("Use team-year endpoint")
          const row = await fetchJson<StatboticsTeamEvent>(
            `https://api.statbotics.io/v3/team_event/${team.teamNumber}/${eventKey}`,
            statboticsHeaders,
          )
          return { teamNumber: team.teamNumber, row: eventOnlyTeams.has(team.teamNumber) && (row.event !== eventKey || Number(row.year) !== statboticsYear) ? null : row }
        } catch {
          if (eventOnlyTeams.has(team.teamNumber)) return { teamNumber: team.teamNumber, row: null }
          try {
            const row = statboticsYear
              ? await fetchJson<StatboticsTeamEvent>(
                  `https://api.statbotics.io/v3/team_year/${team.teamNumber}/${statboticsYear}`,
                  statboticsHeaders,
                )
              : null
            return { teamNumber: team.teamNumber, row: teamYearOnly && Number(row?.year) !== statboticsYear ? null : row }
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
      if (teamYearOnly) throw new Error("No event predictions")
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

    const match13Key = readEnv("MATCH13_API_KEY").trim()
    let match13Teams: Match13Team[] = []
    const scopedTeams: Record<"season" | "all", Map<number, Match13Team>> = {
      season: new Map(),
      all: new Map(),
    }
    if (match13Key) {
      const response = teamYearOnly ? null : await fetch(
        `https://actions.match13.com/v1/events/${encodeURIComponent(eventKey)}/teams`,
        {
          headers: { Authorization: `Bearer ${match13Key}` },
          signal: AbortSignal.timeout(30000),
        },
      )
      if (response?.ok) {
        const data = await response.json() as {
          eventKey: string
          year: number
          teams: Match13Team[]
        }
        if (data.eventKey !== eventKey || data.year !== statboticsYear) {
          throw new Error("Match13 returned data for a different event or year")
        }
        match13Teams = data.teams
      } else if (response && response.status !== 404) {
        throw new Error(`Match13 stats request failed (${response.status})`)
      }
      if (statboticsYear) {
        for (const scope of ["season", "all"] as const) {
          let page: number | null = 1
          let pagesRead = 0
          while (page !== null && pagesRead < 20) {
            const data: {
              year: number
              nextPage: number | null
              teams: (Match13Team & { year: number })[]
            } = await fetchJson<{
              year: number
              nextPage: number | null
              teams: (Match13Team & { year: number })[]
            }>(
              `https://actions.match13.com/v1/years/${statboticsYear}/teams?scope=${scope}&page=${page}&limit=1000`,
              { Authorization: `Bearer ${match13Key}` },
            )
            if (data.year !== statboticsYear) {
              throw new Error("Match13 returned ratings for a different year")
            }
            for (const row of data.teams) {
              if (row.year === statboticsYear && teamNumbers.has(row.teamNumber)) {
                if (eventOnlyTeams.has(row.teamNumber)) continue
                scopedTeams[scope].set(row.teamNumber, row)
              }
            }
            pagesRead += 1
            if (scopedTeams[scope].size === teamNumbers.size) break
            page = data.nextPage
          }
          if (page !== null && pagesRead === 20) {
            throw new Error("Match13 season pagination exceeded its safety limit")
          }
        }
      }
    }

    const refreshedAt = Date.now()
    await ctx.runMutation(internal.importData.applyStatsRefresh, {
      eventId: args.eventId,
      refreshedAt,
      teamYearOnly,
      stats: eventData.teams.map((team) => {
        const status = statuses.find(
          (item) => item.teamNumber === team.teamNumber,
        )?.status
        const teamKeys = eventTeamKeys(team.tbaTeamKey, event.remap_teams)
        const ranking = teamKeys.map(key => rankings.find(item => item.team_key === key)).find(Boolean)
        const epaRow = epaRows.find((item) => item.teamNumber === team.teamNumber)
          ?.row
        const epa = epaRow?.epa
        const record = ranking?.record ?? status?.qual?.ranking?.record
        const sortOrders =
          ranking?.sort_orders ?? status?.qual?.ranking?.sort_orders ?? []
        return omitUndefined({
          teamNumber: team.teamNumber,
          eventOnly: eventOnlyTeams.has(team.teamNumber),
          ...(teamYearOnly ? scopedMatch13Stats(scopedTeams.season.get(team.teamNumber)) : match13Stats(match13Teams.find((row) => row.teamNumber === team.teamNumber))),
          xpSeason: match13Key && !eventOnlyTeams.has(team.teamNumber) ? omitUndefined(scopedMatch13Stats(scopedTeams.season.get(team.teamNumber))) : undefined,
          xpAll: match13Key && !eventOnlyTeams.has(team.teamNumber) ? omitUndefined(scopedMatch13Stats(scopedTeams.all.get(team.teamNumber))) : undefined,
          opr: eventTeamValue(oprs.oprs, teamKeys),
          dpr: eventTeamValue(oprs.dprs, teamKeys),
          ccwm: eventTeamValue(oprs.ccwms, teamKeys),
          wins: record?.wins,
          eventRank: ranking?.rank ?? status?.qual?.ranking?.rank,
          losses: record?.losses,
          ties: record?.ties,
          averageRp: teamYearOnly ? undefined :
            nestedFiniteRecordNumber(epaRow, ["record", "qual", "rps_per_match"]) ??
            firstFiniteRecordNumber(epaRow, ["averageRp", "rps_per_match"]) ??
            (sortOrders.length > 0 ? sortOrders[0] : undefined),
          epa:
            nestedFiniteRecordNumber(epaRow, ["epa", "total_points"]) ??
            nestedFiniteRecordNumber(epaRow, ["epa", "total_points", "mean"]) ??
            epa?.total_points?.mean ??
            nestedFiniteRecordNumber(epaRow, ["epa", "breakdown", "total_points"]) ??
            nestedFiniteRecordNumber(epaRow, [
              "epa",
              "breakdown",
              "total_points",
              "mean",
            ]) ??
            firstFiniteRecordNumber(epaRow, [
              "totalEpa",
              "epa",
              "epa_total",
              "norm_epa",
              "epa_end",
              "epa_mean",
            ]),
          autoEpa:
            nestedFiniteRecordNumber(epaRow, ["epa", "auto_points"]) ??
            nestedFiniteRecordNumber(epaRow, ["epa", "auto_points", "mean"]) ??
            nestedFiniteRecordNumber(epaRow, ["epa", "breakdown", "auto_points"]) ??
            nestedFiniteRecordNumber(epaRow, [
              "epa",
              "breakdown",
              "auto_points",
              "mean",
            ]) ??
            epa?.auto_points?.mean ??
            firstFiniteRecordNumber(epaRow, [
              "autoEpa",
              "auto_epa",
              "epa_auto",
              "epa_auto_points",
            ]),
          teleopEpa:
            nestedFiniteRecordNumber(epaRow, ["epa", "teleop_points"]) ??
            nestedFiniteRecordNumber(epaRow, ["epa", "teleop_points", "mean"]) ??
            nestedFiniteRecordNumber(epaRow, ["epa", "breakdown", "teleop_points"]) ??
            nestedFiniteRecordNumber(epaRow, [
              "epa",
              "breakdown",
              "teleop_points",
              "mean",
            ]) ??
            epa?.teleop_points?.mean ??
            firstFiniteRecordNumber(epaRow, [
              "teleopEpa",
              "teleop_epa",
              "epa_teleop",
              "epa_teleop_points",
            ]),
          endgameEpa:
            nestedFiniteRecordNumber(epaRow, ["epa", "endgame_points"]) ??
            nestedFiniteRecordNumber(epaRow, ["epa", "endgame_points", "mean"]) ??
            nestedFiniteRecordNumber(epaRow, ["epa", "breakdown", "endgame_points"]) ??
            nestedFiniteRecordNumber(epaRow, [
              "epa",
              "breakdown",
              "endgame_points",
              "mean",
            ]) ??
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

export const refreshAvatarsInternal = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.runQuery(internal.importData.getEventForRefresh, args)
    if (!event) return null
    const key = readEnv("TBA_API_KEY")
    if (!key) return null
    // Avatar failures must not prevent stats or event imports from succeeding.
    let media: unknown
    try {
      media = await fetchJson<unknown>(`https://www.thebluealliance.com/api/v3/event/${event.eventKey}/team_media`, { "X-TBA-Auth-Key": key })
    } catch { return null }
    if (!Array.isArray(media)) return null
    const avatars = tbaAvatars(media)
    await ctx.runMutation(internal.importData.applyAvatars, { eventId: args.eventId, avatars: event.teams.map(team => ({ teamNumber: team.teamNumber, avatar: avatars.get(team.tbaTeamKey) })) })
    return null
  },
})
