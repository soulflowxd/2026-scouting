import { v } from "convex/values"
import { makeFunctionReference } from "convex/server"
import { internalAction, internalMutation } from "./_generated/server"

const tables = [
  "pickedTeams", "teams", "matches", "externalStats", "winPredictions",
  "pitReports", "matchReports", "scoutAssignmentParticipants", "scoutTeamAssignments",
  "matchRobotClaims", "breakdownFollowUps", "scoutNotifications", "pickListItems",
  "pickLists", "mashVotes", "consensusItems", "consensusRuns",
] as const

// Operator-only, bounded purge restricted to the two retired events.
export const purgeBatch = internalMutation({
  args: {
    eventKey: v.union(v.literal("2026new"), v.literal("2026txhou1")),
    tableIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { eventKey, tableIndex, cursor }) => {
    const event = await ctx.db.query("events").withIndex("by_eventKey", q => q.eq("eventKey", eventKey)).unique()
    if (!event) return { done: true, tableIndex, cursor: null, deleted: 0, photos: 0 }
    if (!Number.isInteger(tableIndex) || tableIndex < 0 || tableIndex > tables.length) throw new Error("Invalid table index")
    await ctx.db.patch(event._id, { scoutingEnabled: false })
    if (tableIndex === tables.length) {
      await ctx.db.delete(event._id)
      return { done: true, tableIndex, cursor: null, deleted: 1, photos: 0 }
    }
    const table = tables[tableIndex]
    const page = await ctx.db.query(table).paginate({ numItems: 50, cursor })
    let deleted = 0
    let photos = 0
    for (const row of page.page) {
      if (row.eventId !== event._id) continue
      if ("photoIds" in row) {
        for (const photoId of row.photoIds ?? []) {
          await ctx.storage.delete(photoId)
          photos++
        }
      }
      await ctx.db.delete(row._id)
      deleted++
    }
    return {
      done: false,
      tableIndex: page.isDone ? tableIndex + 1 : tableIndex,
      cursor: page.isDone ? null : page.continueCursor,
      deleted, photos,
    }
  },
})

export const purgeEvent = internalAction({
  args: { eventKey: v.union(v.literal("2026new"), v.literal("2026txhou1")) },
  handler: async (ctx, { eventKey }) => {
    const batch = makeFunctionReference<"mutation", {
      eventKey: "2026new" | "2026txhou1", tableIndex: number, cursor: string | null,
    }, { done: boolean, tableIndex: number, cursor: string | null, deleted: number, photos: number }>("eventCleanup:purgeBatch")
    let state = { done: false, tableIndex: 0, cursor: null as string | null }
    let deleted = 0
    let photos = 0
    while (!state.done) {
      const result = await ctx.runMutation(batch, { eventKey, tableIndex: state.tableIndex, cursor: state.cursor })
      deleted += result.deleted
      photos += result.photos
      state = result
    }
    return { eventKey, deleted, photos }
  },
})
