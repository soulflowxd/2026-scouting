"use node"

import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalAction, type ActionCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { firstEventReference, firstJson, firstRecord, firstTimestamp } from "./lib/firstApi"
import { firstStations, parseFirstResult } from "./lib/firstMatchResult"

type FirstImport = {
  eventName: string; firstEventCode: string; firstTimezone?: string
  teams: { teamNumber: number; tbaTeamKey: string; nickname: string; city?: string; stateProv?: string; country?: string }[]
  matches: { matchNumber: number; tbaMatchKey: string; redTeams: number[]; blueTeams: number[]; scheduledTime?: number }[]
}
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined

export async function fetchFirstImport(eventKey: string, firstEventCode: string): Promise<FirstImport> {
  const reference = firstEventReference({ eventKey, firstEventCode })
  if (!reference) throw new Error("Invalid FIRST event")
  const { year, code } = reference
  const [eventData, firstPage, scheduleData] = await Promise.all([
    firstJson(`${year}/events?eventCode=${code}`),
    firstJson(`${year}/teams?eventCode=${code}&page=1`),
    firstJson(`${year}/schedule/${code}?tournamentLevel=Qualification`),
  ])
  const events = firstRecord(eventData).Events
  const event = firstRecord(Array.isArray(events) ? events.find(row => firstRecord(row).code === code) : null)
  const eventName = text(event.name)
  if (!eventName) throw new Error("FIRST event not found")
  const page = firstRecord(firstPage)
  const pageTotal = page.pageTotal
  if (!Array.isArray(page.teams) || typeof pageTotal !== "number" || !Number.isInteger(pageTotal) || pageTotal < 1 || pageTotal > 10 || page.pageCurrent !== 1) throw new Error("Invalid FIRST roster response")
  const rows = [...page.teams]
  for (let number = 2; number <= pageTotal; number++) {
    const next = firstRecord(await firstJson(`${year}/teams?eventCode=${code}&page=${number}`))
    if (!Array.isArray(next.teams) || next.pageCurrent !== number || next.pageTotal !== pageTotal) throw new Error("Incomplete FIRST roster")
    rows.push(...next.teams)
  }
  const teams: FirstImport["teams"] = rows.map(raw => {
    const row = firstRecord(raw)
    if (typeof row.teamNumber !== "number" || !Number.isInteger(row.teamNumber) || row.teamNumber <= 0) throw new Error("Invalid FIRST team")
    return { teamNumber: row.teamNumber, tbaTeamKey: `frc${row.teamNumber}`, nickname: text(row.nameShort) ?? `Team ${row.teamNumber}`,
      ...(text(row.city) ? { city: text(row.city) } : {}), ...(text(row.stateProv) ? { stateProv: text(row.stateProv) } : {}), ...(text(row.country) ? { country: text(row.country) } : {}) }
  })
  const roster = new Set(teams.map(team => team.teamNumber))
  if (!teams.length || teams.length > 500 || roster.size !== teams.length || (typeof page.teamCountTotal === "number" && teams.length !== page.teamCountTotal)) throw new Error("Incomplete FIRST roster")
  const schedule = firstRecord(scheduleData).Schedule
  if (schedule !== null && !Array.isArray(schedule)) throw new Error("Invalid FIRST schedule response")
  const matches: FirstImport["matches"] = (schedule ?? []).map((raw: unknown) => {
    const row = firstRecord(raw), stations = firstStations(row.teams)
    if (row.tournamentLevel !== "Qualification" || typeof row.matchNumber !== "number" || !Number.isInteger(row.matchNumber) || row.matchNumber <= 0 || !stations || [...stations.redTeams, ...stations.blueTeams].some(team => !roster.has(team))) throw new Error("Invalid FIRST qualification schedule")
    const scheduledTime = firstTimestamp(row.startTime, event.timezone)
    return { matchNumber: row.matchNumber, tbaMatchKey: `first:${eventKey}:qm${row.matchNumber}`, ...stations, ...(scheduledTime !== undefined ? { scheduledTime } : {}) }
  })
  if (matches.length > 500 || new Set(matches.map(match => match.matchNumber)).size !== matches.length) throw new Error("Invalid FIRST qualification schedule")
  return { eventName, firstEventCode: code, ...(text(event.timezone) ? { firstTimezone: text(event.timezone) } : {}), teams, matches }
}

// Independent requests preserve posted scores when detailed scoring is delayed.
export async function syncFirstEvent(ctx: ActionCtx, eventId: Id<"events">, refreshSchedule = false): Promise<number> {
  const event = await ctx.runQuery(internal.importData.getEventForRefresh, { eventId })
  const reference = event && firstEventReference(event)
  if (!event || !reference) return 0
  if (refreshSchedule || !event.firstScheduleCheckedAt || Date.now() - event.firstScheduleCheckedAt > 5 * 60_000) {
    try {
      const data = await fetchFirstImport(event.eventKey, reference.code)
      await ctx.runMutation(internal.importData.applyEventImport, { eventId, ...data })
    } catch { console.warn("FIRST roster/schedule refresh unavailable; keeping saved event data") }
  }
  const [results, scoring] = await Promise.allSettled([
    firstJson(`${reference.year}/matches/${reference.code}?tournamentLevel=Qualification`),
    firstJson(`${reference.year}/scores/${reference.code}/Qualification`),
  ])
  if (results.status !== "fulfilled") throw new Error("FIRST match results unavailable")
  const rows = firstRecord(results.value).Matches
  if (rows !== null && !Array.isArray(rows)) throw new Error("Invalid FIRST match results")
  const rawDetails = scoring.status === "fulfilled" ? firstRecord(scoring.value).MatchScores : []
  const details = Array.isArray(rawDetails) ? rawDetails.map(firstRecord) : []
  const matches: Doc<"matches">[] = await ctx.runQuery(internal.firstMatchData.forEvent, { eventId })
  let count = 0
  for (const row of (rows ?? []).slice(0, 500)) {
    const match = matches.find(match => match.matchNumber === firstRecord(row).matchNumber)
    if (!match || match.tbaMatchKey !== `first:${event.eventKey}:qm${match.matchNumber}`) continue
    const result = parseFirstResult(row, details.find(detail => detail.matchNumber === match.matchNumber && detail.matchLevel === "Qualification"), match, reference.year)
    if (!result) continue
    // A scoring outage must not erase previously verified autonomous data.
    const merged = { red: { ...match.tbaResult?.red, ...result.red }, blue: { ...match.tbaResult?.blue, ...result.blue } }
    const unchanged = (["red", "blue"] as const).every(side => Object.entries(merged[side]).every(([key, value]) => firstRecord(match.tbaResult?.[side])[key] === value))
    if (match.completionAssignments !== undefined && match.officialResultSource === "first" && unchanged) continue
    await ctx.runMutation(internal.tbaMatches.applyResult, { matchId: match._id, result: merged, source: "first" })
    count++
  }
  return count
}

export const refreshEvent = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<number> => syncFirstEvent(ctx, eventId, true),
})

export const refreshAll = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const events = await ctx.runQuery(internal.importData.firstEvents, {})
    let count = 0
    for (const event of events) {
      try { count += await syncFirstEvent(ctx, event._id) }
      catch { console.warn("FIRST match refresh unavailable; keeping posted results") }
    }
    return count
  },
})
