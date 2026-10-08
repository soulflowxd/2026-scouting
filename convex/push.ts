"use node"

import webPush from "web-push"
import { v } from "convex/values"
import { env, internalAction } from "./_generated/server"
import { internal } from "./_generated/api"

export const sendApproved = internalAction({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const publicKey = env.VAPID_PUBLIC_KEY
    const privateKey = env.VAPID_PRIVATE_KEY
    if (!publicKey || !privateKey) return null
    const subscriptions = await ctx.runQuery(internal.pushSubscriptions.approvedDelivery, args)
    if (!subscriptions) return null
    const payload = JSON.stringify({ title: "Your account is approved", body: "You can now sign in and start scouting.", tag: `approved-${args.memberId}`, url: "/" })
    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
          vapidDetails: { subject: "mailto:luqman.a.khan101010@gmail.com", publicKey, privateKey }, TTL: 86400, urgency: "high", timeout: 10000,
        })
      } catch (error) {
        const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0
        if (status === 404 || status === 410) await ctx.runMutation(internal.pushSubscriptions.removeExpired, { subscriptionId: subscription._id })
        else console.error("Account approval delivery failed", status)
      }
    }
    return null
  },
})

export const sendApproval = internalAction({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const publicKey = env.VAPID_PUBLIC_KEY
    const privateKey = env.VAPID_PRIVATE_KEY
    if (!publicKey || !privateKey) return null
    const delivery = await ctx.runQuery(internal.pushSubscriptions.approvalDelivery, args)
    if (!delivery) return null
    const payload = JSON.stringify({ title: "Scout approval needed", body: `${delivery.name} is waiting for account approval.`, tag: `approval-${args.memberId}`, url: "/admin" })
    for (const subscription of delivery.subscriptions) {
      try {
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
          vapidDetails: { subject: "mailto:luqman.a.khan101010@gmail.com", publicKey, privateKey }, TTL: 3600, urgency: "high", timeout: 10000,
        })
      } catch (error) {
        const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0
        if (status === 404 || status === 410) await ctx.runMutation(internal.pushSubscriptions.removeExpired, { subscriptionId: subscription._id })
        else console.error("Approval notification delivery failed", status)
      }
    }
    return null
  },
})

export const sendBreakdown = internalAction({
  args: { notificationId: v.id("scoutNotifications"), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const publicKey = env.VAPID_PUBLIC_KEY
    const privateKey = env.VAPID_PRIVATE_KEY
    if (!publicKey || !privateKey) {
      console.error("Device notifications need VAPID keys configured")
      return null
    }
    const delivery = await ctx.runQuery(internal.pushSubscriptions.delivery, { notificationId: args.notificationId })
    if (!delivery) return null
    const { notification, subscriptions } = delivery
    const payload = JSON.stringify({
      title: `Team ${notification.teamNumber} broke down · QM${notification.matchNumber}`,
      body: "Visit their pit and tap here to record what broke and the repair status.",
      tag: `breakdown-${notification.eventId}-${notification.matchNumber}-${notification.teamNumber}`,
      url: `/matches?breakdown=${notification._id}`,
    })
    let retry = false
    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
          vapidDetails: { subject: "mailto:luqman.a.khan101010@gmail.com", publicKey, privateKey },
          TTL: 3600,
          urgency: "high",
          timeout: 10000,
        })
      } catch (error) {
        const status = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0
        if (status === 404 || status === 410) {
          await ctx.runMutation(internal.pushSubscriptions.removeExpired, { subscriptionId: subscription._id })
        } else {
          console.error("Device notification delivery failed", status)
          if (!status || status === 429 || status >= 500) retry = true
        }
      }
    }
    const attempt = args.attempt ?? 0
    if (retry && attempt < 3) await ctx.scheduler.runAfter(30000 * 2 ** attempt, internal.push.sendBreakdown, { notificationId: args.notificationId, attempt: attempt + 1 })
    return null
  },
})
