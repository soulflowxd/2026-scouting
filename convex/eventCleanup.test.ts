/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { makeFunctionReference } from "convex/server"
import { expect, test } from "vitest"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
test("purge removes retired event data and photos while preserving NTX", async () => {
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    const retired = await ctx.db.insert("events", { eventKey: "2026new", importStatus: "ready", createdByToken: "admin" })
    const ntx = await ctx.db.insert("events", { eventKey: "2026ntx", importStatus: "ready", createdByToken: "admin" })
    const photo = await ctx.storage.store(new Blob(["photo"], { type: "image/png" }))
    for (const eventId of [retired, ntx]) {
      for (let i = 0; i < 60; i++) await ctx.db.insert("teams", { eventId, teamNumber: i, nickname: "Team", tbaTeamKey: `frc${i}` })
      await ctx.db.insert("pitReports", { eventId, teamNumber: 1, scoutToken: "scout", photoIds: eventId === retired ? [photo] : [], canScoreFuelHub: true, canIntakeDepot: true, canIntakeFloor: true, canPreload: false, preloadCount: 0, canClimbLevel1: false, canClimbLevel2: false, canClimbLevel3: false, canAutoClimbLevel1: false, canCrossBump: true, canCrossTrench: true, drivetrain: "Tank", notes: "", updatedAt: 1 })
    }
    return { retired, ntx, photo }
  })
  const purge = makeFunctionReference<"mutation">("eventCleanup:purgeBatch")
  await t.action(makeFunctionReference<"action">("eventCleanup:purgeEvent"), { eventKey: "2026new" })
  await t.run(async ctx => {
    expect(await ctx.db.get(ids.retired)).toBeNull()
    expect(await ctx.db.get(ids.ntx)).not.toBeNull()
    expect(await ctx.storage.getUrl(ids.photo)).toBeNull()
    const teams = await ctx.db.query("teams").take(100)
    expect(teams).toHaveLength(60)
    expect(teams.every(team => team.eventId === ids.ntx)).toBe(true)
    expect((await ctx.db.query("pitReports").take(10)).map(row => row.eventId)).toEqual([ids.ntx])
  })
  await expect(t.mutation(purge, { eventKey: "2026ntx", tableIndex: 0, cursor: null })).rejects.toThrow()
})
