import type { UserIdentity } from "convex/server"
import { getAuthUserId } from "@convex-dev/auth/server"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { readEnv } from "./env"

type AuthOnlyCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

export type AuthUser = {
  tokenIdentifier: string
  email: string | null
  name: string | null
  role: "superAdmin" | "admin" | "scout"
  approvalStatus: "pending" | "approved" | "rejected"
}

export const SUPER_ADMIN_EMAIL = "luqman.a.khan101010@gmail.com"

function normalizedAdminSet() {
  return new Set(
    readEnv("ADMIN_EMAILS")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function roleForIdentity(
  identity: Pick<UserIdentity, "tokenIdentifier" | "email">,
): "superAdmin" | "admin" | "scout" {
  const admins = normalizedAdminSet()
  const email = identity.email?.toLowerCase()
  if (email === SUPER_ADMIN_EMAIL) {
    return "superAdmin"
  }
  if (email && admins.has(email)) {
    return "admin"
  }
  if (admins.has(identity.tokenIdentifier.toLowerCase())) {
    return "admin"
  }
  return "scout"
}

export async function requireUser(ctx: AuthOnlyCtx): Promise<AuthUser> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Not authenticated")
  }

  return {
    tokenIdentifier: identity.tokenIdentifier,
    email: identity.email ?? null,
    name: identity.name ?? null,
    role: roleForIdentity(identity),
    approvalStatus:
      roleForIdentity(identity) === "scout" ? "pending" : "approved",
  }
}

export async function requireAdmin(ctx: AuthOnlyCtx) {
  const user = await requireUser(ctx)
  if (user.role !== "admin" && user.role !== "superAdmin") {
    throw new Error("Unauthorized")
  }
  return user
}

export async function requireUserFromDb(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx)
  const authUserId = await getAuthUserId(ctx)
  let authUser = null
  if (authUserId) {
    try {
      authUser = await ctx.db.get(authUserId as Id<"users">)
    } catch {
      authUser = null
    }
  }
  const email =
    typeof authUser?.email === "string" ? authUser.email : user.email
  const name = typeof authUser?.name === "string" ? authUser.name : user.name
  const member = await findMember(ctx)
  const bootstrapRole = roleForIdentity({
    tokenIdentifier: user.tokenIdentifier,
    email: email ?? undefined,
  })
  const role =
    bootstrapRole === "superAdmin"
      ? "superAdmin"
      : member?.role ?? bootstrapRole
  const approvalStatus =
    !member && (await memberCandidates(ctx)).some(row => row.mergedInto)
      ? "rejected"
      : role === "superAdmin" || role === "admin"
      ? member?.approvalStatus === "rejected"
        ? "rejected"
        : "approved"
      : member?.approvalStatus ?? (member ? "approved" : "pending")

  return {
    ...user,
    tokenIdentifier: member?.tokenIdentifier ?? user.tokenIdentifier,
    authUserId: authUser?._id ?? null,
    teamNumber: member?.teamNumber ?? authUser?.teamNumber,
    memberId: member?._id ?? null,
    email,
    name: member?.name || name,
    role,
    approvalStatus,
  }
}

export async function requireApprovedUserFromDb(
  ctx: QueryCtx | MutationCtx,
) {
  const user = await requireUserFromDb(ctx)
  if (user.approvalStatus !== "approved") {
    throw new Error(
      user.approvalStatus === "rejected"
        ? "Account access was not approved"
        : "Account is waiting for admin approval",
    )
  }
  return user
}

export async function requireAdminFromDb(ctx: QueryCtx | MutationCtx) {
  const user = await requireApprovedUserFromDb(ctx)
  if (user.role !== "admin" && user.role !== "superAdmin") {
    throw new Error("Unauthorized")
  }
  return user
}

export async function requireSuperAdminFromDb(ctx: QueryCtx | MutationCtx) {
  const user = await requireApprovedUserFromDb(ctx)
  if (user.role !== "superAdmin") {
    throw new Error("Super admin access required")
  }
  return user
}

export async function getCurrentMember(ctx: QueryCtx | MutationCtx) {
  const user = await requireUserFromDb(ctx)
  const member = user.memberId ? await ctx.db.get(user.memberId) : null

  return { user, member }
}

// Convex Auth subjects contain userId|sessionId; member ownership must not vary by session.
export async function memberCandidates(ctx: QueryCtx | MutationCtx): Promise<Doc<"members">[]> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return []
  const userId = await getAuthUserId(ctx)
  let authUser = null
  try { if (userId) authUser = await ctx.db.get(userId as Id<"users">) } catch { /* Non-Convex test identities. */ }
  if (!authUser) return await ctx.db.query("members").withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", identity.tokenIdentifier)).take(100)
  const linked = await ctx.db.query("members").withIndex("by_authUserId", q => q.eq("authUserId", authUser._id)).take(100)
  const prefix = identity.tokenIdentifier.slice(0, -identity.subject.length) + authUser._id + "|"
  const legacy = await ctx.db.query("members").withIndex("by_tokenIdentifier", q => q.gte("tokenIdentifier", prefix).lt("tokenIdentifier", prefix + "\uffff")).take(100)
  const exact = await ctx.db.query("members").withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", identity.tokenIdentifier)).take(1)
  return [...new Map([...linked, ...legacy, ...exact].map(row => [row._id, row])).values()]
}

export async function findMember(ctx: QueryCtx | MutationCtx) {
  return (await memberCandidates(ctx)).filter(row => !row.mergedInto).sort((a, b) => Number(b.role === "superAdmin") - Number(a.role === "superAdmin") || a._creationTime - b._creationTime)[0] ?? null
}
