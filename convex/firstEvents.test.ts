/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"
import { firstTimestamp, importEventReference } from "./lib/firstApi"
import { parseFirstResult } from "./lib/firstMatchResult"
import { fetchFirstImport } from "./firstEvents"

const modules = import.meta.glob("./**/*.ts")
const redTeams = [9992, 10340, 6369], blueTeams = [8749, 7506, 6901]
const teams = [...redTeams.map((teamNumber, i) => ({ teamNumber, station: `Red${i + 1}` })), ...blueTeams.map((teamNumber, i) => ({ teamNumber, station: `Blue${i + 1}` }))]
const result = { matchNumber: 1, tournamentLevel: "Qualification", postResultTime: "2026-10-10T10:23:33.927", scoreRedFinal: 248, scoreBlueFinal: 173, teams }
const details = { matchNumber: 1, matchLevel: "Qualification", alliances: [
  { alliance: "Red", totalAutoPoints: 62, hubScore: { autoCount: 20 } },
  { alliance: "Blue", totalAutoPoints: 35, hubScore: { autoCount: 25 } },
] }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const configure = () => { vi.stubEnv("FIRST_API_USERNAME", "test"); vi.stubEnv("FIRST_API_AUTH_TOKEN", "test") }

async function fixture() {
  configure()
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    const scoutId = await ctx.db.insert("members", { tokenIdentifier: "scout", name: "Alice", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    const adminId = await ctx.db.insert("members", { tokenIdentifier: "admin", name: "Admin", role: "admin", approvalStatus: "approved", lastSeenAt: 1 })
    await ctx.db.insert("members", { tokenIdentifier: "pending", name: "Pending", role: "scout", approvalStatus: "pending", lastSeenAt: 1 })
    const eventId = await ctx.db.insert("events", { eventKey: "2026txmck", name: "STEM Gals", importStatus: "ready", createdByToken: "admin", firstScheduleCheckedAt: Date.now(), scoutAssignmentsEnabled: true })
    await ctx.db.insert("scoutAssignmentParticipants", { eventId, memberId: adminId, included: false })
    for (const teamNumber of [...redTeams, ...blueTeams]) await ctx.db.insert("teams", { eventId, teamNumber, nickname: "Test", tbaTeamKey: `frc${teamNumber}` })
    await ctx.db.insert("scoutTeamAssignments", { eventId, teamNumber: 10340, memberId: scoutId })
    await ctx.db.insert("matchRobotClaims", { eventId, matchNumber: 1, teamNumber: 10340, scoutToken: "scout", scoutName: "Alice", status: "active", claimedAt: 1 })
    const matchId = await ctx.db.insert("matches", { eventId, matchNumber: 1, tbaMatchKey: "first:2026txmck:qm1", redTeams, blueTeams })
    await ctx.db.insert("matches", { eventId, matchNumber: 2, tbaMatchKey: "first:2026txmck:qm2", redTeams, blueTeams })
    return { eventId, matchId }
  })
  return { t, ...ids, scout: t.withIdentity({ tokenIdentifier: "scout" }), admin: t.withIdentity({ tokenIdentifier: "admin" }) }
}

test("FIRST requires a posted qualification result with the correct robot stations, including zero-score ties", () => {
  const match = { matchNumber: 1, redTeams, blueTeams }
  expect(parseFirstResult(result, details, match, 2026)?.red).toMatchObject({ totalMatchPoints: 248, wonMatch: true, wonAuto: false, autoAllianceFuel: 20 })
  for (const change of [{ postResultTime: null }, { scoreRedFinal: -1 }, { scoreBlueFinal: null }, { tournamentLevel: "Playoff" }, { matchNumber: 2 }, { teams: teams.slice(0, 5) }]) {
    expect(parseFirstResult({ ...result, ...change }, details, match, 2026)).toBeNull()
  }
  expect(parseFirstResult(result, details, { ...match, redTeams: blueTeams, blueTeams: redTeams }, 2026)).toBeNull()
  expect(parseFirstResult({ ...result, scoreRedFinal: 0, scoreBlueFinal: 0 }, { ...details, alliances: details.alliances.map(side => ({ ...side, hubScore: { autoCount: 0 } })) }, match, 2026)?.red).toMatchObject({ tiedMatch: true, tiedAuto: true, wonMatch: false, wonAuto: false })
  expect(parseFirstResult(result, undefined, match, 2026)?.red.wonAuto).toBeUndefined()
  expect(parseFirstResult(result, { ...details, matchNumber: 2 }, match, 2026)?.red.wonAuto).toBeUndefined()
  expect(parseFirstResult({ ...result, postResultTime: "2025-10-10T10:23:33" }, details, match, 2025)?.red.wonAuto).toBeUndefined()
  expect(parseFirstResult({ ...result, postResultTime: "2025-10-10T10:23:33" }, details, match, 2026)).toBeNull()
})

