import { v } from "convex/values"
import { internalQuery } from "./_generated/server"
import { firstEventReference } from "./lib/firstApi"

export const forEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId)
    if (!event || !firstEventReference(event)) return []
    return ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
  },
})
