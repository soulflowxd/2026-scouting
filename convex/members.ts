import { internalQuery, mutation, query } from "./_generated/server"
import { getCurrentMember, requireAdminFromDb, requireUserFromDb } from "./lib/authz"

export const me = query({
  args: {},
  handler: async (ctx) => {
    const { user, member } = await getCurrentMember(ctx)
    return {
      tokenIdentifier: user.tokenIdentifier,
      email: user.email,
      name: user.name,
      role: user.role,
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
      await ctx.db.patch(existing._id, {
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        role: user.role,
        lastSeenAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert("members", {
      tokenIdentifier: user.tokenIdentifier,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      role: user.role,
      lastSeenAt: now,
    })
  },
})

export const currentAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await requireAdminFromDb(ctx)
  },
})
