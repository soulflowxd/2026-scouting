/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

async function fixture() {
  const t = convexTest(schema, modules)
  const data = await t.run(async ctx => {
    for (const [tokenIdentifier, role, approvalStatus] of [
      ["admin", "admin", "approved"], ["super", "superAdmin", "approved"],
      ["scout", "scout", "approved"], ["pending", "scout", "pending"],
      ["rejected", "admin", "rejected"],
    ] as const) await ctx.db.insert("members", { tokenIdentifier, role, approvalStatus, lastSeenAt: 1 })
    const eventId = await ctx.db.insert("events", { eventKey: "2026test", importStatus: "ready", createdByToken: "admin", scoutingEnabled: false })
    const pitId = await ctx.db.insert("pitReports", {
      eventId, teamNumber: 127, scoutToken: "scout", canScoreFuelHub: true,
      canIntakeDepot: true, canIntakeFloor: true, canPreload: false, preloadCount: 0,
      canClimbLevel1: false, canClimbLevel2: false, canClimbLevel3: false,
      canAutoClimbLevel1: false, canCrossBump: true, canCrossTrench: true,
      drivetrain: "Tank", notes: "Fixture", updatedAt: 1,
    })
    const match = { eventId, matchNumber: 1, teamNumber: 127, scoutToken: "scout", autoClimb: "none" as const,
      autoNotes: "", teleopNotes: "", endgameClimb: "none" as const, endgameNotes: "",
      driverRating: 7, defenseRating: 5, tags: ["Broke down"], updatedAt: 1 }
    const matchId = await ctx.db.insert("matchReports", match)
    const siblingId = await ctx.db.insert("matchReports", { ...match, scoutToken: "other" })
    const alertId = await ctx.db.insert("scoutNotifications", { eventId, matchNumber: 1, teamNumber: 127,
      kind: "robotBreakdown", recipientToken: "scout", message: "Fixture breakdown", createdAt: 1 })
    return { eventId, pitId, matchId, siblingId, alertId }
  })
  return { t, ...data }
}

test("report deletion requires an approved admin, including for scouts' own reports", async () => {
  const { t, pitId, matchId } = await fixture()
  for (const token of [null, "scout", "pending", "rejected"]) {
    const actor = token ? t.withIdentity({ tokenIdentifier: token }) : t
    await expect(actor.mutation(api.pit.remove, { reportId: pitId })).rejects.toThrow()
    await expect(actor.mutation(api.matchScouting.removeReport, { reportId: matchId })).rejects.toThrow()
  }
  await t.run(async ctx => {
    expect(await ctx.db.get(pitId)).not.toBeNull()
    expect(await ctx.db.get(matchId)).not.toBeNull()
  })
})

test("admins delete individual reports even on closed events; other reports stay and aggregates update", async () => {
  const { t, pitId, matchId, siblingId, eventId, alertId } = await fixture()
  await t.withIdentity({ tokenIdentifier: "admin" }).mutation(api.pit.remove, { reportId: pitId })
  await t.withIdentity({ tokenIdentifier: "super" }).mutation(api.matchScouting.removeReport, { reportId: matchId })
  expect(await t.query(api.pit.getForTeam, { eventId, teamNumber: 127 })).toEqual([])
  await t.run(async ctx => {
    expect(await ctx.db.get(matchId)).toBeNull()
    expect(await ctx.db.get(siblingId)).not.toBeNull()
    expect(await ctx.db.get(alertId)).not.toBeNull()
  })
  expect(await t.withIdentity({ tokenIdentifier: "scout" }).query(api.notifications.mine, {})).toHaveLength(1)
  await t.withIdentity({ tokenIdentifier: "admin" }).mutation(api.matchScouting.removeReport, { reportId: siblingId })
  expect(await t.withIdentity({ tokenIdentifier: "scout" }).query(api.notifications.mine, {})).toEqual([])
  expect(await t.query(internal.pushSubscriptions.delivery, { notificationId: alertId })).toBeNull()
  await expect(t.withIdentity({ tokenIdentifier: "admin" }).mutation(api.pit.remove, { reportId: pitId })).rejects.toThrow("not found")
})

test("deleting a match report preserves independent breakdown follow-ups", async () => {
  const { t, matchId, siblingId, eventId } = await fixture()
  const followUpId = await t.run(ctx => ctx.db.insert("breakdownFollowUps", { eventId, matchNumber: 1,
    teamNumber: 127, whatBroke: "Chain", cause: "Wear", repairStatus: "Fixed", notes: "",
    scoutToken: "scout", scoutName: "Scout", submittedAt: 1 }))
  const admin = t.withIdentity({ tokenIdentifier: "admin" })
  await admin.mutation(api.matchScouting.removeReport, { reportId: matchId })
  await admin.mutation(api.matchScouting.removeReport, { reportId: siblingId })
  await t.run(async ctx => { expect(await ctx.db.get(followUpId)).not.toBeNull() })
})

test("all scouts and admins are locked out of repeat submissions until every existing report is deleted", async () => {
  const { t, eventId, pitId, matchId, siblingId } = await fixture()
  await t.run(ctx => ctx.db.patch(eventId, { scoutingEnabled: true }))
  const pit = { eventId, teamNumber: 127, canScoreFuelHub: true, canIntakeDepot: true,
    canIntakeFloor: true, canPreload: false, preloadCount: 0, canClimbLevel1: false,
    canClimbLevel2: false, canClimbLevel3: false, canAutoClimbLevel1: false,
    canCrossBump: true, canCrossTrench: true, drivetrain: "Tank", notes: "Replacement" }
  const match = { eventId, matchNumber: 1, teamNumber: 127, autoFuel: 0, teleopFuel: 0,
    autoClimb: "none" as const, autoNotes: "", autoPath: [[{ x: 100, y: 200 }]], teleopNotes: "Replacement",
    endgameClimb: "none" as const, endgameNotes: "", driverRating: 5, defenseRating: 5, tags: [] }
  const admin = t.withIdentity({ tokenIdentifier: "admin" })
  for (const tokenIdentifier of ["admin", "super", "scout"]) {
    const actor = t.withIdentity({ tokenIdentifier })
    await expect(actor.mutation(api.matchScouting.saveReport, match)).rejects.toThrow("already submitted")
    await expect(actor.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 1, teamNumber: 127 })).rejects.toThrow("already submitted")
    if (tokenIdentifier !== "scout") await expect(actor.mutation(api.pit.save, pit)).rejects.toThrow("already submitted")
  }
  expect(await admin.query(api.matchScouting.reportSubmitted, { eventId, matchNumber: 1, teamNumber: 127 })).toBe(true)
  await admin.mutation(api.matchScouting.removeReport, { reportId: matchId })
  await expect(admin.mutation(api.matchScouting.saveReport, match)).rejects.toThrow("already submitted")
  await admin.mutation(api.matchScouting.removeReport, { reportId: siblingId })
  expect(await admin.query(api.matchScouting.reportSubmitted, { eventId, matchNumber: 1, teamNumber: 127 })).toBe(false)
  await admin.mutation(api.pit.remove, { reportId: pitId })
  await admin.mutation(api.pit.save, pit)
  await admin.mutation(api.matchScouting.saveReport, match)
  await expect(admin.mutation(api.pit.save, pit)).rejects.toThrow("already submitted")
  await expect(admin.mutation(api.matchScouting.saveReport, match)).rejects.toThrow("already submitted")
})
