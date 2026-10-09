/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

test("reject deletes pending login and sessions without allowing stale sessions to recreate it", async () => {
  const t = convexTest(schema, modules)
  const { userId, memberId, accountId, sessionId, refreshId } = await t.run(async ctx => {
    await ctx.db.insert("members", { tokenIdentifier: "admin", role: "admin", approvalStatus: "approved", lastSeenAt: 1 })
    const userId = await ctx.db.insert("users", { email: "pending@example.com", name: "Pending Scout" })
    const memberId = await ctx.db.insert("members", { authUserId: userId, tokenIdentifier: "pending", role: "scout", approvalStatus: "pending", lastSeenAt: 1 })
    const accountId = await ctx.db.insert("authAccounts", { userId, provider: "password", providerAccountId: "pending@example.com", secret: "hashed-fixture" })
    const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 100000 })
    const refreshId = await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: Date.now() + 100000 })
    return { userId, memberId, accountId, sessionId, refreshId }
  })
  const admin = t.withIdentity({ tokenIdentifier: "admin", email: "admin@example.com" })
  const scout = t.withIdentity({ tokenIdentifier: "pending", subject: `${userId}|old`, email: "pending@example.com" })
  await expect(scout.mutation(api.members.setApproval, { memberId, status: "rejected" })).rejects.toThrow()
  await admin.mutation(api.members.setApproval, { memberId, status: "rejected" })
  await t.run(async ctx => {
    for (const id of [userId, accountId, sessionId, refreshId]) expect(await ctx.db.get(id)).toBeNull()
    expect(await ctx.db.get(memberId)).toMatchObject({ mergedInto: memberId, approvalStatus: "rejected" })
  })
  expect((await admin.query(api.members.listForAdmin, {})).some(member => member._id === memberId)).toBe(false)
  await expect(scout.mutation(api.members.ensureMe, {})).rejects.toThrow()
})
