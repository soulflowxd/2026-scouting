/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const input = { autoFuel: 0, teleopFuel: 0, autoClimb: "none" as const, autoNotes: "", teleopNotes: "", endgameClimb: "none" as const, endgameNotes: "", driverRating: 5, defenseRating: 5, tags: [] }

async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    const member = (tokenIdentifier: string, name: string, role: "scout" | "admin" = "scout", approvalStatus: "approved" | "pending" = "approved") => ctx.db.insert("members", { tokenIdentifier, name, role, approvalStatus, lastSeenAt: 1 })
    const adminId = await member("admin", "Admin", "admin")
    const aliceId = await member("alice", "Alice")
    const bobId = await member("bob", "Bob")
    const caseyId = await member("casey", "Casey")
    const pendingId = await member("pending", "Pending", "scout", "pending")
    const eventId = await ctx.db.insert("events", { eventKey: "2026test", importStatus: "ready", scoutingEnabled: true, scoutAssignmentsEnabled: true, scoutAssignmentMode: "manual", createdByToken: "admin" })
    for (const memberId of [adminId, caseyId]) await ctx.db.insert("scoutAssignmentParticipants", { eventId, memberId, included: false })
    for (let teamNumber = 1; teamNumber <= 6; teamNumber++) await ctx.db.insert("teams", { eventId, teamNumber, tbaTeamKey: `frc${teamNumber}`, nickname: "Robot" })
    for (const matchNumber of [1, 2, 3]) await ctx.db.insert("matches", { eventId, matchNumber, tbaMatchKey: `2026test_qm${matchNumber}`, redTeams: [matchNumber, 4, 5], blueTeams: [6, 4, 5] })
    await ctx.db.insert("scoutDriverStationAssignments", { eventId, station: "Red1", memberId: aliceId })
    await ctx.db.insert("scoutDriverStationAssignments", { eventId, station: "Blue1", memberId: bobId })
    await ctx.db.insert("scoutTeamAssignments", { eventId, teamNumber: 1, memberId: aliceId })
    return { eventId, aliceId, bobId, caseyId, pendingId }
  })
  return { t, ...ids, admin: t.withIdentity({ tokenIdentifier: "admin" }), alice: t.withIdentity({ tokenIdentifier: "alice" }), bob: t.withIdentity({ tokenIdentifier: "bob" }), casey: t.withIdentity({ tokenIdentifier: "casey" }) }
}

test("manual stations follow each match's teams, require no claims and do not assign spare scouts", async () => {
  const { t, admin, alice, casey, eventId, aliceId, bobId } = await fixture()
  expect((await alice.query(api.scoutAssignments.mine, { eventId })).matchAssignments.map(slot => [slot.matchNumber, slot.teamNumber])).toEqual([[1, 1], [2, 2], [3, 3]])
  expect((await casey.query(api.scoutAssignments.mine, { eventId })).matchAssignments).toEqual([])
  await expect(alice.mutation(api.matchScouting.saveReport, { ...input, eventId, matchNumber: 1, teamNumber: 6 })).rejects.toThrow("assigned teams only")
  await alice.mutation(api.matchScouting.saveReport, { ...input, eventId, matchNumber: 1, teamNumber: 1 })
  expect(await t.run(ctx => ctx.db.query("matchRobotClaims").take(10))).toEqual([])
  await expect(alice.mutation(api.scoutAssignments.assignStation, { eventId, station: "Red2", memberId: aliceId })).rejects.toThrow("Unauthorized")
  await expect(admin.mutation(api.scoutAssignments.assignStation, { eventId, station: "Red2", memberId: aliceId })).rejects.toThrow("already has a driver station")
  await admin.mutation(api.scoutAssignments.assignStation, { eventId, station: "Red1", memberId: null })
  await admin.mutation(api.scoutAssignments.assignStation, { eventId, station: "Blue1", memberId: null })
  await admin.mutation(api.scoutAssignments.assignStation, { eventId, station: "Red1", memberId: bobId })
  expect((await alice.query(api.scoutAssignments.mine, { eventId })).matchAssignments.map(slot => slot.matchNumber)).toEqual([1])
  expect((await admin.query(api.scoutAssignments.completionReport, { eventId })).missing.some(row => row.kind === "match" && row.name === "Bob" && row.teamNumber === 1)).toBe(false)
})

