/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"
const modules = import.meta.glob("./**/*.ts")

test("NTX correction labels second robots and archives only the duplicate without losing data", async () => {
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    const id = await ctx.db.insert("events", { eventKey: "2026ntx", importStatus: "ready", createdByToken: "test" })
    for (const [teamNumber, alias] of [[99001, "1745S"], [99002, "2718B"], [99003, "5829B"], [99004, "10014R"], [9994, "9994"]] as const) await ctx.db.insert("teams", { eventId: id, teamNumber, tbaTeamKey: `frc${alias}`, nickname: alias })
    await ctx.db.insert("mashVotes", { eventId: id, ownerToken: "test", left: 99004, right: 9994, winner: 99004 })
    return id
  })
  await t.mutation(internal.ntxRoster.correctSecondRobots, {})
  await t.mutation(internal.ntxRoster.correctSecondRobots, {})
  const teams = await t.query(api.teams.list, { eventId })
  expect(teams.map(team => team.eventTeamAlias)).toEqual(["1745S", "2718B", "5829B", "10014R"])
  expect(await t.run(ctx => ctx.db.query("mashVotes").take(5))).toHaveLength(1)
  expect(await t.run(ctx => ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId).eq("teamNumber", 9994)).unique())).toMatchObject({ mergedIntoTeamNumber: 99004 })
})
