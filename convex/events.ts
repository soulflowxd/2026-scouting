import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdminFromDb } from "./lib/authz"
import { driveFolderUrl } from "./lib/driveVideos"
import { importEventReference } from "./lib/firstApi"

export const videoSettings = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    return event ? { folderUrl: event.matchVideoFolderUrl, prefix: event.eventKey === "2026txmck" ? "stem gals" : event.matchVideoPrefix ?? event.name ?? event.eventKey, allowBare: event.eventKey !== "2026txmck" } : null
  },
})

export const saveVideoFolder = mutation({
  args: { eventId: v.id("events"), folderUrl: v.string(), prefix: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error("Event not found")
    const folderUrl = args.folderUrl.trim() ? driveFolderUrl(args.folderUrl) : undefined
    const prefix = event.eventKey === "2026txmck" ? "stem gals" : args.prefix.trim() || event.matchVideoPrefix || event.name || event.eventKey
    if (folderUrl && (!prefix || prefix.length > 100)) throw new Error("Enter the event name used in video filenames")
    await ctx.db.patch(args.eventId, { matchVideoFolderUrl: folderUrl, matchVideoPrefix: folderUrl ? prefix : undefined })
    return null
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("events").order("desc").take(20)
  },
})

export const active = query({
  args: {},
  handler: async (ctx) => {
    const selected = (await ctx.db.query("events").withIndex("by_activeAt").order("desc").take(1))[0]
    if (selected?.activeAt) {
      return selected
    }
    return (await ctx.db.query("events").order("desc").take(1))[0] ?? null
  },
})

export const createOrSelect = mutation({
  args: { eventKey: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdminFromDb(ctx)
    const eventKey = importEventReference(args.eventKey).eventKey
    if (!/^\d{4}[a-z0-9]+$/.test(eventKey)) {
      throw new Error("Invalid event key")
    }

    const existing = await ctx.db
      .query("events")
      .withIndex("by_eventKey", (q) => q.eq("eventKey", eventKey))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, { activeAt: Date.now() })
      return existing._id
    }

    return await ctx.db.insert("events", {
      scoutingEnabled: false,
      eventKey,
      importStatus: "empty",
      activeAt: Date.now(),
      createdByToken: admin.tokenIdentifier,
    })
  },
})

export const setScoutingEnabled = mutation({
  args: { eventId: v.id("events"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    if (!await ctx.db.get(args.eventId)) throw new Error("Event not found")
    await ctx.db.patch(args.eventId, { scoutingEnabled: args.enabled })
  },
})
