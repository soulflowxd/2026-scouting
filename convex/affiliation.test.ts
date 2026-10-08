/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"
import { signupProfile } from "./lib/signupProfile"

const modules = import.meta.glob("./**/*.ts")

test("signup requires one of the two teams without changing existing sign-in requirements", () => {
  for (const teamNumber of [undefined, "", "127", "9128.5"]) {
    expect(() => signupProfile({ flow: "signUp", firstName: "Scout", lastName: "Name", email: "scout@example.com", teamNumber })).toThrow("9128 or 10340")
  }
  for (const teamNumber of [9128, 10340]) expect(signupProfile({ flow: "signUp", firstName: " Scout ", lastName: " Name ", email: " SCOUT@example.com ", teamNumber: String(teamNumber) })).toEqual({ name: "Scout Name", email: "scout@example.com", teamNumber })
  expect(signupProfile({ flow: "signIn", email: "scout@example.com" })).not.toHaveProperty("teamNumber")
})

test("signup team persists across sessions and only admins may edit affiliation", async () => {
  const t = convexTest(schema, modules)
  const issuer = "https://auth.test"
  const { userId, adminId } = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { name: "Scout", email: "scout@example.com", teamNumber: 9128 })
    const adminId = await ctx.db.insert("users", { email: "admin@example.com" })
    await ctx.db.insert("members", { authUserId: adminId, tokenIdentifier: "admin", role: "admin", approvalStatus: "approved", lastSeenAt: 1 })
    return { userId, adminId }
  })
  const scout = t.withIdentity({ issuer, subject: `${userId}|first` })
  const memberId = await scout.mutation(api.members.ensureMe, {})
  expect((await scout.query(api.members.me, {})).teamNumber).toBe(9128)
  expect((await scout.query(api.members.me, {})).approvalStatus).toBe("pending")
  await expect(scout.mutation(api.members.setTeamNumber, { memberId, teamNumber: 10340 })).rejects.toThrow()
  const admin = t.withIdentity({ issuer, subject: `${adminId}|first`, tokenIdentifier: "admin" })
  await admin.mutation(api.members.setTeamNumber, { memberId, teamNumber: 10340 })
  const nextSession = t.withIdentity({ issuer, subject: `${userId}|second` })
  await nextSession.mutation(api.members.ensureMe, {})
  expect((await nextSession.query(api.members.me, {})).teamNumber).toBe(10340)
  await t.run(async ctx => { expect((await ctx.db.get(userId))?.teamNumber).toBe(10340) })
})
