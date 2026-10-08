/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"
const modules = import.meta.glob("./**/*.ts")

test("only admins control event submissions; new events start closed and can reopen", async () => {
  const t = convexTest(schema, modules)
  await t.run(async ctx => {
    for (const [tokenIdentifier, role] of [["admin", "admin"], ["scout", "scout"]] as const) await ctx.db.insert("members", { tokenIdentifier, role, approvalStatus: "approved", lastSeenAt: 1 })
  })
  const admin = t.withIdentity({ tokenIdentifier: "admin" })
  const scout = t.withIdentity({ tokenIdentifier: "scout" })
  const eventId = await admin.mutation(api.events.createOrSelect, { eventKey: "2026test" })
  expect((await t.query(api.events.list, {}))[0].scoutingEnabled).toBe(false)
  await expect(scout.mutation(api.events.setScoutingEnabled, { eventId, enabled: true })).rejects.toThrow()
  const args = { eventId, matchNumber: 1, teamNumber: 1 }
  await expect(scout.mutation(api.matchScouting.claimRobot, args)).rejects.toThrow("closed")
  await admin.mutation(api.events.setScoutingEnabled, { eventId, enabled: true })
  expect((await t.query(api.events.list, {}))[0].scoutingEnabled).toBe(true)
  await admin.mutation(api.events.setScoutingEnabled, { eventId, enabled: false })
  await expect(admin.mutation(api.matchScouting.claimRobot, args)).rejects.toThrow("closed")
  await admin.mutation(api.events.createOrSelect, { eventKey: "2026test" })
  expect((await t.query(api.events.list, {}))[0].scoutingEnabled).toBe(false)
})
