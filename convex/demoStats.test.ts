/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"
import { needsEventStats } from "./lib/demoTeams"
const modules = import.meta.glob("./**/*.ts")

test("demo stats hide old season imports and use verified event xP in both scopes", async () => {
  expect(needsEventStats({ teamNumber: 9994 })).toBe(true)
  expect(needsEventStats({ teamNumber: 10014 })).toBe(false)
  expect(needsEventStats({ tbaTeamKey: "frc1745S" })).toBe(true)
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    const id = await ctx.db.insert("events", { eventKey: "2026test", importStatus: "ready", createdByToken: "test" })
    await ctx.db.insert("teams", { eventId: id, teamNumber: 9988, tbaTeamKey: "frc9988", nickname: "Off-Season Demo Team 9988" })
    await ctx.db.insert("externalStats", { eventId: id, teamNumber: 9988, epa: 99, xp: 99, xpSeason: { xp: 88 }, xpAll: { xp: 77 }, refreshedAt: 1 })
    return id
  })
  for (const xpScope of ["season", "all"] as const) {
    expect((await t.query(api.teams.list, { eventId, xpScope }))[0].epa).toBeUndefined()
    expect((await t.query(api.teams.list, { eventId, xpScope }))[0].xp).toBeUndefined()
    expect((await t.query(api.teams.detail, { eventId, teamNumber: 9988, xpScope }))?.stats).toBeNull()
  }
  await t.mutation(internal.importData.applyStatsRefresh, { eventId, refreshedAt: 2, stats: [{ teamNumber: 9988, eventOnly: true, epa: 12, xp: 13 }], predictions: [] })
  for (const xpScope of ["season", "all"] as const) {
    expect((await t.query(api.teams.list, { eventId, xpScope }))[0]).toMatchObject({ epa: 12, xp: 13 })
    expect((await t.query(api.teams.detail, { eventId, teamNumber: 9988, xpScope }))?.stats).toMatchObject({ epa: 12, xp: 13 })
  }
  expect((await t.run(ctx => ctx.db.query("externalStats").take(1)))[0].xpAll).toBeUndefined()
})
