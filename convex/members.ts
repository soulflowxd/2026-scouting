import { ConvexError, v } from "convex/values"
import { internalQuery, mutation, query } from "./_generated/server"
import {
  getCurrentMember,
  requireAdminFromDb,
  requireSuperAdminFromDb,
  requireUserFromDb,
} from "./lib/authz"

export const me = query({
  args: {},
  handler: async (ctx) => {
    const { user, member } = await getCurrentMember(ctx)
    return {
      tokenIdentifier: user.tokenIdentifier,
      email: user.email,
      name: user.name,
      role: user.role === "superAdmin" ? "admin" : user.role,
      isSuperAdmin: user.role === "superAdmin",
      approvalStatus: user.approvalStatus,
      member,
    }
  },
})

export const ensureMe = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUserFromDb(ctx)
    const now = Date.now()
    const existing = await ctx.db
      .query("members")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", user.tokenIdentifier),
      )
      .unique()

    if (existing) {
      const role = user.role === "superAdmin" ? "superAdmin" : existing.role
      const approvalStatus =
        role === "superAdmin"
          ? "approved"
          : existing.approvalStatus ?? "approved"
      await ctx.db.patch(existing._id, {
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        role,
        approvalStatus,
        approvedAt:
          approvalStatus === "approved"
            ? existing.approvedAt ?? now
            : existing.approvedAt,
        lastSeenAt: now,
      })
      return existing._id
    }

    const approvalStatus =
      user.role === "admin" || user.role === "superAdmin"
        ? "approved"
        : "pending"
    return await ctx.db.insert("members", {
      tokenIdentifier: user.tokenIdentifier,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      role: user.role,
      approvalStatus,
      requestedAt: now,
      approvedAt: approvalStatus === "approved" ? now : undefined,
      lastSeenAt: now,
    })
  },
})

export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminFromDb(ctx)
    const members = await ctx.db.query("members").take(500)
    return members
      .map((member) => ({
        ...member,
        approvalStatus: member.approvalStatus ?? "approved",
      }))
      .sort((a, b) => {
        const aPending = a.approvalStatus === "pending" ? 0 : 1
        const bPending = b.approvalStatus === "pending" ? 0 : 1
        return (
          aPending - bPending ||
          (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "")
        )
      })
  },
})

export const setApproval = mutation({
  args: {
    memberId: v.id("members"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminFromDb(ctx)
    const member = await ctx.db.get(args.memberId)
    if (!member) throw new ConvexError("Account not found")
    if (member.role === "superAdmin") {
      throw new ConvexError("The super admin account cannot be rejected")
    }
    if (member.role === "admin" && admin.role !== "superAdmin") {
      throw new ConvexError("Only the super admin can change an admin account")
    }
    await ctx.db.patch(args.memberId, {
      approvalStatus: args.status,
      approvedAt: args.status === "approved" ? Date.now() : undefined,
      approvedByToken: admin.tokenIdentifier,
    })
    return null
  },
})

export const setAdminRole = mutation({
  args: { memberId: v.id("members"), isAdmin: v.boolean() },
  handler: async (ctx, args) => {
    const superAdmin = await requireSuperAdminFromDb(ctx)
    const member = await ctx.db.get(args.memberId)
    if (!member) throw new ConvexError("Account not found")
    if (
      member.role === "superAdmin" ||
      member.tokenIdentifier === superAdmin.tokenIdentifier
    ) {
      throw new ConvexError("The super admin role cannot be changed")
    }
    await ctx.db.patch(args.memberId, {
      role: args.isAdmin ? "admin" : "scout",
      approvalStatus: "approved",
      approvedAt: member.approvedAt ?? Date.now(),
      approvedByToken: superAdmin.tokenIdentifier,
    })
    return null
  },
})

export const currentAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await requireAdminFromDb(ctx)
  },
})
