import { ConvexError, v } from "convex/values"
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { requireUserFromDb } from "./lib/authz"

async function requireNotificationUser(ctx: Parameters<typeof requireUserFromDb>[0]) {
  const user = await requireUserFromDb(ctx)
  if (user.approvalStatus === "rejected") throw new ConvexError("Account not approved")
  return user
}

export const publicKey = query({
  args: {},
  handler: async (ctx) => {
    await requireNotificationUser(ctx)
    return env.VAPID_PUBLIC_KEY || null
  },
})

export const save = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const user = await requireNotificationUser(ctx)
    const url = new URL(args.endpoint)
    const hosts = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "web.push.apple.com"]
    const trusted = hosts.includes(url.hostname) || url.hostname.endsWith(".notify.windows.com") || url.hostname.endsWith(".push.apple.com")
    if (url.protocol !== "https:" || !trusted || url.username || url.password || (url.port && url.port !== "443") || args.endpoint.length > 2048) {
      throw new ConvexError("Unsupported device notification service")
    }
    if (!/^[A-Za-z0-9_-]{87}$/.test(args.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(args.auth)) {
      throw new ConvexError("Invalid device subscription")
    }
    const existing = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).unique()
    const doc = { ...args, recipientToken: user.tokenIdentifier, updatedAt: Date.now() }
    if (existing) await ctx.db.patch(existing._id, doc)
    else await ctx.db.insert("pushSubscriptions", doc)
    return null
  },
})

export const remove = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const user = await requireNotificationUser(ctx)
    const subscription = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).unique()
    if (subscription?.recipientToken === user.tokenIdentifier) await ctx.db.delete(subscription._id)
    return null
  },
})

export const approvedDelivery = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId)
    if (!member || member.mergedInto || member.approvalStatus !== "approved") return null
    return await ctx.db.query("pushSubscriptions").withIndex("by_recipientToken", q => q.eq("recipientToken", member.tokenIdentifier)).take(20)
  },
})

export const approvalDelivery = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId)
    if (!member || member.mergedInto || member.approvalStatus !== "pending") return null
    const subscriptions = []
    for (const role of ["admin", "superAdmin"] as const) {
      const admins = await ctx.db.query("members").withIndex("by_role", q => q.eq("role", role)).take(500)
      for (const admin of admins) {
        if (admin.mergedInto || (admin.approvalStatus && admin.approvalStatus !== "approved")) continue
        subscriptions.push(...await ctx.db.query("pushSubscriptions").withIndex("by_recipientToken", q => q.eq("recipientToken", admin.tokenIdentifier)).take(20))
      }
    }
    return { name: member.name || member.email || "New scout", subscriptions }
  },
})

export const delivery = internalQuery({
  args: { notificationId: v.id("scoutNotifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId)
    if (!notification) return null
    const completed = await ctx.db.query("breakdownFollowUps")
      .withIndex("by_eventId_and_matchNumber_and_teamNumber", q => q.eq("eventId", notification.eventId).eq("matchNumber", notification.matchNumber).eq("teamNumber", notification.teamNumber)).unique()
    if (completed) return null
    const member = await ctx.db.query("members").withIndex("by_tokenIdentifier", q => q.eq("tokenIdentifier", notification.recipientToken)).first()
    if (!member || member.mergedInto || (member.approvalStatus && member.approvalStatus !== "approved")) return null
    const subscriptions = await ctx.db.query("pushSubscriptions").withIndex("by_recipientToken", q => q.eq("recipientToken", notification.recipientToken)).take(20)
    return { notification, subscriptions }
  },
})

export const removeExpired = internalMutation({
  args: { subscriptionId: v.id("pushSubscriptions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.subscriptionId)
    return null
  },
})