test("two confirmations transfer future station matches and teams to an unchecked scout, preserving past responsibility and audit history", async () => {
  const { t, admin, alice, bob, casey, eventId, aliceId, caseyId } = await fixture()
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 1 })
  const handoffId = await alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: caseyId, fromMatchNumber: 2 })
  await expect(alice.mutation(api.scoutHandoffs.respond, { handoffId, action: "confirm" })).rejects.toThrow("accept before")
  await expect(alice.mutation(api.scoutHandoffs.respond, { handoffId, action: "accept" })).rejects.toThrow("own account")
  await expect(bob.mutation(api.scoutHandoffs.respond, { handoffId, action: "accept" })).rejects.toThrow("these two scouts")
  expect((await casey.query(api.scoutHandoffs.mine, {}))[0]).toMatchObject({ incoming: true, driverStations: ["Red1"], fromName: "Alice" })
  await casey.mutation(api.scoutHandoffs.respond, { handoffId, action: "accept" })
  expect((await casey.query(api.scoutAssignments.mine, { eventId })).matchAssignments).toEqual([])
  await alice.mutation(api.scoutHandoffs.respond, { handoffId, action: "confirm" })
  expect((await alice.query(api.scoutAssignments.mine, { eventId })).matchAssignments.map(slot => slot.matchNumber)).toEqual([1])
  expect((await casey.query(api.scoutAssignments.mine, { eventId })).matchAssignments.map(slot => [slot.matchNumber, slot.teamNumber])).toEqual([[2, 2], [3, 3]])
  expect((await casey.query(api.scoutAssignments.mine, { eventId })).teams).toEqual([{ teamNumber: 1, label: "1" }])
  const participants = (await admin.query(api.scoutAssignments.adminList, { eventId })).participants
  expect(participants).toContain(caseyId); expect(participants).not.toContain(aliceId)
  await expect(alice.mutation(api.matchScouting.saveReport, { ...input, eventId, matchNumber: 2, teamNumber: 2 })).rejects.toThrow("assigned teams only")
  await expect(casey.mutation(api.matchScouting.saveReport, { ...input, eventId, matchNumber: 1, teamNumber: 1 })).rejects.toThrow("assigned teams only")
  await admin.mutation(api.scoutAssignments.openCompletionReview, { eventId, matchNumber: 2 })
  const missing = (await admin.query(api.scoutAssignments.completionReport, { eventId, allMatches: true })).missing.filter(row => row.kind === "match" && row.teamNumber !== 6)
  expect(missing).toEqual([
    { name: "Alice", kind: "match", teamNumber: 1, teamLabel: "1", matchNumber: 1 },
    { name: "Casey", kind: "match", teamNumber: 2, teamLabel: "2", matchNumber: 2 },
  ])
  // The former scout can still deliver a late report for their own earlier match.
  await alice.mutation(api.matchScouting.saveReport, { ...input, eventId, matchNumber: 1, teamNumber: 1 })
  expect((await casey.query(api.scoutHandoffs.history, { eventId }))[0]).toMatchObject({ fromName: "Alice", toName: "Casey", fromMatchNumber: 2, status: "confirmed", driverStations: ["Red1"], teamNumbers: [1], matchSlots: [{ matchNumber: 2, teamNumber: 2 }, { matchNumber: 3, teamNumber: 3 }] })
  await expect(alice.mutation(api.scoutHandoffs.respond, { handoffId, action: "confirm" })).rejects.toThrow("no longer active")
  expect(await t.run(ctx => ctx.db.query("matchRobotClaims").take(10))).toEqual([])
  // A newly imported match follows the transferred station, with no history rewrite.
  await t.mutation(internal.importData.applyEventImport, { eventId, teams: [], matches: [{ matchNumber: 4, tbaMatchKey: "2026test_qm4", redTeams: [4], blueTeams: [6] }] })
  expect((await casey.query(api.scoutAssignments.mine, { eventId })).matchAssignments.some(slot => slot.matchNumber === 4 && slot.teamNumber === 4)).toBe(true)
  // Handing back to the previously unchecked original scout creates another audit record.
  const back = await casey.mutation(api.scoutHandoffs.request, { eventId, substituteId: aliceId, fromMatchNumber: 3 })
  await alice.mutation(api.scoutHandoffs.respond, { handoffId: back, action: "accept" })
  await casey.mutation(api.scoutHandoffs.respond, { handoffId: back, action: "confirm" })
  expect((await alice.query(api.scoutAssignments.mine, { eventId })).matchAssignments.map(slot => slot.matchNumber)).toEqual([1, 3, 4])
  expect((await casey.query(api.scoutAssignments.mine, { eventId })).matchAssignments.map(slot => slot.matchNumber)).toEqual([2])
  expect(await alice.query(api.scoutHandoffs.history, { eventId })).toHaveLength(2)
})

