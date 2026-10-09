/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"
import { parseTbaResult } from "./lib/tbaMatchResult"

const modules = import.meta.glob("./**/*.ts")
const payload = {
  key: "2026test_qm1", comp_level: "qm",
  alliances: { red: { score: 200 }, blue: { score: 150 } },
  score_breakdown: {
    red: { totalAutoPoints: 30, hubScore: { autoCount: 20 } },
    blue: { totalAutoPoints: 40, hubScore: { autoCount: 25 } },
  },
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

test("TBA parsing handles fuel-based auto, ties, unplayed and incomplete matches", () => {
  expect(parseTbaResult(payload, payload.key)?.red).toMatchObject({ wonMatch: true, wonAuto: false, totalMatchPoints: 200, autoAllianceFuel: 20 })
  expect(parseTbaResult({ ...payload, alliances: { red: { score: -1 }, blue: { score: -1 } } }, payload.key)).toBeNull()
  expect(parseTbaResult(payload, "2026other_qm1")).toBeNull()
  expect(parseTbaResult({ ...payload, score_breakdown: null }, payload.key)?.red.wonAuto).toBeUndefined()
  expect(parseTbaResult({ ...payload, alliances: { red: { score: 0 }, blue: { score: 0 } }, score_breakdown: {
    red: { hubScore: { autoCount: 0 } }, blue: { hubScore: { autoCount: 0 } },
  } }, payload.key)?.red).toMatchObject({ tiedMatch: true, tiedAuto: true, wonAuto: false, totalMatchPoints: 0 })
})

async function fixture(eventKey = "2026test") {
  const t = convexTest(schema, modules)
  const eventId = await t.run(ctx => ctx.db.insert("events", { eventKey, importStatus: "ready", createdByToken: "scout" }))
  const matchId = await t.run(ctx => ctx.db.insert("matches", { eventId, tbaMatchKey: `${eventKey}_qm1`, matchNumber: 1, redTeams: [9994, 2, 3], blueTeams: [4, 5, 6] }))
  await t.run(ctx => ctx.db.insert("members", { email: "scout@example.com", name: "Scout", role: "scout", approvalStatus: "approved", tokenIdentifier: "scout", lastSeenAt: 1 }))
  const scout = t.withIdentity({ tokenIdentifier: "scout", subject: "scout", issuer: "test", email: "scout@example.com" })
  return { t, scout, eventId, matchId }
}

test("official results are authorized, cached, and applied without changing scout observations", async () => {
  vi.stubEnv("TBA_API_KEY", "test")
  const { t, scout, eventId, matchId } = await fixture()
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
  vi.stubGlobal("fetch", fetchMock)
  await expect(t.action(api.tbaMatches.refresh, { eventId, matchNumber: 1 })).rejects.toThrow()
  await t.run(ctx => ctx.db.insert("matchReports", {
    eventId, matchNumber: 1, teamNumber: 9994, scoutToken: "scout", driverRating: 5, defenseRating: 5,
    autoClimb: "none", endgameClimb: "none", autoNotes: "", teleopNotes: "", endgameNotes: "",
    autoCycles: 3, shift1Cycles: 4, tags: ["Broke down"], updatedAt: 1,
  }))
  expect(await scout.action(api.tbaMatches.refresh, { eventId, matchNumber: 1 })).toBe("updated")
  expect(await t.run(ctx => ctx.db.get(matchId))).toMatchObject({ tbaResult: { red: { totalMatchPoints: 200 } } })
  const reports = await t.run(ctx => ctx.db.query("matchReports").take(10))
  expect(reports[0]).toMatchObject({ wonMatch: true, wonAuto: false, autoCycles: 3, shift1Cycles: 4, tags: ["Broke down"] })
  expect(await scout.action(api.tbaMatches.refresh, { eventId, matchNumber: 1 })).toBe("cached")
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await t.run(ctx => ctx.db.insert("members", { tokenIdentifier: "admin", role: "admin", approvalStatus: "approved", lastSeenAt: 1 }))
  await t.withIdentity({ tokenIdentifier: "admin" }).mutation(api.matchScouting.removeReport, { reportId: reports[0]._id })
  await scout.mutation(api.matchScouting.saveReport, {
    eventId, matchNumber: 1, teamNumber: 9994, autoClimb: "none", endgameClimb: "none",
    autoNotes: "", teleopNotes: "", endgameNotes: "", driverRating: 5, defenseRating: 5,
    autoFuel: 0, teleopFuel: 0, tags: [], wonAuto: true, wonMatch: false, totalMatchPoints: 1,
    autoPath: [[{ x: 100, y: 200 }]],
  })
  expect((await t.run(ctx => ctx.db.query("matchReports").take(10)))[0]).toMatchObject({ wonAuto: false, wonMatch: true, totalMatchPoints: 200 })
  // A posted correction updates both the match and existing reports.
  const correction = parseTbaResult({ ...payload, alliances: { red: { score: 140 }, blue: { score: 150 } } }, payload.key)!
  await t.mutation(internal.tbaMatches.applyResult, { matchId, result: correction })
  expect((await t.run(ctx => ctx.db.query("matchReports").take(10)))[0]).toMatchObject({ wonMatch: false, totalMatchPoints: 140 })
})

test("NTX skips TBA and unposted/unavailable results preserve manual entry", async () => {
  vi.stubEnv("TBA_API_KEY", "test")
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  const ntx = await fixture("2026ntx")
  expect(await ntx.scout.action(api.tbaMatches.refresh, { eventId: ntx.eventId, matchNumber: 1 })).toBe("manual")
  expect(fetchMock).not.toHaveBeenCalled()
  const regular = await fixture()
  fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }))
  expect(await regular.scout.action(api.tbaMatches.refresh, { eventId: regular.eventId, matchNumber: 1 })).toBe("pending")
  fetchMock.mockRejectedValueOnce(new Error("offline"))
  expect(await regular.scout.action(api.tbaMatches.refresh, { eventId: regular.eventId, matchNumber: 1 })).toBe("unavailable")
  expect((await regular.t.run(ctx => ctx.db.get(regular.matchId)))?.tbaResult).toBeUndefined()
})
