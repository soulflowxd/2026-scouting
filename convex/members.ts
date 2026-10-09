import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import {
  getCurrentMember,
  findMember,
  memberCandidates,
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
      teamNumber: user.teamNumber,
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
    const existing = await findMember(ctx)
    if (!existing && (await memberCandidates(ctx)).some(row => row.mergedInto)) throw new ConvexError("This duplicate account has been archived. Sign in with your current account.")

    if (existing) {
      const role = user.role === "superAdmin" ? "superAdmin" : existing.role
      const approvalStatus =
        role === "superAdmin"
          ? "approved"
          : existing.approvalStatus ?? "approved"
      await ctx.db.patch(existing._id, {
        authUserId: user.authUserId ?? undefined,
        email: user.email ?? undefined,
        name: user.name || existing.name,
        teamNumber: user.teamNumber,
        role,
        approvalStatus,
        approvedAt:
          approvalStatus === "approved"
            ? existing.approvedAt ?? now
            : existing.approvedAt,
        lastSeenAt: now,
      })
      const duplicates = (await memberCandidates(ctx)).filter(row => row._id !== existing._id && !row.mergedInto)
      for (const duplicate of duplicates) {
        await ctx.db.patch(duplicate._id, { mergedInto: existing._id, authUserId: user.authUserId ?? undefined })
      }
      if (duplicates.length) await ctx.scheduler.runAfter(0, internal.members.mergeOwnership, {
        aliases: duplicates.map(row => row.tokenIdentifier), canonical: existing.tokenIdentifier, table: "pitReports", cursor: null,
      })
      return existing._id
    }

    const approvalStatus =
      user.role === "admin" || user.role === "superAdmin"
        ? "approved"
        : "pending"
    const memberId = await ctx.db.insert("members", {
      authUserId: user.authUserId ?? undefined,
      tokenIdentifier: user.tokenIdentifier,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      teamNumber: user.teamNumber,
      role: user.role,
      approvalStatus,
      requestedAt: now,
      approvedAt: approvalStatus === "approved" ? now : undefined,
      lastSeenAt: now,
    })
    if (approvalStatus === "pending") {
      await ctx.scheduler.runAfter(0, internal.push.sendApproval, { memberId })
    }
    return memberId
  },
})

export const setTeamNumber = mutation({
  args: { memberId: v.id("members"), teamNumber: v.union(v.literal(9128), v.literal(10340)) },
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    const member = await ctx.db.get(args.memberId)
    if (!member || member.mergedInto) throw new ConvexError("Account not found")
    await ctx.db.patch(member._id, { teamNumber: args.teamNumber })
    if (member.authUserId) await ctx.db.patch(member.authUserId, { teamNumber: args.teamNumber })
    return null
  },
})

export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminFromDb(ctx)
    const members = await ctx.db.query("members").take(500)
    return members
      .filter(member => !member.mergedInto)
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

async function memberAuthId(ctx: MutationCtx, member: Doc<"members">) {
  const tokenParts = member.tokenIdentifier.split("|")
  const id = member.authUserId ?? ctx.db.normalizeId("users", tokenParts[tokenParts.length - 2] ?? "")
  return id && await ctx.db.get(id) ? id : null
}