test("cancelled requests, conflicts, stale assignments, closed events and unapproved accounts cannot transfer assignments", async () => {
  const { t, admin, alice, bob, casey, eventId, aliceId, bobId, caseyId, pendingId } = await fixture()
  await expect(alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: bobId, fromMatchNumber: 1 })).rejects.toThrow("driver station")
  await expect(alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: pendingId, fromMatchNumber: 1 })).rejects.toThrow("approved")
  await expect(alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: aliceId, fromMatchNumber: 1 })).rejects.toThrow("another")
  const id = await alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: caseyId, fromMatchNumber: 1 })
  await expect(alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: caseyId, fromMatchNumber: 1 })).rejects.toThrow("existing handoff")
  await casey.mutation(api.scoutHandoffs.respond, { handoffId: id, action: "cancel" })
  expect((await alice.query(api.scoutAssignments.mine, { eventId })).driverStations).toEqual(["Red1"])
  expect(await casey.query(api.scoutHandoffs.mine, {})).toEqual([])
  const stale = await alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: caseyId, fromMatchNumber: 1 })
  await admin.mutation(api.scoutAssignments.assignStation, { eventId, station: "Red1", memberId: null })
  await expect(casey.mutation(api.scoutHandoffs.respond, { handoffId: stale, action: "accept" })).rejects.toThrow("changed")
  await alice.mutation(api.scoutHandoffs.respond, { handoffId: stale, action: "cancel" })
  await admin.mutation(api.scoutAssignments.assignStation, { eventId, station: "Red1", memberId: aliceId })
  const closed = await alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: caseyId, fromMatchNumber: 1 })
  await t.run(ctx => ctx.db.patch(eventId, { scoutingEnabled: false }))
  await expect(casey.mutation(api.scoutHandoffs.respond, { handoffId: closed, action: "accept" })).rejects.toThrow("closed")
  await alice.mutation(api.scoutHandoffs.respond, { handoffId: closed, action: "cancel" })
  await expect(t.withIdentity({ tokenIdentifier: "pending" }).query(api.scoutHandoffs.options, { eventId })).rejects.toThrow()
  await expect(t.query(api.scoutHandoffs.history, { eventId })).rejects.toThrow()
  expect((await bob.query(api.scoutAssignments.mine, { eventId })).driverStations).toEqual(["Blue1"])
})

test("automatic mode transfers its exact remaining coverage without creating claims or assigning two robots per scout", async () => {
  const { t, admin, alice, casey, eventId, caseyId, aliceId } = await fixture()
  await admin.mutation(api.scoutAssignments.setMode, { eventId, mode: "automatic" })
  const before = (await alice.query(api.scoutAssignments.mine, { eventId })).matchAssignments
  const id = await alice.mutation(api.scoutHandoffs.request, { eventId, substituteId: caseyId, fromMatchNumber: 2 })
  await casey.mutation(api.scoutHandoffs.respond, { handoffId: id, action: "accept" })
  await alice.mutation(api.scoutHandoffs.respond, { handoffId: id, action: "confirm" })
  const after = (await casey.query(api.scoutAssignments.mine, { eventId })).matchAssignments
  expect(after).toEqual(before.filter(slot => slot.matchNumber >= 2))
  expect(new Set(after.map(slot => slot.matchNumber)).size).toBe(after.length)
  const old = (await alice.query(api.scoutAssignments.mine, { eventId })).matchAssignments
  expect(old).toEqual(before.filter(slot => slot.matchNumber < 2))
  await admin.mutation(api.scoutAssignments.setMode, { eventId, mode: "manual" })
  // Even unplayed matches before the confirmed boundary retain their old scout.
  expect((await alice.query(api.scoutAssignments.mine, { eventId })).matchAssignments).toEqual(old)
  expect((await admin.query(api.scoutAssignments.adminList, { eventId })).participants).not.toContain(aliceId)
  expect(await t.run(ctx => ctx.db.query("matchRobotClaims").take(10))).toEqual([])
})
