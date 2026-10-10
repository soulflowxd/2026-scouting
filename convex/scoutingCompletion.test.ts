/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const pitInput = { canScoreFuelHub: true, canIntakeDepot: true, canIntakeFloor: true,
  canPreload: false, preloadCount: 0, canClimbLevel1: false, canClimbLevel2: false,
  canClimbLevel3: false, canAutoClimbLevel1: false, canCrossBump: true,
  canCrossTrench: true, drivetrain: "Tank", notes: "", }

async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    const adminId = await ctx.db.insert("members", { tokenIdentifier: "admin", name: "Admin", role: "admin", approvalStatus: "approved", lastSeenAt: 1 })
    await ctx.db.insert("members", { tokenIdentifier: "pending", role: "scout", approvalStatus: "pending", lastSeenAt: 1 })
    await ctx.db.insert("members", { tokenIdentifier: "rejected", role: "admin", approvalStatus: "rejected", lastSeenAt: 1 })
    const aId = await ctx.db.insert("members", { tokenIdentifier: "a", name: "Alice", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    const bId = await ctx.db.insert("members", { tokenIdentifier: "b", name: "Bob", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    const subId = await ctx.db.insert("members", { tokenIdentifier: "sub", name: "Casey", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    const eventId = await ctx.db.insert("events", { eventKey: "2026test", importStatus: "ready", createdByToken: "admin", scoutingEnabled: true, scoutAssignmentsEnabled: true })
    for (const memberId of [adminId, subId]) await ctx.db.insert("scoutAssignmentParticipants", { eventId, memberId, included: false })
    for (const teamNumber of [1, 2, 3]) await ctx.db.insert("teams", { eventId, teamNumber, tbaTeamKey: `frc${teamNumber}`, nickname: "Team", ...(teamNumber === 2 ? { eventTeamAlias: "10014R" } : {}) })
    const matchIds = []
    for (const matchNumber of [1, 2]) matchIds.push(await ctx.db.insert("matches", { eventId, matchNumber, tbaMatchKey: `2026test_qm${matchNumber}`, redTeams: [1], blueTeams: [2] }))
    for (const [teamNumber, memberId] of [[1, aId], [2, bId]] as const) await ctx.db.insert("scoutTeamAssignments", { eventId, teamNumber, memberId })
    const claimId = await ctx.db.insert("matchRobotClaims", { eventId, matchNumber: 1, teamNumber: 1, scoutToken: "a", scoutName: "Alice", status: "active", claimedAt: 1 })
    await ctx.db.insert("matchRobotClaims", { eventId, matchNumber: 1, teamNumber: 2, scoutToken: "b", scoutName: "Bob", status: "active", claimedAt: 1 })
    await ctx.db.insert("pitReports", { ...pitInput, eventId, teamNumber: 1, scoutToken: "admin", updatedAt: 1 })
    return { eventId, matchIds, claimId, subId, aId, bId }
  })
  return { t, ...ids, admin: t.withIdentity({ tokenIdentifier: "admin" }), alice: t.withIdentity({ tokenIdentifier: "a" }), sub: t.withIdentity({ tokenIdentifier: "sub" }) }
}

test("completion reports and manual match-finished controls are admin-only", async () => {
  const { t, admin, eventId } = await fixture()
  for (const token of [null, "a", "sub", "pending", "rejected"]) {
    const actor = token ? t.withIdentity({ tokenIdentifier: token }) : t
    await expect(actor.query(api.scoutAssignments.completionReport, { eventId })).rejects.toThrow()
    await expect(actor.query(api.scoutAssignments.completionReport, { eventId, allMatches: true })).rejects.toThrow()
    await expect(actor.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 1 })).rejects.toThrow()
  }
  // Completion checks remain available while submissions are closed.
  await t.run(ctx => ctx.db.patch(eventId, { scoutingEnabled: false }))
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 1 })
  const report = await admin.query(api.scoutAssignments.completionReport, { eventId })
  expect(report.matchNumber).toBe(1)
  expect(report.missing).toEqual([
    { name: "Alice", kind: "match", teamNumber: 1, teamLabel: "1", matchNumber: 1 },
    { name: "Bob", kind: "match", teamNumber: 2, teamLabel: "10014R", matchNumber: 1 },
    { name: "Bob", kind: "pit", teamNumber: 2, teamLabel: "10014R" },
  ])
  expect(report.unassignedPits).toBe(1)
})

test("unplayed matches are not overdue; official results open the report automatically", async () => {
  const { t, admin, eventId, matchIds } = await fixture()
  const before = await admin.query(api.scoutAssignments.completionReport, { eventId })
  expect(before.matchNumber).toBeNull()
  expect(before.missing.every(row => row.kind === "pit")).toBe(true)
  await t.mutation(internal.tbaMatches.applyResult, { matchId: matchIds[0], result: {
    red: { totalMatchPoints: 100, wonMatch: true, tiedMatch: false },
    blue: { totalMatchPoints: 80, wonMatch: false, tiedMatch: false },
  } })
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId })).matchNumber).toBe(1)
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 2 })
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId })).matchNumber).toBe(2)
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId, matchNumber: 1 })).missing.filter(row => row.kind === "match")).toHaveLength(2)
})