export const mergeDuplicates = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const admin = await requireAdminFromDb(ctx)
    const target = await ctx.db.get(args.memberId)
    if (!target || target.mergedInto) throw new ConvexError("Account not found")
    const passwordAccount = target.email ? await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "password").eq("providerAccountId", target.email!.trim().toLowerCase())).unique() : null
    const authUserId = passwordAccount?.userId ?? await memberAuthId(ctx, target)
    if (!authUserId) throw new ConvexError("Could not verify account identity")
    const rows = await ctx.db.query("members").take(500)
    const matches = []
    for (const row of rows) {
      const sameUser = await memberAuthId(ctx, row) === authUserId
      const obsoletePasswordAccount = admin.role === "superAdmin" && passwordAccount && target.role === "scout" && row.role === "scout" && row.email?.trim().toLowerCase() === target.email?.trim().toLowerCase()
      if (!row.mergedInto && (sameUser || obsoletePasswordAccount)) matches.push(row)
    }
    if (admin.role !== "superAdmin" && matches.some(row => row.role !== "scout")) throw new ConvexError("Only the super admin can merge admin accounts")
    const linkedIds = new Set<string>()
    for (const row of matches) if (await memberAuthId(ctx, row) === authUserId) linkedIds.add(row._id)
    if (!linkedIds.size) throw new ConvexError("The current password account must sign in before duplicates can be archived")
    matches.sort((a, b) => Number(linkedIds.has(b._id)) - Number(linkedIds.has(a._id)) || Number(b.role === "superAdmin") - Number(a.role === "superAdmin") || Number(b.role === "admin") - Number(a.role === "admin") || a._creationTime - b._creationTime)
    const keep = matches[0]
    const duplicates = matches.slice(1)
    await ctx.db.patch(keep._id, { authUserId })
    for (const row of duplicates) await ctx.db.patch(row._id, { authUserId: await memberAuthId(ctx, row) ?? undefined, mergedInto: keep._id, approvalStatus: "rejected" })
    if (duplicates.length) await ctx.scheduler.runAfter(0, internal.members.mergeOwnership, { aliases: duplicates.map(row => row.tokenIdentifier), canonical: keep.tokenIdentifier, table: "pitReports", cursor: null })
    return duplicates.length
  },
})

export const setName = mutation({
  args: { memberId: v.id("members"), name: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdminFromDb(ctx)
    const member = await ctx.db.get(args.memberId)
    if (!member || member.mergedInto) throw new ConvexError("Account not found")
    if (member.role !== "scout" && admin.role !== "superAdmin" && admin.memberId !== member._id) throw new ConvexError("Only the super admin can edit another admin's name")
    const name = args.name.trim()
    if (!name || name.length > 100) throw new ConvexError("Name must be 1 to 100 characters")
    await ctx.db.patch(member._id, { name })
    const authUserId = await memberAuthId(ctx, member)
    if (authUserId) await ctx.db.patch(authUserId, { name })
    return null
  },
})

export const mergeOwnership = internalMutation({
  args: { aliases: v.array(v.string()), canonical: v.string(), table: v.union(v.literal("pitReports"), v.literal("matchReports"), v.literal("matchRobotClaims"), v.literal("pickLists"), v.literal("scoutNotifications")), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query(args.table).paginate({ numItems: 100, cursor: args.cursor })
    const aliases = new Set(args.aliases)
    for (const row of page.page) {
      if (args.table === "matchRobotClaims" && "scoutToken" in row && "status" in row && row.status === "active" && aliases.has(row.scoutToken)) {
        const existing = await ctx.db.query("matchRobotClaims").withIndex("by_eventId_and_matchNumber_and_scoutToken_and_status", q => q.eq("eventId", row.eventId).eq("matchNumber", row.matchNumber).eq("scoutToken", args.canonical).eq("status", "active")).first()
        if (existing) await ctx.db.patch(row._id, { status: "released", releasedAt: Date.now() })
      }
      if ("scoutToken" in row && aliases.has(row.scoutToken)) await ctx.db.patch(row._id, { scoutToken: args.canonical })
      if ("ownerToken" in row && row.ownerToken && aliases.has(row.ownerToken)) await ctx.db.patch(row._id, { ownerToken: args.canonical })
      if ("recipientToken" in row && aliases.has(row.recipientToken)) await ctx.db.patch(row._id, { recipientToken: args.canonical })
    }
    const tables = ["pitReports", "matchReports", "matchRobotClaims", "pickLists", "scoutNotifications"] as const
    const next = tables[tables.indexOf(args.table) + 1]
    if (!page.isDone || next) await ctx.scheduler.runAfter(0, internal.members.mergeOwnership, { ...args, table: page.isDone ? next : args.table, cursor: page.isDone ? null : page.continueCursor })
    return null
  },
})

