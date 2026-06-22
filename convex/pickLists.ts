import { v } from "convex/values"
import type { MutationCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { requireAdminFromDb, requireUser, requireUserFromDb } from "./lib/authz"
import { pickTierValidator } from "./validators"

const tierWeights = {
  tier1: 400,
  tier2: 300,
  tier3: 200,
  doNotPick: -200,
  uncategorized: 0,
}

type PickTier = keyof typeof tierWeights

function tierFromScore(score: number): PickTier {
  if (score >= 340) return "tier1"
  if (score >= 240) return "tier2"
  if (score >= 100) return "tier3"
  if (score < -50) return "doNotPick"
  return "uncategorized"
}

async function ensurePrimaryList(ctx: MutationCtx, eventId: Id<"events">) {
  const existing = await ctx.db
    .query("pickLists")
    .withIndex("by_eventId_and_kind", (q) =>
      q.eq("eventId", eventId).eq("kind", "primary"),
    )
    .unique()
  if (existing) return existing._id
  const now = Date.now()
  return await ctx.db.insert("pickLists", {
    eventId,
    kind: "primary",
    name: "Primary pick list",
    createdAt: now,
    updatedAt: now,
  })
}

export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const lists = await ctx.db
      .query("pickLists")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100)
    const visible = lists.filter(
      (list) =>
        list.kind === "primary" || list.ownerToken === user.tokenIdentifier,
    )
    const items = await ctx.db
      .query("pickListItems")
      .withIndex("by_eventId_and_teamNumber", (q) => q.eq("eventId", args.eventId))
      .take(2000)
    return visible.map((list) => ({
      ...list,
      items: items
        .filter((item) => item.pickListId === list._id)
        .sort((a, b) => a.rank - b.rank),
    }))
  },
})

