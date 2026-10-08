/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, expect, test, vi } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"
import { planMatchAssignments, planScoutGroups } from "./lib/scoutAssignmentPlan"
const modules = import.meta.glob("./**/*.ts")
afterEach(() => vi.unstubAllEnvs())

test("team groups scale to available scouts and balance every team", () => {
  const teams = Array.from({ length: 18 }, (_, i) => i + 1)
  const scouts = Array.from({ length: 6 }, (_, i) => `scout${i}`)
  const plan = planScoutGroups(teams, scouts)
  expect(plan).toHaveLength(18)
  expect(new Set(plan.map(row => row.teamNumber)).size).toBe(18)
  for (const scout of scouts) {
    const group = plan.filter(row => row.scout === scout)
    expect(group.length).toBe(3)
  }
  expect(planScoutGroups(teams, ["one"])).toHaveLength(18)
  expect(planScoutGroups(teams, [])).toEqual([])
  const thirty = planScoutGroups(Array.from({ length: 30 }, (_, i) => i + 1), scouts)
  expect(scouts.map(scout => thirty.filter(row => row.scout === scout).length)).toEqual([5, 5, 5, 5, 5, 5])
  const uneven = planScoutGroups(teams.slice(0, 17), scouts)
  const counts = scouts.map(scout => uneven.filter(row => row.scout === scout).length)
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  expect(planScoutGroups(teams, scouts, () => 0.1)).not.toEqual(planScoutGroups(teams, scouts, () => 0.9))
})

test("same-match conflicts are randomized consistently and spare scouts cover remaining robots", () => {
  const match = { matchNumber: 1, redTeams: [1, 2, 3], blueTeams: [4, 5, 6] }
  const groups = [1, 2, 3, 4, 5, 6].map(teamNumber => ({ teamNumber, scout: "owner" }))
  const scouts = ["owner", "b", "c", "d", "e", "f"]
  const plan = planMatchAssignments(groups, scouts, match, 123)
  expect(plan).toHaveLength(6)
  expect(new Set(plan.map(row => row.teamNumber)).size).toBe(6)
  expect(new Set(plan.map(row => row.scout)).size).toBe(6)
  expect(planMatchAssignments(groups, scouts, match, 123)).toEqual(plan)
  const selections = new Set(Array.from({ length: 20 }, (_, seed) => planMatchAssignments(groups, scouts, match, seed).find(row => row.scout === "owner")!.teamNumber))
  expect(selections.size).toBeGreaterThan(1)
  expect(planMatchAssignments(groups, scouts.slice(0, 2), match, 123)).toHaveLength(2)
})

test("per-match permissions follow the randomized assignment rather than every regular team", async () => {
  const { admin, scout, sub, eventId, memberId, subId } = await fixture()
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId, included: true })
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId: subId, included: true })
  await admin.mutation(api.scoutAssignments.generate, { eventId })
  const mine = await scout.query(api.scoutAssignments.mine, { eventId })
  const theirs = await sub.query(api.scoutAssignments.mine, { eventId })
  expect(mine.teams).toHaveLength(3)
  expect(theirs.teams).toHaveLength(3)
  expect(mine.matchAssignments).toHaveLength(1)
  expect(theirs.matchAssignments).toHaveLength(1)
  expect(mine.matchAssignments[0].teamNumber).not.toBe(theirs.matchAssignments[0].teamNumber)
  expect((await scout.query(api.scoutAssignments.mine, { eventId })).matchAssignments).toEqual(mine.matchAssignments)
  const otherHomeTeam = mine.teams.find(team => team.teamNumber !== mine.matchAssignments[0].teamNumber)!
  await expect(scout.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 1, teamNumber: otherHomeTeam.teamNumber })).rejects.toThrow("assigned teams only")
  await scout.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 1, teamNumber: mine.matchAssignments[0].teamNumber })
  const overview = await admin.query(api.scoutAssignments.adminList, { eventId })
  expect(overview.matchAssignments[0].uncovered).toBe(4)
})

