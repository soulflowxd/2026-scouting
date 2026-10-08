import { ConvexError } from "convex/values"
import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

export async function requireScoutingOpen(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId)
  if (!event) throw new ConvexError("Event not found")
  if (event.scoutingEnabled === false) throw new ConvexError("Scouting submissions are closed. An admin must enable scouting for this event.")
}