export const createPersonal = mutation({
  args: { eventId: v.id("events"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const now = Date.now()
    return await ctx.db.insert("pickLists", {
      eventId: args.eventId,
      kind: "personal",
      name: args.name.trim() || "My pick list",
      ownerToken: user.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const ensurePrimary = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    return await ensurePrimaryList(ctx, args.eventId)
  },
})

export const moveTeam = mutation({
  args: {
    pickListId: v.id("pickLists"),
    teamNumber: v.number(),
    tier: pickTierValidator,
    rank: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const list = await ctx.db.get(args.pickListId)
    if (!list) throw new Error("Pick list not found")
    if (list.kind === "primary" && user.role !== "admin") {
      throw new Error("Unauthorized")
    }
    if (list.kind === "personal" && list.ownerToken !== user.tokenIdentifier) {
      throw new Error("Unauthorized")
    }

    const existing = await ctx.db
      .query("pickListItems")
      .withIndex("by_pickListId_and_teamNumber", (q) =>
        q.eq("pickListId", args.pickListId).eq("teamNumber", args.teamNumber),
      )
      .unique()
    const doc = {
      pickListId: args.pickListId,
      eventId: list.eventId,
      teamNumber: args.teamNumber,
      tier: args.tier,
      rank: Math.max(0, Math.trunc(args.rank)),
      updatedAt: Date.now(),
    }
    if (existing) await ctx.db.patch(existing._id, doc)
    else await ctx.db.insert("pickListItems", doc)
    await ctx.db.patch(args.pickListId, { updatedAt: Date.now() })
  },
})

export const moveTeams = mutation({
  args: {
    pickListId: v.id("pickLists"),
    placements: v.array(
      v.object({
        teamNumber: v.number(),
        tier: pickTierValidator,
        rank: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let user: Awaited<ReturnType<typeof requireUserFromDb>>
    try {
      user = await requireUserFromDb(ctx)
    } catch {
      return { ok: false, error: "Sign in again before editing pick lists" }
    }

    const list = await ctx.db.get(args.pickListId)
    if (!list) return { ok: false, error: "Pick list not found" }
    if (list.kind === "primary" && user.role !== "admin") {
      return { ok: false, error: "Admin only: primary pick list is read-only" }
    }
    if (list.kind === "personal" && list.ownerToken !== user.tokenIdentifier) {
      return { ok: false, error: "You can only edit your own personal pick list" }
    }

    const now = Date.now()
    for (const placement of args.placements) {
      const existingItems = await ctx.db
        .query("pickListItems")
        .withIndex("by_pickListId_and_teamNumber", (q) =>
          q.eq("pickListId", args.pickListId).eq("teamNumber", placement.teamNumber),
        )
        .take(10)
      const doc = {
        pickListId: args.pickListId,
        eventId: list.eventId,
        teamNumber: placement.teamNumber,
        tier: placement.tier,
        rank: Math.max(0, Math.trunc(placement.rank)),
        updatedAt: now,
      }
      const [existing, ...duplicates] = existingItems
      for (const duplicate of duplicates) {
        await ctx.db.delete(duplicate._id)
      }
      if (existing) await ctx.db.patch(existing._id, doc)
      else await ctx.db.insert("pickListItems", doc)
    }
    await ctx.db.patch(args.pickListId, { updatedAt: now })
    return { ok: true }
  },
})

export const runConsensus = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const admin = await requireAdminFromDb(ctx)
    const personalLists = await ctx.db
      .query("pickLists")
      .withIndex("by_eventId_and_kind", (q) =>
        q.eq("eventId", args.eventId).eq("kind", "personal"),
      )
      .take(100)
    const items = await ctx.db
      .query("pickListItems")
      .withIndex("by_eventId_and_teamNumber", (q) => q.eq("eventId", args.eventId))
      .take(5000)
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)
    const runId = await ctx.db.insert("consensusRuns", {
      eventId: args.eventId,
      createdByToken: admin.tokenIdentifier,
      createdAt: Date.now(),
    })

    const personalIds = new Set(personalLists.map((list) => list._id))
    const personalItems = items.filter((item) => personalIds.has(item.pickListId))
    const scored = teams.map((team) => {
      const votes = personalItems.filter(
        (item) => item.teamNumber === team.teamNumber,
      )
      const score =
        votes.reduce(
          (sum, item) => sum + tierWeights[item.tier] - item.rank,
          0,
        ) / Math.max(votes.length, 1)
      return {
        teamNumber: team.teamNumber,
        score,
        suggestedTier: tierFromScore(score),
      }
    })

    const ranked = scored
      .sort((a, b) => b.score - a.score || a.teamNumber - b.teamNumber)
      .map((item, index) => ({ ...item, suggestedRank: index }))

    for (const item of ranked) {
      await ctx.db.insert("consensusItems", {
        consensusRunId: runId,
        eventId: args.eventId,
        teamNumber: item.teamNumber,
        suggestedTier: item.suggestedTier,
        suggestedRank: item.suggestedRank,
        score: Number(item.score.toFixed(2)),
      })
    }
    return runId
  },
})

export const latestConsensus = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("consensusRuns")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(1)
    const run = runs[0]
    if (!run) return null
    const items = await ctx.db
      .query("consensusItems")
      .withIndex("by_consensusRunId", (q) => q.eq("consensusRunId", run._id))
      .take(500)
    return { run, items: items.sort((a, b) => a.suggestedRank - b.suggestedRank) }
  },
})

export const applyConsensusToPrimary = mutation({
  args: { consensusRunId: v.id("consensusRuns") },
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    const run = await ctx.db.get(args.consensusRunId)
    if (!run) throw new Error("Consensus run not found")
    const primaryId = await ensurePrimaryList(ctx, run.eventId)
    const items = await ctx.db
      .query("consensusItems")
      .withIndex("by_consensusRunId", (q) => q.eq("consensusRunId", args.consensusRunId))
      .take(500)
    for (const item of items) {
      const existing = await ctx.db
        .query("pickListItems")
        .withIndex("by_pickListId_and_teamNumber", (q) =>
          q.eq("pickListId", primaryId).eq("teamNumber", item.teamNumber),
        )
        .unique()
      const doc = {
        pickListId: primaryId,
        eventId: run.eventId,
        teamNumber: item.teamNumber,
        tier: item.suggestedTier,
        rank: item.suggestedRank,
        updatedAt: Date.now(),
      }
      if (existing) await ctx.db.patch(existing._id, doc)
      else await ctx.db.insert("pickListItems", doc)
    }
    await ctx.db.patch(args.consensusRunId, { appliedAt: Date.now() })
  },
})
