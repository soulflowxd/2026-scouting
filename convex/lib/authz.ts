import type { UserIdentity } from "convex/server"
import { getAuthUserId } from "@convex-dev/auth/server"
import type { Id } from "../_generated/dataModel"
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
  const member = await ctx.db
    .query("members")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", user.tokenIdentifier),
    )
    .unique()
  const bootstrapRole = roleForIdentity({
    tokenIdentifier: user.tokenIdentifier,
    email: email ?? undefined,
  })
  const role =
    bootstrapRole === "superAdmin"
      ? "superAdmin"
      : member?.role ?? bootstrapRole
  const approvalStatus =
    role === "superAdmin" || role === "admin"
      ? member?.approvalStatus === "rejected"
        ? "rejected"
        : "approved"
      : member?.approvalStatus ?? (member ? "approved" : "pending")

  return {
    ...user,
    email,
    name,
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
  const member = await ctx.db
    .query("members")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", user.tokenIdentifier),
    )
    .unique()

  return { user, member }
}
