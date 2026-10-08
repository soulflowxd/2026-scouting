/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import { Scrypt } from "lucia"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const issuer = "https://test.convex.site"

test("super admin archives obsolete same-email accounts but their sessions cannot inherit access", async () => {
  vi.useFakeTimers()
  try {
    const t = convexTest(schema, modules)
    const seed = await t.run(async ctx => {
      const adminId = await ctx.db.insert("users", { email: "luqman.a.khan101010@gmail.com" })
      const oldId = await ctx.db.insert("users", { email: "duplicate@example.com" })
      const currentId = await ctx.db.insert("users", { email: "duplicate@example.com" })
      await ctx.db.insert("authAccounts", { userId: currentId, provider: "password", providerAccountId: "duplicate@example.com" })
      const old = await ctx.db.insert("members", { authUserId: oldId, tokenIdentifier: `${issuer}|${oldId}|old`, email: "duplicate@example.com", role: "scout", lastSeenAt: 1 })
      const current = await ctx.db.insert("members", { authUserId: currentId, tokenIdentifier: `${issuer}|${currentId}|current`, email: "duplicate@example.com", role: "scout", lastSeenAt: 1 })
      return { adminId, oldId, old, current }
    })
    const admin = t.withIdentity({ issuer, subject: `${seed.adminId}|session` })
    expect(await admin.mutation(api.members.mergeDuplicates, { memberId: seed.old })).toBe(1)
    const old = t.withIdentity({ issuer, subject: `${seed.oldId}|new`, tokenIdentifier: `${issuer}|${seed.oldId}|new` })
    expect((await old.query(api.members.me, {})).approvalStatus).toBe("rejected")
    await expect(old.mutation(api.members.ensureMe, {})).rejects.toThrow("archived")
    await t.run(async ctx => { expect((await ctx.db.get(seed.old))?.mergedInto).toBe(seed.current) })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  } finally { vi.useRealTimers() }
})

