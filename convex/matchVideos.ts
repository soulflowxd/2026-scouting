import { ConvexError, v } from "convex/values"
import { action, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireApprovedUserFromDb } from "./lib/authz"
import { readDriveVideos, type DriveVideo } from "./lib/driveVideos"

export const context = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireApprovedUserFromDb(ctx)
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new ConvexError("Event not found")
    const matches = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).take(500)
    return { folderUrl: event.matchVideoFolderUrl, prefix: event.matchVideoPrefix ?? event.name ?? event.eventKey, matchNumbers: matches.map(match => match.matchNumber) }
  },
})

export const listFromDrive = action({
  args: { eventId: v.id("events") },
  returns: v.array(v.object({ matchNumber: v.number(), name: v.string(), videoUrl: v.string() })),
  handler: async (ctx, args): Promise<DriveVideo[]> => {
    const settings = await ctx.runQuery(internal.matchVideos.context, args)
    if (!settings.folderUrl) return []
    return await readDriveVideos(settings.folderUrl, settings.prefix, new Set(settings.matchNumbers))
  },
})
