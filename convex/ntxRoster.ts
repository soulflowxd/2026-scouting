import { internalMutation } from "./_generated/server"

// Event-local numeric keys retain report ownership; letter IDs are the public labels.
export const correctSecondRobots = internalMutation({
  args: {},
  handler: async ctx => {
    const event = await ctx.db.query("events").withIndex("by_eventKey", q => q.eq("eventKey", "2026ntx")).unique()
    if (!event) throw new Error("NTX not found")
    for (const [number, alias] of [[99001, "1745S"], [99002, "2718B"], [99003, "5829B"], [99004, "10014R"]] as const) {
      const team = await ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", event._id).eq("teamNumber", number)).unique()
      if (!team || team.tbaTeamKey !== `frc${alias}`) throw new Error(`Unexpected NTX identity for ${alias}`)
      await ctx.db.patch(team._id, { eventTeamAlias: alias })
    }
    const duplicate = await ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", event._id).eq("teamNumber", 9994)).unique()
    // Archive, rather than delete, so any reports or rankings stay recoverable.
    if (duplicate) await ctx.db.patch(duplicate._id, { mergedIntoTeamNumber: 99004 })
    return { aliasesUpdated: 4, duplicateArchived: !!duplicate }
  },
})
