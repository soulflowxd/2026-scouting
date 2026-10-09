/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
test("cleanup is restricted to named events and preserves official results, rosters and other events", async () => {
  const t = convexTest(schema, modules)
  await t.run(async ctx => {
    for (const eventKey of ["2026new", "2026txhou1", "2026ntx"]) {
      const eventId = await ctx.db.insert("events", { eventKey, importStatus: "ready", createdByToken: "admin" })
      await ctx.db.insert("teams", { eventId, teamNumber: 1, tbaTeamKey: "frc1", nickname: "Team" })
      await ctx.db.insert("matches", { eventId, matchNumber: 1, tbaMatchKey: "qm1", redTeams: [1], blueTeams: [], completionReviewAt: 1, completionAssignments: [], tbaResult: { red: { totalMatchPoints: 10, wonMatch: true, tiedMatch: false }, blue: { totalMatchPoints: 0, wonMatch: false, tiedMatch: false } } })
      await ctx.db.insert("pitReports", { eventId, teamNumber: 1, scoutToken: "scout", canScoreFuelHub: true, canIntakeDepot: true, canIntakeFloor: true, canPreload: false, preloadCount: 0, canClimbLevel1: false, canClimbLevel2: false, canClimbLevel3: false, canAutoClimbLevel1: false, canCrossBump: true, canCrossTrench: true, drivetrain: "Tank", notes: "Test", updatedAt: 1 })
      await ctx.db.insert("matchReports", { eventId, matchNumber: 1, teamNumber: 1, scoutToken: "scout", autoClimb: "none", autoNotes: "", teleopNotes: "", endgameClimb: "none", endgameNotes: "", driverRating: 1, defenseRating: 1, tags: [], updatedAt: 1 })
      await ctx.db.insert("breakdownFollowUps", { eventId, matchNumber: 1, teamNumber: 1, whatBroke: "Wheel", cause: "Impact", repairStatus: "Fixed", notes: "", scoutToken: "scout", scoutName: "Scout", submittedAt: 1 })
      await ctx.db.insert("scoutNotifications", { eventId, matchNumber: 1, teamNumber: 1, kind: "robotBreakdown", recipientToken: "scout", message: "Test", createdAt: 1 })
      await ctx.db.insert("matchRobotClaims", { eventId, matchNumber: 1, teamNumber: 1, scoutToken: "scout", status: "active", claimedAt: 1 })
    }
  })
  for (const eventKey of ["2026new", "2026txhou1"] as const) {
    for (const kind of ["pitReports", "matchReports", "breakdownFollowUps", "scoutNotifications", "matchRobotClaims", "reviews"] as const) {
      expect(await t.mutation(internal.scoutingCleanup.clearBatch, { eventKey, kind })).toMatchObject({ cleared: 1, done: true })
      expect(await t.mutation(internal.scoutingCleanup.clearBatch, { eventKey, kind })).toMatchObject({ cleared: 0, done: true })
    }
  }
  await t.run(async ctx => {
    for (const table of ["pitReports", "matchReports", "breakdownFollowUps", "scoutNotifications", "matchRobotClaims"] as const) expect(await ctx.db.query(table).take(10)).toHaveLength(1)
    expect(await ctx.db.query("teams").take(10)).toHaveLength(3)
    const matches = await ctx.db.query("matches").take(10)
    expect(matches).toHaveLength(3)
    expect(matches.every(match => match.tbaResult?.red.totalMatchPoints === 10)).toBe(true)
    expect(matches.filter(match => match.completionReviewAt !== undefined)).toHaveLength(1)
  })
})
