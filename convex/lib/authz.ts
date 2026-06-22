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
  role: "admin" | "scout"
}

function normalizedAdminSet() {
  return new Set(
    readEnv("ADMIN_EMAILS")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function roleForIdentity(identity: UserIdentity): "admin" | "scout" {
  const admins = normalizedAdminSet()
  const email = identity.email?.toLowerCase()
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
  }
}

export async function requireAdmin(ctx: AuthOnlyCtx) {
  const user = await requireUser(ctx)
  if (user.role !== "admin") {
    throw new Error("Unauthorized")
  }
  return user
}

export async function requireUserFromDb(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx)
  const authUserId = await getAuthUserId(ctx)
  const authUser = authUserId
    ? await ctx.db.get(authUserId as Id<"users">)
    : null
  const email =
    typeof authUser?.email === "string" ? authUser.email : user.email
  const role = email
    ? roleForIdentity({
        tokenIdentifier: user.tokenIdentifier,
        email,
      } as UserIdentity)
    : user.role

  return {
    ...user,
    email,
    role,
  }
}

export async function requireAdminFromDb(ctx: QueryCtx | MutationCtx) {
  const user = await requireUserFromDb(ctx)
  if (user.role !== "admin") {
    throw new Error("Unauthorized")
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
