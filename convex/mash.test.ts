/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"
import { ratings } from "../src/lib/mash-ratings"

const modules = import.meta.glob("./**/*.ts")
test("approved scouts share event Elo and cannot undo another scout's vote", async () => {
  const t = convexTest(schema, modules)
  const [eventId, otherId] = await t.run(async ctx => {
    const ids = []
    for (const eventKey of ["2026ntx", "2026test"]) {
      const id = await ctx.db.insert("events", { eventKey, importStatus: "ready", createdByToken: "admin" })
      for (const teamNumber of [9128, 10340]) await ctx.db.insert("teams", { eventId: id, teamNumber, tbaTeamKey: `frc${teamNumber}`, nickname: "Test" })
      ids.push(id)
    }
    for (const tokenIdentifier of ["a", "b"]) await ctx.db.insert("members", { tokenIdentifier, role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    await ctx.db.insert("members", { tokenIdentifier: "pending", role: "scout", approvalStatus: "pending", lastSeenAt: 1 })
    return ids
  })
  const a = t.withIdentity({ tokenIdentifier: "a" })
  const b = t.withIdentity({ tokenIdentifier: "b" })
  const args = { eventId, left: 9128, right: 10340, winner: 9128 }
  await expect(t.mutation(api.mash.vote, args)).rejects.toThrow("Not authenticated")
  await expect(t.withIdentity({ tokenIdentifier: "pending" }).mutation(api.mash.vote, args)).rejects.toThrow("approval")
  await expect(a.mutation(api.mash.vote, { ...args, winner: 254 })).rejects.toThrow("Invalid matchup")
  await expect(a.mutation(api.mash.vote, { ...args, right: 254 })).rejects.toThrow("Team not in")
  const voteId = await a.mutation(api.mash.vote, args)
  const fromA = await a.query(api.mash.list, { eventId })
  const fromB = await b.query(api.mash.list, { eventId })
  expect(ratings(fromA)).toEqual(ratings(fromB))
  expect(ratings(fromB).get(9128)?.score).toBe(1516)
  expect(fromB[0].mine).toBe(false)
  expect(await b.query(api.mash.list, { eventId: otherId })).toEqual([])
  await expect(b.mutation(api.mash.undo, { voteId })).rejects.toThrow("own votes")
  await a.mutation(api.mash.undo, { voteId })
  expect(await b.query(api.mash.list, { eventId })).toEqual([])
})
