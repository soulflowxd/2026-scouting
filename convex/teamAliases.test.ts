/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

test("refresh exposes B-team aliases while preserving demo numbers and event isolation", async () => {
  const t = convexTest(schema, modules)
  const [eventId, otherEventId] = await t.run(async ctx => {
    const first = await ctx.db.insert("events", { eventKey: "2026test", importStatus: "ready", createdByToken: "test" })
    const second = await ctx.db.insert("events", { eventKey: "2026other", importStatus: "ready", createdByToken: "test" })
    for (const id of [first, second]) await ctx.db.insert("teams", { eventId: id, tbaTeamKey: "frc9988", teamNumber: 9988, nickname: "Demo" })
    return [first, second]
  })
  await t.mutation(internal.importData.applyTeamAliases, { eventId, remapping: { frc9988: "frc5414B" } })
  expect(await t.query(api.teams.list, { eventId })).toMatchObject([{ teamNumber: 9988, eventTeamAlias: "5414B" }])
  expect((await t.query(api.teams.list, { eventId: otherEventId }))[0].eventTeamAlias).toBeUndefined()
  await t.mutation(internal.importData.applyTeamAliases, { eventId, remapping: {} })
  expect((await t.query(api.teams.list, { eventId }))[0].eventTeamAlias).toBeUndefined()
})
