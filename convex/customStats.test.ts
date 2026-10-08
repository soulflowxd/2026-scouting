/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import { internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

test("NTX refresh uses only selected-year team stats and clears unavailable event fields", async () => {
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    const id = await ctx.db.insert("events", { eventKey: "2026ntx", importStatus: "ready", createdByToken: "manual:test" })
    for (const [teamNumber, tbaTeamKey] of [[9128, "frc9128"], [10340, "frc10340"], [99001, "frc1745S"]] as const) {
      await ctx.db.insert("teams", { eventId: id, teamNumber, tbaTeamKey, nickname: "Test" })
      await ctx.db.insert("externalStats", { eventId: id, teamNumber, epa: 999, averageRp: 3, eventRank: 1, refreshedAt: 1 })
    }
    return id
  })
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/team_years?")) return new Response(JSON.stringify([{ team: 9128, year: 2026, epa: { total_points: { mean: 42 } }, record: { qual: { rps_per_match: 3 } } }, { team: 10340, year: 2025, epa: { total_points: { mean: 88 } } }]))
    if (url.includes("/team_year/10340/2026")) return new Response(JSON.stringify({ team: 10340, year: 2025, epa: { total_points: { mean: 88 } } }))
    throw new Error(`Unexpected external request: ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("TBA_API_KEY", "")
  vi.stubEnv("MATCH13_API_KEY", "")
  try {
    expect(await t.action(internal.imports.refreshStatsInternal, { eventId })).toEqual({ statsCount: 3, predictionCount: 0 })
    const stats = await t.run(ctx => ctx.db.query("externalStats").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(10))
    expect(stats.find(row => row.teamNumber === 9128)?.epa).toBe(42)
    expect(stats.every(row => row.averageRp === undefined && row.eventRank === undefined)).toBe(true)
    expect(stats.filter(row => row.teamNumber !== 9128).every(row => row.epa === undefined)).toBe(true)
    expect(fetchMock.mock.calls.every(([url]) => !url.includes("thebluealliance") && !url.includes("team_event") && !url.includes("99001") && !url.includes("1745"))).toBe(true)
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})
