/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

test("only approved admins can omit pit photos; uploads and event closure still validate", async () => {
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    for (const role of ["admin", "superAdmin", "scout"] as const) {
      await ctx.db.insert("members", { tokenIdentifier: role, role, approvalStatus: "approved", lastSeenAt: 1 })
    }
    await ctx.db.insert("members", { tokenIdentifier: "rejected", role: "admin", approvalStatus: "rejected", lastSeenAt: 1 })
    return await ctx.db.insert("events", { eventKey: "2026test", importStatus: "ready", createdByToken: "admin", scoutingEnabled: true })
  })
  const report = {
    eventId, teamNumber: 127, canScoreFuelHub: true, canIntakeDepot: true,
    canIntakeFloor: true, canPreload: true, preloadCount: 6,
    canClimbLevel1: false, canClimbLevel2: true, canClimbLevel3: false,
    canAutoClimbLevel1: false, canCrossBump: true, canCrossTrench: true,
    drivetrain: "Tank", notes: "Test fixture",
  }
  const admin = t.withIdentity({ tokenIdentifier: "admin" })
  const superAdmin = t.withIdentity({ tokenIdentifier: "superAdmin" })
  const scout = t.withIdentity({ tokenIdentifier: "scout" })
  await expect(t.mutation(api.pit.save, report)).rejects.toThrow("Not authenticated")
  await expect(t.withIdentity({ tokenIdentifier: "rejected" }).mutation(api.pit.save, report)).rejects.toThrow("not approved")
  for (const photoIds of [undefined, []]) {
    await expect(scout.mutation(api.pit.save, { ...report, photoIds })).rejects.toThrow("at least one robot photo")
    const adminReport = await admin.mutation(api.pit.save, { ...report, photoIds })
    await admin.mutation(api.pit.remove, { reportId: adminReport })
    const superReport = await superAdmin.mutation(api.pit.save, { ...report, photoIds })
    await superAdmin.mutation(api.pit.remove, { reportId: superReport })
  }
  const invalidPhoto = await t.run(ctx => ctx.storage.store(new Blob(["not an image"], { type: "text/plain" })))
  await expect(admin.mutation(api.pit.save, { ...report, photoIds: [invalidPhoto] })).rejects.toThrow("images under 10 MB")
  await expect(admin.mutation(api.pit.save, { ...report, photoIds: Array(5).fill(invalidPhoto) })).rejects.toThrow("Maximum 4")
  await admin.mutation(api.events.setScoutingEnabled, { eventId, enabled: false })
  await expect(admin.mutation(api.pit.save, report)).rejects.toThrow("closed")
  await expect(superAdmin.mutation(api.pit.save, report)).rejects.toThrow("closed")
})