test("admins merge another scout's session rows without merging different users and can edit persistent names", async () => {
  vi.useFakeTimers()
  try {
    const t = convexTest(schema, modules)
    const seed = await t.run(async ctx => {
      const adminId = await ctx.db.insert("users", { email: "admin@example.com" })
      const userId = await ctx.db.insert("users", { email: "same@example.com" })
      const otherId = await ctx.db.insert("users", { email: "same@example.com" })
      await ctx.db.insert("members", { authUserId: adminId, tokenIdentifier: "admin-token", role: "admin", lastSeenAt: 1 })
      const member = await ctx.db.insert("members", { tokenIdentifier: `${issuer}|${userId}|one`, email: "same@example.com", role: "scout", lastSeenAt: 1 })
      const duplicate = await ctx.db.insert("members", { tokenIdentifier: `${issuer}|${userId}|two`, email: "same@example.com", role: "scout", lastSeenAt: 1 })
      const other = await ctx.db.insert("members", { authUserId: otherId, tokenIdentifier: "other-token", email: "same@example.com", role: "scout", lastSeenAt: 1 })
      return { adminId, userId, member, duplicate, other }
    })
    const admin = t.withIdentity({ issuer, subject: `${seed.adminId}|session`, tokenIdentifier: "admin-token" })
    expect(await admin.mutation(api.members.mergeDuplicates, { memberId: seed.member })).toBe(1)
    await admin.mutation(api.members.setName, { memberId: seed.member, name: "  Scout Name  " })
    const scout = t.withIdentity({ issuer, subject: `${seed.userId}|new`, tokenIdentifier: `${issuer}|${seed.userId}|new` })
    await scout.mutation(api.members.ensureMe, {})
    expect((await scout.query(api.members.me, {})).name).toBe("Scout Name")
    await expect(scout.mutation(api.members.setName, { memberId: seed.other, name: "Bad" })).rejects.toThrow("Unauthorized")
    await expect(admin.mutation(api.members.setName, { memberId: seed.member, name: " " })).rejects.toThrow("Name must")
    await t.run(async ctx => {
      expect((await ctx.db.get(seed.duplicate))?.mergedInto).toBe(seed.member)
      expect((await ctx.db.get(seed.other))?.mergedInto).toBeUndefined()
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  } finally { vi.useRealTimers() }
})

test("sessions resolve to one member and duplicate rows are archived with ownership preserved", async () => {
  vi.useFakeTimers()
  try {
    const t = convexTest(schema, modules)
    const seed = await t.run(async ctx => {
      const userId = await ctx.db.insert("users", { email: "luqman.a.khan101010@gmail.com", name: "Luqman" })
      const canonical = `${issuer}|${userId}|original`
      const alias = `${issuer}|${userId}|duplicate`
      const keep = await ctx.db.insert("members", { tokenIdentifier: canonical, email: "luqman.a.khan101010@gmail.com", role: "superAdmin", lastSeenAt: 1 })
      const duplicate = await ctx.db.insert("members", { tokenIdentifier: alias, email: "luqman.a.khan101010@gmail.com", role: "admin", lastSeenAt: 2 })
      const eventId = await ctx.db.insert("events", { eventKey: "2026test", createdByToken: canonical, importStatus: "empty" })
      const listId = await ctx.db.insert("pickLists", { eventId, name: "Saved board", kind: "personal", ownerToken: alias, createdAt: 1, updatedAt: 1 })
      return { userId, canonical, keep, duplicate, listId }
    })
    const session = (id: string) => t.withIdentity({ issuer, subject: `${seed.userId}|${id}`, tokenIdentifier: `${issuer}|${seed.userId}|${id}` })
    expect((await session("new").query(api.members.me, {})).tokenIdentifier).toBe(seed.canonical)
    expect(await session("new").mutation(api.members.ensureMe, {})).toBe(seed.keep)
    expect(await session("another").mutation(api.members.ensureMe, {})).toBe(seed.keep)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const listed = await session("new").query(api.members.listForAdmin, {})
    expect(listed).toHaveLength(1)
    expect(listed[0].role).toBe("superAdmin")
    await t.run(async ctx => {
      expect((await ctx.db.get(seed.duplicate))?.mergedInto).toBe(seed.keep)
      expect((await ctx.db.get(seed.listId))?.ownerToken).toBe(seed.canonical)
    })
  } finally { vi.useRealTimers() }
})

test("password change checks current secret, hashes the replacement, and revokes other sessions", async () => {
  const t = convexTest(schema, modules)
  const crypto = new Scrypt()
  const secret = await crypto.hash("Original-password")
  const seed = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { email: "scout@example.com" })
    const current = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 100000 })
    const other = await ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 100000 })
    const account = await ctx.db.insert("authAccounts", { userId, provider: "password", providerAccountId: "scout@example.com", secret })
    const member = await ctx.db.insert("members", { authUserId: userId, tokenIdentifier: "canonical-scout", email: "scout@example.com", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    return { userId, current, other, account, member }
  })
  const scout = t.withIdentity({ issuer, subject: `${seed.userId}|${seed.current}`, tokenIdentifier: `${issuer}|${seed.userId}|${seed.current}` })
  await expect(scout.action(api.auth.changePassword, { currentPassword: "wrong", newPassword: "Replacement-password" })).rejects.toThrow("Current password")
  await expect(scout.action(api.auth.changePassword, { currentPassword: "Original-password", newPassword: "Replacement-password", memberId: seed.member })).rejects.toThrow("Unauthorized")
  await scout.action(api.auth.changePassword, { currentPassword: "Original-password", newPassword: "Replacement-password" })
  const hash = await t.run(async ctx => {
    expect(await ctx.db.get(seed.current)).not.toBeNull()
    expect(await ctx.db.get(seed.other)).toBeNull()
    return (await ctx.db.get(seed.account))!.secret!
  })
  expect(hash).not.toBe("Replacement-password")
  expect(await crypto.verify(hash, "Replacement-password")).toBe(true)
  expect(await crypto.verify(hash, "Original-password")).toBe(false)
})
