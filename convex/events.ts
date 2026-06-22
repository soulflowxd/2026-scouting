import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdminFromDb } from "./lib/authz"

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("events").order("desc").take(20)
  },
})

export const active = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("events").order("desc").take(1))[0] ?? null
  },
})

export const createOrSelect = mutation({
  args: { eventKey: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdminFromDb(ctx)
    const eventKey = args.eventKey.trim().toLowerCase()
    if (!/^\d{4}[a-z0-9]+$/.test(eventKey)) {
      throw new Error("Invalid event key")
    }

    const existing = await ctx.db
      .query("events")
      .withIndex("by_eventKey", (q) => q.eq("eventKey", eventKey))
      .unique()

    if (existing) {
      return existing._id
    }

    return await ctx.db.insert("events", {
      eventKey,
      importStatus: "empty",
      createdByToken: admin.tokenIdentifier,
    })
  },
})
