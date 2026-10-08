/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { api } from "./_generated/api"

const modules = import.meta.glob("./**/*.ts")

test("picked status is shared, reversible and scoped to its event; details retain breakdown follow-ups", async () => {
  const t = convexTest(schema, modules)
  const scout = t.withIdentity({ tokenIdentifier: "scout", email: "scout@example.com" })
  const admin = t.withIdentity({ tokenIdentifier: "admin", email: "admin@example.com" })
  const other = t.withIdentity({ tokenIdentifier: "other", email: "other@example.com" })
  const { eventId, otherEventId } = await t.run(async (ctx) => {
    for (const token of ["scout", "other"]) await ctx.db.insert("members", { tokenIdentifier: token, role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    await ctx.db.insert("members", { tokenIdentifier: "admin", role: "admin", approvalStatus: "approved", lastSeenAt: 1 })
    const eventId = await ctx.db.insert("events", { eventKey: "one", importStatus: "empty", createdByToken: "scout" })
    const otherEventId = await ctx.db.insert("events", { eventKey: "two", importStatus: "empty", createdByToken: "scout" })
    for (const id of [eventId, otherEventId]) await ctx.db.insert("teams", { eventId: id, teamNumber: 127, nickname: "Test team", tbaTeamKey: "frc127" })
    await ctx.db.insert("breakdownFollowUps", { eventId, matchNumber: 1, teamNumber: 127, whatBroke: "Chain", cause: "Loose", repairStatus: "Fixed", notes: "", scoutToken: "scout", scoutName: "Scout", submittedAt: 1 })
    return { eventId, otherEventId }
  })
  await expect(scout.mutation(api.teams.setPicked, { eventId, teamNumber: 127, picked: true })).rejects.toThrow("Unauthorized")
  await admin.mutation(api.teams.setPicked, { eventId, teamNumber: 127, picked: true })
  await admin.mutation(api.teams.setPicked, { eventId, teamNumber: 127, picked: true })
  expect((await other.query(api.teams.list, { eventId }))[0].picked).toBe(true)
  expect((await other.query(api.teams.list, { eventId: otherEventId }))[0].picked).toBe(false)
  const detail = await other.query(api.teams.detail, { eventId, teamNumber: 127 })
  expect(detail?.breakdownFollowUps[0]).toMatchObject({ whatBroke: "Chain", repairStatus: "Fixed" })
  expect(detail?.picked).toBe(true)
  await expect(other.mutation(api.teams.setPicked, { eventId, teamNumber: 127, picked: false })).rejects.toThrow("Unauthorized")
  await admin.mutation(api.teams.setPicked, { eventId, teamNumber: 127, picked: false })
  expect((await scout.query(api.teams.detail, { eventId, teamNumber: 127 }))?.picked).toBe(false)
  await expect(t.mutation(api.teams.setPicked, { eventId, teamNumber: 127, picked: true })).rejects.toThrow("Not authenticated")
  await expect(admin.mutation(api.teams.setPicked, { eventId, teamNumber: 999, picked: true })).rejects.toThrow("Team not found")
})
