/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import schema from "./schema"
import { api, internal } from "./_generated/api"

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }))
vi.mock("web-push", () => ({ default: { sendNotification } }))
const modules = import.meta.glob("./**/*.ts")

test("push is private, delivered through Web Push, and stops after a follow-up", async () => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "test-public")
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private")
  sendNotification.mockResolvedValue({ statusCode: 201 })
  const t = convexTest(schema, modules)
  const scout = t.withIdentity({ email: "scout@example.com", tokenIdentifier: "scout" })
  const other = t.withIdentity({ email: "other@example.com", tokenIdentifier: "other" })
  const notificationId = await t.run(async (ctx) => {
    await ctx.db.insert("members", { tokenIdentifier: "scout", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    await ctx.db.insert("members", { tokenIdentifier: "other", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    const eventId = await ctx.db.insert("events", { eventKey: "test", importStatus: "empty", createdByToken: "scout" })
    return await ctx.db.insert("scoutNotifications", { eventId, recipientToken: "scout", kind: "robotBreakdown", matchNumber: 1, teamNumber: 127, message: "Broke down", createdAt: 1 })
  })
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test", p256dh: "A".repeat(87), auth: "B".repeat(22) }
  await expect(scout.mutation(api.pushSubscriptions.save, { ...subscription, endpoint: "https://localhost/private" })).rejects.toThrow("Unsupported")
  await scout.mutation(api.pushSubscriptions.save, subscription)
  await other.mutation(api.pushSubscriptions.remove, { endpoint: subscription.endpoint })
  await t.action(internal.push.sendBreakdown, { notificationId })
  expect(sendNotification).toHaveBeenCalledTimes(1)
  const payload = JSON.parse(sendNotification.mock.calls[0][1])
  expect(payload.url).toBe(`/matches?breakdown=${notificationId}`)
  expect(payload.title).toContain("127")
  await scout.mutation(api.notifications.submitBreakdownFollowUp, { notificationId, whatBroke: "Chain", cause: "Loose", repairStatus: "Fixed", notes: "" })
  await t.action(internal.push.sendBreakdown, { notificationId })
  expect(sendNotification).toHaveBeenCalledTimes(1)
})