async function fixture() {
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com")
  const t = convexTest(schema, modules)
  const identity = (name: string) => ({ tokenIdentifier: name, subject: name, issuer: "test", email: `${name}@example.com` })
  const admin = t.withIdentity(identity("admin"))
  const scout = t.withIdentity(identity("scout"))
  const sub = t.withIdentity(identity("sub"))
  const ids = await t.run(async ctx => {
    const eventId = await ctx.db.insert("events", { eventKey: "2026test", importStatus: "ready", createdByToken: "admin", scoutingEnabled: true })
    const memberId = await ctx.db.insert("members", { tokenIdentifier: "scout", email: "scout@example.com", name: "Scout", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    const subId = await ctx.db.insert("members", { tokenIdentifier: "sub", email: "sub@example.com", name: "Sub", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    const pendingId = await ctx.db.insert("members", { tokenIdentifier: "pending", email: "pending@example.com", name: "Pending", role: "scout", approvalStatus: "pending", lastSeenAt: 1 })
    for (let teamNumber = 1; teamNumber <= 6; teamNumber++) await ctx.db.insert("teams", { eventId, teamNumber, tbaTeamKey: `frc${teamNumber}`, nickname: `Team ${teamNumber}`, ...(teamNumber === 1 ? { eventTeamAlias: "10014R" } : {}) })
    await ctx.db.insert("matches", { eventId, tbaMatchKey: "2026test_qm1", matchNumber: 1, redTeams: [1, 2, 3], blueTeams: [4, 5, 6] })
    return { eventId, memberId, subId, pendingId }
  })
  return { t, admin, scout, sub, ...ids }
}

test("only admins choose participants and generate event-scoped assignments", async () => {
  const { t, admin, scout, eventId, memberId, pendingId } = await fixture()
  await expect(scout.mutation(api.scoutAssignments.setParticipant, { eventId, memberId, included: true })).rejects.toThrow("Unauthorized")
  await expect(scout.mutation(api.scoutAssignments.generate, { eventId })).rejects.toThrow("Unauthorized")
  await expect(scout.query(api.scoutAssignments.adminList, { eventId })).rejects.toThrow("Unauthorized")
  await expect(admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId: pendingId, included: true })).rejects.toThrow("approved")
  await expect(admin.mutation(api.scoutAssignments.generate, { eventId })).rejects.toThrow("Include at least")
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId, included: true })
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId, included: true })
  expect((await admin.query(api.scoutAssignments.adminList, { eventId })).participants).toHaveLength(1)
  expect(await admin.mutation(api.scoutAssignments.generate, { eventId })).toEqual({ assigned: 6, unassigned: 0, hasSchedule: true })
  expect((await scout.query(api.scoutAssignments.mine, { eventId })).teams).toHaveLength(6)
  expect((await scout.query(api.scoutAssignments.mine, { eventId })).matchAssignments).toHaveLength(1)
  expect((await scout.query(api.scoutAssignments.mine, { eventId })).enabled).toBe(true)
  await t.run(async ctx => { await ctx.db.patch(eventId, { scoutingEnabled: false }) })
  // Planning is allowed before the event, but actual claims remain closed.
  await admin.mutation(api.scoutAssignments.generate, { eventId })
  const team = (await scout.query(api.scoutAssignments.mine, { eventId })).teams[0]
  await expect(scout.mutation(api.matchScouting.claimRobot, { eventId, teamNumber: team.teamNumber, matchNumber: 1 })).rejects.toThrow()
})

test("manual editing allows overlapping groups without a cap, but validates roster and membership", async () => {
  const { t, admin, scout, eventId, memberId, subId } = await fixture()
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId, included: true })
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 1, memberId })
  expect((await scout.query(api.scoutAssignments.mine, { eventId })).teams).toEqual([{ teamNumber: 1, label: "10014R" }])
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 2, memberId })
  expect((await scout.query(api.scoutAssignments.mine, { eventId })).matchAssignments).toHaveLength(1)
  await expect(admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 2, memberId: subId })).rejects.toThrow("included")
  await expect(admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 999, memberId })).rejects.toThrow("not found")
  await expect(scout.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 1, memberId: null })).rejects.toThrow("Unauthorized")
  await t.run(async ctx => { for (const match of await ctx.db.query("matches").take(10)) await ctx.db.delete(match._id) })
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 2, memberId })
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 3, memberId })
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 4, memberId })
  expect((await scout.query(api.scoutAssignments.mine, { eventId })).teams).toHaveLength(4)
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 1, memberId: null })
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 4, memberId })
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId, included: false })
  expect((await scout.query(api.scoutAssignments.mine, { eventId })).teams).toHaveLength(0)
})

test("scouts are restricted to assigned teams while existing claims and handoffs stay valid", async () => {
  const { admin, scout, sub, eventId, memberId } = await fixture()
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId, included: true })
  await admin.mutation(api.scoutAssignments.assignTeam, { eventId, teamNumber: 1, memberId })
  await admin.mutation(api.scoutAssignments.setEnabled, { eventId, enabled: true })
  await expect(scout.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 1, teamNumber: 2 })).rejects.toThrow("assigned teams only")
  await expect(sub.mutation(api.matchScouting.saveReport, { eventId, matchNumber: 1, teamNumber: 2, autoFuel: 0, teleopFuel: 0, autoClimb: "none", autoNotes: "", teleopNotes: "", endgameClimb: "none", endgameNotes: "", driverRating: 5, defenseRating: 5, tags: [] })).rejects.toThrow("assigned teams only")
  const claimId = await scout.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 1, teamNumber: 1 })
  await admin.mutation(api.scoutAssignments.setParticipant, { eventId, memberId, included: false })
  expect(await scout.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 1, teamNumber: 1 })).toBe(claimId)
  const substituteId = (await scout.query(api.matchScouting.availableSubstitutes, {})).find(member => member.name === "Sub")!._id
  await scout.mutation(api.matchScouting.requestSubstitute, { claimId, substituteId })
  const requestedAt = (await sub.query(api.matchScouting.myHandoffs, {}))[0].breakRequestedAt!
  await sub.mutation(api.matchScouting.confirmSubstitute, { claimId, requestedAt, action: "accept" })
  await scout.mutation(api.matchScouting.confirmSubstitute, { claimId, requestedAt, action: "confirm" })
  expect(await sub.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 1, teamNumber: 1 })).toBe(claimId)
  await sub.mutation(api.matchScouting.saveReport, { eventId, matchNumber: 1, teamNumber: 1, autoFuel: 0, teleopFuel: 0, autoClimb: "none", autoNotes: "", teleopNotes: "", endgameClimb: "none", endgameNotes: "", driverRating: 5, defenseRating: 5, tags: [] })
  await admin.mutation(api.scoutAssignments.setEnabled, { eventId, enabled: false })
  await scout.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 2, teamNumber: 2 })
})
