/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

test("approval alerts are admin-only, deduplicated across sessions, and resolve with approval", async () => {
  const t = convexTest(schema, modules)
  const { userId, adminId, disabledId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { name: "New Scout", email: "new@example.com" })
    const adminId = await ctx.db.insert("users", { email: "admin@example.com" })
    const disabledId = await ctx.db.insert("users", { email: "disabled@example.com" })
    for (const [id, token, status] of [[adminId, "admin", "approved"], [disabledId, "disabled", "rejected"]] as const) {
      await ctx.db.insert("members", { authUserId: id, tokenIdentifier: token, role: "admin", approvalStatus: status, lastSeenAt: 1 })
      await ctx.db.insert("pushSubscriptions", { recipientToken: token, endpoint: `https://fcm.googleapis.com/${token}`, p256dh: "key", auth: "auth", updatedAt: 1 })
    }
    return { userId, adminId, disabledId }
  })
  const scout = t.withIdentity({ issuer: "https://auth.test", subject: `${userId}|first` })
  const memberId = await scout.mutation(api.members.ensureMe, {})
  await t.withIdentity({ issuer: "https://auth.test", subject: `${userId}|second` }).mutation(api.members.ensureMe, {})
  const admin = t.withIdentity({ issuer: "https://auth.test", subject: `${adminId}|session`, tokenIdentifier: "admin" })
  expect(await admin.query(api.notifications.pendingApprovals, {})).toMatchObject([{ _id: memberId, name: "New Scout" }])
  expect(await scout.query(api.notifications.pendingApprovals, {})).toEqual([])
  expect(await t.query(api.notifications.pendingApprovals, {})).toEqual([])
  expect(await t.withIdentity({ issuer: "https://auth.test", subject: `${disabledId}|session`, tokenIdentifier: "disabled" }).query(api.notifications.pendingApprovals, {})).toEqual([])
  const delivery = await t.query(internal.pushSubscriptions.approvalDelivery, { memberId })
  expect(delivery?.subscriptions.map(s => s.recipientToken)).toEqual(["admin"])
  await t.run(async ctx => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect()
    expect(jobs.filter(job => job.name.includes("sendApproval"))).toHaveLength(1)
    await ctx.db.patch(memberId, { approvalStatus: "approved" })
  })
  expect(await admin.query(api.notifications.pendingApprovals, {})).toEqual([])
  expect(await t.query(internal.pushSubscriptions.approvalDelivery, { memberId })).toBeNull()
})
