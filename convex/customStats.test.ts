/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import { internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

test.each(["2026ntx", "2026txmck"])("%s refresh uses only selected-year team stats and clears unavailable event fields", async (eventKey) => {
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    const id = await ctx.db.insert("events", { eventKey, importStatus: "ready", createdByToken: "manual:test" })
    for (const [teamNumber, tbaTeamKey] of [[9128, "frc9128"], [10340, "frc10340"], [99001, "frc1745S"], [9992, "frc9992"]] as const) {
      await ctx.db.insert("teams", { eventId: id, teamNumber, tbaTeamKey, nickname: "Test" })
      await ctx.db.insert("externalStats", { eventId: id, teamNumber, epa: 999, averageRp: 3, eventRank: 1, refreshedAt: 1 })
    }
    return id
  })
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/rankings/TXMCK")) return new Response(JSON.stringify({ Rankings: [
      { teamNumber: 9128, rank: 2, sortOrder1: 4.5, matchesPlayed: 2, wins: 2, losses: 0, ties: 0 },
    ] }))
    if (url.includes("/years/2026/teams?")) return new Response(JSON.stringify({ year: 2026, nextPage: null, teams: [
      { teamNumber: 9128, year: 2026, xp: url.includes("scope=season") ? 40 : 45 },
      { teamNumber: 10340, year: 2025, xp: 88 },
      { teamNumber: 9992, year: 2026, xp: 99 },
    ] }))
    if (url.includes("/team_years?")) return new Response(JSON.stringify([{ team: 9128, year: 2026, epa: { total_points: { mean: 42 } }, record: { qual: { rps_per_match: 3 } } }, { team: 10340, year: 2025, epa: { total_points: { mean: 88 } } }]))
    if (url.includes("/team_year/10340/2026")) return new Response(JSON.stringify({ team: 10340, year: 2025, epa: { total_points: { mean: 88 } } }))
    throw new Error(`Unexpected external request: ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("TBA_API_KEY", "")
  vi.stubEnv("MATCH13_API_KEY", "test")
  vi.stubEnv("FIRST_API_USERNAME", "test")
  vi.stubEnv("FIRST_API_AUTH_TOKEN", "test")
  try {
    expect(await t.action(internal.imports.refreshStatsInternal, { eventId })).toEqual({ statsCount: 4, predictionCount: 0 })
    const stats = await t.run(ctx => ctx.db.query("externalStats").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(10))
    expect(stats.find(row => row.teamNumber === 9128)?.epa).toBe(42)
    expect(stats.find(row => row.teamNumber === 9128)).toMatchObject({ xp: 40, xpSeason: { xp: 40 }, xpAll: { xp: 45 } })
    expect(stats.filter(row => row.teamNumber !== 9128).every(row => row.xp === undefined)).toBe(true)
    if (eventKey === "2026txmck") {
      expect(stats.find(row => row.teamNumber === 9128)).toMatchObject({ averageRp: 4.5, eventRank: 2, wins: 2 })
    } else {
      expect(stats.every(row => row.averageRp === undefined && row.eventRank === undefined)).toBe(true)
    }
    expect(stats.filter(row => row.teamNumber !== 9128).every(row => row.epa === undefined)).toBe(true)
    expect(fetchMock.mock.calls.every(([url]) => !url.includes("thebluealliance") && !url.includes("team_event") && !url.includes("99001") && !url.includes("1745"))).toBe(true)
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})

test("FIRST rankings preserve EPA/xP, stay event-scoped, and retain posted RP during outages", async () => {
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    const id = await ctx.db.insert("events", { eventKey: "2026txmck", importStatus: "ready", createdByToken: "test" })
    await ctx.db.insert("teams", { eventId: id, teamNumber: 10340, nickname: "ITKAN Girls", tbaTeamKey: "frc10340" })
    await ctx.db.insert("externalStats", { eventId: id, teamNumber: 10340, epa: 42, xp: 45, xpSeason: { xp: 45 }, xpAll: { xp: 50 }, refreshedAt: 1 })
    return id
  })
  let rankings: unknown[] = [
    { teamNumber: 10340, rank: 1, sortOrder1: 4.67, matchesPlayed: 3, wins: 3, losses: 0, ties: 0 },
    { teamNumber: 9128, rank: 2, sortOrder1: 3, matchesPlayed: 3, wins: 2, losses: 1, ties: 0 },
  ]
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Rankings: rankings }))))
  vi.stubEnv("FIRST_API_USERNAME", "test")
  vi.stubEnv("FIRST_API_AUTH_TOKEN", "test")
  try {
    expect(await t.action(internal.firstRankings.refreshEvent, { eventId })).toBe(2)
    rankings = []
    expect(await t.action(internal.firstRankings.refreshEvent, { eventId })).toBe(0)
    await t.mutation(internal.importData.applyStatsRefresh, { eventId, refreshedAt: 2, teamYearOnly: true, stats: [{ teamNumber: 10340, epa: 43, xp: 46, xpSeason: { xp: 46 }, xpAll: { xp: 51 } }], predictions: [] })
    const stats = await t.run(ctx => ctx.db.query("externalStats").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(10))
    expect(stats).toHaveLength(1)
    expect(stats[0]).toMatchObject({ teamNumber: 10340, averageRp: 4.67, eventRank: 1, epa: 43, xp: 46, xpSeason: { xp: 46 }, xpAll: { xp: 51 } })
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})
