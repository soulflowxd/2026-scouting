/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"
const modules = import.meta.glob("./**/*.ts")

test("retries acknowledge the same owner's report without duplicates or bypassing new-report locks", async () => {
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    for (const token of ["owner", "other"]) await ctx.db.insert("members", { tokenIdentifier: token, role: "admin", approvalStatus: "approved", lastSeenAt: 1 })
    return await ctx.db.insert("events", { eventKey: "ntx", importStatus: "ready", createdByToken: "owner", scoutingEnabled: true })
  })
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const other = t.withIdentity({ tokenIdentifier: "other" })
  const pit = { eventId, teamNumber: 1, clientSubmissionId: "pit-offline-id",
    canScoreFuelHub: true, canIntakeDepot: true, canIntakeFloor: true, canPreload: true, preloadCount: 6,
    canClimbLevel1: false, canClimbLevel2: true, canClimbLevel3: false, canAutoClimbLevel1: false,
    canCrossBump: true, canCrossTrench: true, drivetrain: "Tank", notes: "Offline" }
  const match = { eventId, matchNumber: 1, teamNumber: 1, clientSubmissionId: "match-offline-id",
    autoFuel: 0, teleopFuel: 0, autoClimb: "none" as const, autoNotes: "",
    teleopNotes: "", endgameClimb: "none" as const, endgameNotes: "", driverRating: 5, defenseRating: 5, tags: [] }
  const pitId = await owner.mutation(api.pit.save, pit)
  const matchId = await owner.mutation(api.matchScouting.saveReport, match)
  expect(await owner.mutation(api.pit.save, pit)).toBe(pitId)
  expect(await owner.mutation(api.matchScouting.saveReport, match)).toBe(matchId)
  await expect(other.mutation(api.pit.save, pit)).rejects.toThrow()
  await expect(other.mutation(api.matchScouting.saveReport, match)).rejects.toThrow()
  await expect(owner.mutation(api.pit.save, { ...pit, clientSubmissionId: "different" })).rejects.toThrow()
  await expect(owner.mutation(api.matchScouting.saveReport, { ...match, clientSubmissionId: "different" })).rejects.toThrow()
  await owner.mutation(api.events.setScoutingEnabled, { eventId, enabled: false })
  expect(await owner.mutation(api.pit.save, pit)).toBe(pitId)
  expect(await owner.mutation(api.matchScouting.saveReport, match)).toBe(matchId)
  await expect(owner.mutation(api.pit.save, { ...pit, teamNumber: 2 })).rejects.toThrow("closed")
  await expect(owner.mutation(api.matchScouting.saveReport, { ...match, teamNumber: 2 })).rejects.toThrow("closed")
  await t.run(async ctx => {
    expect(await ctx.db.query("pitReports").collect()).toHaveLength(1)
    expect(await ctx.db.query("matchReports").collect()).toHaveLength(1)
  })
})
