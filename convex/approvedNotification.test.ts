/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }))
vi.mock("web-push", () => ({ default: { sendNotification } }))
const modules = import.meta.glob("./**/*.ts")

test("pending scouts can enable approval push, approval sends once and can be dismissed", async () => {
  vi.useFakeTimers()
  vi.stubEnv("VAPID_PUBLIC_KEY", "public")
  vi.stubEnv("VAPID_PRIVATE_KEY", "private")
  sendNotification.mockResolvedValue({ statusCode: 201 })
  const t = convexTest(schema, modules)
  const memberId = await t.run(async ctx => {
    await ctx.db.insert("members", { tokenIdentifier: "admin", role: "admin", approvalStatus: "approved", lastSeenAt: 1 })
    return await ctx.db.insert("members", { tokenIdentifier: "scout", role: "scout", approvalStatus: "pending", lastSeenAt: 1 })
  })
  const scout = t.withIdentity({ email: "scout@example.com", tokenIdentifier: "scout" })
  const admin = t.withIdentity({ email: "admin@example.com", tokenIdentifier: "admin" })
  await scout.mutation(api.pushSubscriptions.save, { endpoint: "https://fcm.googleapis.com/scout", p256dh: "A".repeat(87), auth: "B".repeat(22) })
  await expect(scout.mutation(api.members.setApproval, { memberId, status: "approved" })).rejects.toThrow()
  await admin.mutation(api.members.setApproval, { memberId, status: "approved" })
  await admin.mutation(api.members.setApproval, { memberId, status: "approved" })
  expect((await scout.query(api.members.me, {})).member?.approvalNoticePending).toBe(true)
  await t.run(async ctx => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect()
    expect(jobs.filter(job => job.name.includes("sendApproved"))).toHaveLength(1)
  })
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  expect(sendNotification).toHaveBeenCalledTimes(1)
  expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({ title: "Your account is approved", url: "/" })
  await scout.mutation(api.members.acknowledgeApproval, {})
  expect((await scout.query(api.members.me, {})).member?.approvalNoticePending).toBe(false)
  await admin.mutation(api.members.setApproval, { memberId, status: "rejected" })
  await t.action(internal.push.sendApproved, { memberId })
  expect(sendNotification).toHaveBeenCalledTimes(1)
  await expect(scout.mutation(api.pushSubscriptions.save, { endpoint: "https://fcm.googleapis.com/scout", p256dh: "A".repeat(87), auth: "B".repeat(22) })).rejects.toThrow()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