test("late submissions remove only the corresponding missing item and admin deletions restore it", async () => {
  const { admin, alice, eventId } = await fixture()
  await alice.mutation(api.matchScouting.saveReport, { eventId, matchNumber: 1, teamNumber: 1,
    autoFuel: 0, teleopFuel: 0, autoClimb: "none", autoNotes: "", teleopNotes: "",
    endgameClimb: "none", endgameNotes: "", driverRating: 5, defenseRating: 5, tags: [] })
  const report = await admin.query(api.scoutAssignments.completionReport, { eventId })
  expect(report.reviewOpen).toBe(true)
  expect(report.missing.some(row => row.kind === "match" && row.teamNumber === 1)).toBe(false)
  expect(report.missing.some(row => row.kind === "match" && row.teamNumber === 2)).toBe(true)
  await admin.mutation(api.pit.save, { ...pitInput, eventId, teamNumber: 2 })
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId })).missing.some(row => row.kind === "pit" && row.teamNumber === 2)).toBe(false)
  const detail = await admin.query(api.teams.detail, { eventId, teamNumber: 2 })
  await admin.mutation(api.pit.remove, { reportId: detail!.pitReports[0]._id })
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId })).missing.some(row => row.kind === "pit" && row.teamNumber === 2)).toBe(true)
})

test("claims and confirmed substitutes determine responsibility, not pending handoffs or assignment edits", async () => {
  const { admin, alice, sub, eventId, claimId, subId } = await fixture()
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 1 })
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId: subId, included: true })
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 1, memberId: subId })
  const owner = async () => (await admin.query(api.scoutAssignments.completionReport, { eventId })).missing.find(row => row.kind === "match" && row.teamNumber === 1)?.name
  expect(await owner()).toBe("Alice")
  await alice.mutation(api.matchScouting.requestSubstitute, { claimId, substituteId: subId })
  const requestedAt = (await sub.query(api.matchScouting.myHandoffs, {}))[0].breakRequestedAt!
  await sub.mutation(api.matchScouting.confirmSubstitute, { claimId, requestedAt, action: "accept" })
  expect(await owner()).toBe("Alice")
  await alice.mutation(api.matchScouting.confirmSubstitute, { claimId, requestedAt, action: "confirm" })
  expect(await owner()).toBe("Casey")
})

test("completion checks never count reports from another event", async () => {
  const { t, admin, eventId } = await fixture()
  await t.run(async ctx => {
    const other = await ctx.db.insert("events", { eventKey: "2026other", importStatus: "ready", createdByToken: "admin" })
    await ctx.db.insert("pitReports", { ...pitInput, eventId: other, teamNumber: 2, scoutToken: "b", updatedAt: 1 })
  })
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId })).missing).toContainEqual({ name: "Bob", kind: "pit", teamNumber: 2, teamLabel: "10014R" })
})

test("later team assignments do not rewrite responsibility for finished matches", async () => {
  const { t, admin, eventId, subId } = await fixture()
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 2 })
  const before = (await admin.query(api.scoutAssignments.completionReport, { eventId })).missing.filter(row => row.kind === "match")
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId: subId, included: true })
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 1, memberId: subId })
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId })).missing.filter(row => row.kind === "match")).toEqual(before)
  // Repeated finishing is idempotent, even after assignments have changed.
  const saved = await t.run(ctx => ctx.db.query("matches").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", eventId).eq("matchNumber", 2)).unique())
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 2 })
  expect((await t.run(ctx => ctx.db.get(saved!._id)))?.completionAssignments).toEqual(saved?.completionAssignments)
})

test("all finished matches includes each overdue robot, excludes unplayed matches, and clears late reports", async () => {
  const { t, admin, alice, eventId, matchIds } = await fixture()
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 1 })
  let report = await admin.query(api.scoutAssignments.completionReport, { eventId, allMatches: true })
  expect(report.matchNumber).toBeNull()
  expect(report.missing.filter(row => row.kind === "match").map(row => row.matchNumber)).toEqual([1, 1])
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 2 })
  await t.run(async ctx => {
    await ctx.db.insert("matches", { eventId, matchNumber: 3, tbaMatchKey: "2026test_qm3", redTeams: [1], blueTeams: [2] })
    // A robot without a responsible scout is a separate coverage gap.
    await ctx.db.patch(matchIds[1], { blueTeams: [2, 3] })
  })
  report = await admin.query(api.scoutAssignments.completionReport, { eventId, allMatches: true })
  expect(report.missing.filter(row => row.kind === "match")).toEqual([
    { name: "Alice", kind: "match", teamNumber: 1, teamLabel: "1", matchNumber: 1 },
    { name: "Alice", kind: "match", teamNumber: 1, teamLabel: "1", matchNumber: 2 },
    { name: "Bob", kind: "match", teamNumber: 2, teamLabel: "10014R", matchNumber: 1 },
    { name: "Bob", kind: "match", teamNumber: 2, teamLabel: "10014R", matchNumber: 2 },
  ])
  expect(report.missing.filter(row => row.kind === "pit")).toHaveLength(1)
  expect(report.coverageGaps).toEqual([
    { kind: "match", teamNumber: 3, teamLabel: "3", matchNumber: 2 },
    { kind: "pit", teamNumber: 3, teamLabel: "3" },
  ])
  expect(report.unassignedMatchTeams).toBe(1)
  expect(report.matches.find(match => match.matchNumber === 3)?.started).toBe(false)
  const single = await admin.query(api.scoutAssignments.completionReport, { eventId, matchNumber: 1 })
  expect(single.coverageGaps.every(row => row.kind === "pit")).toBe(true)
  await alice.mutation(api.matchScouting.saveReport, { eventId, matchNumber: 1, teamNumber: 1,
    autoFuel: 0, teleopFuel: 0, autoClimb: "none", autoNotes: "", teleopNotes: "",
    endgameClimb: "none", endgameNotes: "", driverRating: 5, defenseRating: 5, tags: [] })
  report = await admin.query(api.scoutAssignments.completionReport, { eventId, allMatches: true })
  expect(report.missing.filter(row => row.name === "Alice" && row.kind === "match").map(row => row.matchNumber)).toEqual([2])
})