test("FIRST URLs and venue-local timestamps use validated sources and daylight-saving offsets", () => {
  expect(importEventReference("https://frc-events.firstinspires.org/2026/TXMCK/")).toEqual({ eventKey: "2026txmck", firstEventCode: "TXMCK" })
  expect(() => importEventReference("https://example.com/2026/TXMCK/")).toThrow()
  expect(firstTimestamp("2026-10-10T10:30:00", "Central Standard Time")).toBe(Date.parse("2026-10-10T15:30:00Z") / 1000)
  expect(firstTimestamp("2026-01-10T10:30:00", "Central Standard Time")).toBe(Date.parse("2026-01-10T16:30:00Z") / 1000)
  expect(firstTimestamp("2026-10-10T10:30:00", "Unknown timezone")).toBeUndefined()
})

test("FIRST refresh is authorized, opens completion review and updates only official alliance fields", async () => {
  const { t, scout, admin, eventId, matchId } = await fixture()
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/scores/") ? { MatchScores: [details] } : { Matches: [result] })))
  vi.stubGlobal("fetch", fetchMock)
  await expect(t.action(api.tbaMatches.refresh, { eventId, matchNumber: 1 })).rejects.toThrow()
  await expect(t.withIdentity({ tokenIdentifier: "pending" }).action(api.tbaMatches.refresh, { eventId, matchNumber: 1 })).rejects.toThrow()
  await t.run(ctx => ctx.db.insert("matchReports", { eventId, matchNumber: 1, teamNumber: 10340, scoutToken: "scout", driverRating: 5, defenseRating: 5, autoClimb: "none", endgameClimb: "none", autoNotes: "Observed", teleopNotes: "", endgameNotes: "", autoCycles: 3, shift1Cycles: 4, tags: ["Broke down"], updatedAt: 1 }))
  expect(await scout.action(api.tbaMatches.refresh, { eventId, matchNumber: 1 })).toBe("updated")
  const match = await t.run(ctx => ctx.db.get(matchId))
  expect(match).toMatchObject({ officialResultSource: "first", tbaResult: { red: { totalMatchPoints: 248, wonAuto: false } }, completionAssignments: [{ teamNumber: 10340, scoutToken: "scout", scoutName: "Alice" }] })
  expect((await t.run(ctx => ctx.db.query("matchReports").take(10)))[0]).toMatchObject({ totalMatchPoints: 248, wonAuto: false, autoCycles: 3, shift1Cycles: 4, autoNotes: "Observed", tags: ["Broke down"] })
  const context = await scout.query(api.tbaMatches.forMatch, { eventId, matchNumber: 1 })
  expect(context?.resultUrl).toBe("https://frc-events.firstinspires.org/2026/TXMCK/qualifications/1")
  expect(await scout.action(api.tbaMatches.refresh, { eventId, matchNumber: 1 })).toBe("cached")
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls.every(([url]) => url.startsWith("https://frc-api.firstinspires.org/v3.0/2026/"))).toBe(true)
  const completion = await admin.query(api.scoutAssignments.completionReport, { eventId, allMatches: true })
  expect(completion.matches).toEqual([{ matchNumber: 1, started: true }, { matchNumber: 2, started: false }])
})