export const passwordContext = internalQuery({
  args: { memberId: v.optional(v.id("members")) },
  handler: async (ctx, args) => {
    const actor = await requireUserFromDb(ctx)
    if (!actor.authUserId || !actor.email) throw new ConvexError("Password account not found")
    if (!args.memberId) return { actorId: actor.authUserId, actorEmail: actor.email, targetId: actor.authUserId, targetEmail: actor.email }
    const admin = await requireAdminFromDb(ctx)
    const target = await ctx.db.get(args.memberId)
    if (!target || target.mergedInto || !target.email) throw new ConvexError("Account not found")
    if (target.role === "superAdmin" || (target.role === "admin" && admin.role !== "superAdmin")) throw new ConvexError("Only the super admin can reset admin passwords. Use Account to change your own password.")
    const targetEmail = target.email.toLowerCase()
    const account = await ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "password").eq("providerAccountId", targetEmail)).unique()
    if (!account || (target.authUserId && target.authUserId !== account.userId)) throw new ConvexError("Password account not found")
    return { actorId: actor.authUserId, actorEmail: actor.email, targetId: account.userId, targetEmail: account.providerAccountId }
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
    if (member.mergedInto) throw new ConvexError("Account has been archived")
    if (args.status === "rejected" && member.approvalStatus === "pending") {
      // Retain an invisible tombstone to block still-valid access tokens and
      // preserve historical ownership, while removing the actual login account.
      if (member.authUserId) {
        const linkedMembers = await ctx.db.query("members").withIndex("by_authUserId", q => q.eq("authUserId", member.authUserId)).take(201)
        if (linkedMembers.length > 200 || linkedMembers.some(row => row._id !== member._id && !row.mergedInto)) throw new ConvexError("Resolve linked accounts before deleting this request")
        const sessions = await ctx.db.query("authSessions").withIndex("userId", q => q.eq("userId", member.authUserId!)).take(201)
        const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", q => q.eq("userId", member.authUserId!)).take(201)
        if (sessions.length > 200 || accounts.length > 200) throw new ConvexError("Account cleanup exceeds the safe batch size")
        for (const session of sessions) {
          const tokens = await ctx.db.query("authRefreshTokens").withIndex("sessionId", q => q.eq("sessionId", session._id)).take(201)
          if (tokens.length > 200) throw new ConvexError("Session cleanup exceeds the safe batch size")
          for (const token of tokens) await ctx.db.delete(token._id)
          await ctx.db.delete(session._id)
        }
        for (const account of accounts) {
          const codes = await ctx.db.query("authVerificationCodes").withIndex("accountId", q => q.eq("accountId", account._id)).take(201)
          if (codes.length > 200) throw new ConvexError("Account cleanup exceeds the safe batch size")
          for (const code of codes) await ctx.db.delete(code._id)
          await ctx.db.delete(account._id)
        }
        await ctx.db.delete(member.authUserId)
      }
      const subscriptions = await ctx.db.query("pushSubscriptions").withIndex("by_recipientToken", q => q.eq("recipientToken", member.tokenIdentifier)).take(201)
      if (subscriptions.length > 200) throw new ConvexError("Device cleanup exceeds the safe batch size")
      for (const subscription of subscriptions) await ctx.db.delete(subscription._id)
      await ctx.db.patch(member._id, { approvalStatus: "rejected", approvalNoticePending: false, mergedInto: member._id, approvedByToken: admin.tokenIdentifier })
      return null
    }
    const newlyApproved = args.status === "approved" && member.approvalStatus !== "approved"
    await ctx.db.patch(args.memberId, {
      approvalStatus: args.status,
      approvalNoticePending: newlyApproved ? true : args.status === "rejected" ? false : member.approvalNoticePending,
      approvedAt: args.status === "approved" ? Date.now() : undefined,
      approvedByToken: admin.tokenIdentifier,
    })
    if (newlyApproved) await ctx.scheduler.runAfter(0, internal.push.sendApproved, { memberId: args.memberId })
    return null
  },
})

export const acknowledgeApproval = mutation({
  args: {},
  handler: async (ctx) => {
    const member = await findMember(ctx)
    if (!member || member.approvalStatus !== "approved") throw new ConvexError("Approved account required")
    await ctx.db.patch(member._id, { approvalNoticePending: false })
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