test("the automatic FIRST poll discovers finished matches with no scout submissions and keeps cached results through outages", async () => {
  const { t, eventId, matchId, admin } = await fixture()
  let posted = result
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/scores/") ? { MatchScores: [details] } : { Matches: [posted, { ...result, matchNumber: 2, postResultTime: null }] }))))
  expect(await t.action(internal.firstEvents.refreshAll, {})).toBe(1)
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId, allMatches: true })).missing).toContainEqual({ name: "Alice", kind: "match", teamNumber: 10340, teamLabel: "10340", matchNumber: 1 })
  const before = await t.run(ctx => ctx.db.get(matchId))
  expect(await t.action(internal.firstEvents.refreshAll, {})).toBe(0)
  expect((await t.run(ctx => ctx.db.get(matchId)))?.completionReviewAt).toBe(before?.completionReviewAt)
  posted = { ...result, scoreRedFinal: 100 }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/scores/")) throw new Error("Scoring details offline")
    return new Response(JSON.stringify({ Matches: [posted] }))
  }))
  await t.action(internal.firstEvents.refreshAll, {})
  expect((await t.run(ctx => ctx.db.get(matchId)))?.tbaResult?.red).toMatchObject({ totalMatchPoints: 100, wonMatch: false, autoAllianceFuel: 20 })
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")))
  expect(await t.action(internal.firstEvents.refreshAll, {})).toBe(0)
  expect((await t.run(ctx => ctx.db.get(matchId)))?.tbaResult?.red.totalMatchPoints).toBe(100)
})

test("FIRST imports page the full roster and preserve reports, claims, video settings and completion snapshots", async () => {
  configure()
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/events?")) return new Response(JSON.stringify({ Events: [{ code: "TXMCK", name: "STEM Gals", timezone: "Central Standard Time" }] }))
    if (url.includes("/schedule/")) return new Response(JSON.stringify({ Schedule: [{ matchNumber: 1, tournamentLevel: "Qualification", startTime: "2026-10-10T10:30:00", teams }] }))
    const page = url.endsWith("page=2") ? 2 : 1
    const roster = (page === 1 ? redTeams : blueTeams).map(teamNumber => ({ teamNumber, nameShort: `Team ${teamNumber}` }))
    return new Response(JSON.stringify({ pageCurrent: page, pageTotal: 2, teamCountTotal: 6, teams: roster }))
  })
  vi.stubGlobal("fetch", fetchMock)
  const data = await fetchFirstImport("2026txmck", "TXMCK")
  expect(data.teams).toHaveLength(6)
  expect(data.matches[0].scheduledTime).toBe(Date.parse("2026-10-10T15:30:00Z") / 1000)
  expect(data.matches[0].tbaMatchKey).toBe("first:2026txmck:qm1")
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("page=2"))).toBe(true)
  const { t, eventId, matchId } = await fixture()
  await t.run(async ctx => {
    await ctx.db.patch(eventId, { scoutingEnabled: false, matchVideoFolderUrl: "https://drive.google.com/drive/folders/fixture", matchVideoPrefix: "stem gals" })
    await ctx.db.patch(matchId, { videoUrl: "https://drive.google.com/file/d/fixture/view", completionReviewAt: 1, completionAssignments: [{ teamNumber: 10340, scoutToken: "scout", scoutName: "Alice" }] })
  })
  await t.mutation(internal.importData.applyEventImport, { eventId, ...data })
  expect(await t.run(ctx => ctx.db.get(eventId))).toMatchObject({ firstEventCode: "TXMCK", scoutingEnabled: false, matchVideoPrefix: "stem gals" })
  expect(await t.run(ctx => ctx.db.get(matchId))).toMatchObject({ videoUrl: "https://drive.google.com/file/d/fixture/view", completionReviewAt: 1, completionAssignments: [{ teamNumber: 10340, scoutToken: "scout", scoutName: "Alice" }] })
  expect(await t.run(ctx => ctx.db.query("matchRobotClaims").take(10))).toHaveLength(1)
})

test("configured FIRST events refresh rankings without borrowing RP or team stats from another event", async () => {
  configure()
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    const eventId = await ctx.db.insert("events", { eventKey: "2026firstonly", firstEventCode: "FIRSTONLY", importStatus: "ready", createdByToken: "admin" })
    await ctx.db.insert("teams", { eventId, teamNumber: 10340, nickname: "ITKAN", tbaTeamKey: "frc10340" })
    await ctx.db.insert("externalStats", { eventId, teamNumber: 10340, epa: 100, xp: 50, refreshedAt: 1 })
    return eventId
  })
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Rankings: [{ teamNumber: 10340, rank: 1, sortOrder1: 4, matchesPlayed: 1, wins: 1, losses: 0, ties: 0 }] }))))
  expect(await t.action(internal.firstRankings.refreshEvent, { eventId })).toBe(1)
  expect((await t.run(ctx => ctx.db.query("externalStats").take(10)))[0]).toMatchObject({ epa: 100, xp: 50, averageRp: 4, eventRank: 1 })
})

test("admin imports fall back from TBA to verified FIRST data and reimports retain their chosen source", async () => {
  configure()
  vi.stubEnv("TBA_API_KEY", "test")
  vi.stubEnv("MATCH13_API_KEY", "")
  const t = convexTest(schema, modules)
  await t.run(ctx => ctx.db.insert("members", { tokenIdentifier: "admin", name: "Admin", role: "admin", approvalStatus: "approved", lastSeenAt: 1 }))
  const fetchMock = vi.fn(async (url: string) => {
    if (!url.startsWith("https://frc-api.firstinspires.org/v3.0/2026/")) throw new Error("External source offline")
    if (url.includes("/events?")) return new Response(JSON.stringify({ Events: [{ code: "FIRSTONLY", name: "FIRST Only", timezone: "Central Standard Time" }] }))
    if (url.includes("/teams?")) return new Response(JSON.stringify({ pageCurrent: 1, pageTotal: 1, teamCountTotal: 6, teams: [...redTeams, ...blueTeams].map(teamNumber => ({ teamNumber, nameShort: "Robot" })) }))
    if (url.includes("/schedule/")) return new Response(JSON.stringify({ Schedule: [{ matchNumber: 1, tournamentLevel: "Qualification", startTime: "2026-10-10T10:30:00", teams }] }))
    if (url.includes("/rankings/")) return new Response(JSON.stringify({ Rankings: [] }))
    if (url.includes("/scores/")) return new Response(JSON.stringify({ MatchScores: [] }))
    return new Response(JSON.stringify({ Matches: [] }))
  })
  vi.stubGlobal("fetch", fetchMock)
  await expect(t.action(api.imports.importEvent, { eventKey: "https://frc-events.firstinspires.org/2026/FIRSTONLY/" })).rejects.toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
  const admin = t.withIdentity({ tokenIdentifier: "admin" })
  const imported = await admin.action(api.imports.importEvent, { eventKey: "2026firstonly" })
  expect(imported).toMatchObject({ teamCount: 6, matchCount: 1 })
  expect(await t.run(ctx => ctx.db.get(imported.eventId))).toMatchObject({ firstEventCode: "FIRSTONLY", name: "FIRST Only", scoutingEnabled: false, importStatus: "ready" })
  const tbaCalls = fetchMock.mock.calls.filter(([url]) => url.includes("thebluealliance")).length
  expect(tbaCalls).toBe(3)
  expect((await admin.action(api.imports.importEvent, { eventKey: "2026firstonly" })).eventId).toBe(imported.eventId)
  expect(fetchMock.mock.calls.filter(([url]) => url.includes("thebluealliance"))).toHaveLength(tbaCalls)
  expect(await admin.query(api.tbaMatches.forMatch, { eventId: imported.eventId, matchNumber: 1 })).toMatchObject({ firstEventCode: "FIRSTONLY", resultUrl: "https://frc-events.firstinspires.org/2026/FIRSTONLY/qualifications/1" })
  await expect(admin.action(api.imports.importEvent, { eventKey: "2026ntx" })).rejects.toThrow("supplied roster")
})
