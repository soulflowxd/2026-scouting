import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdminFromDb, requireApprovedUserFromDb } from "./lib/authz"
import { planScoutGroups } from "./lib/scoutAssignmentPlan"
import { assignmentContext, matchPlan } from "./lib/scoutMatchAssignments"
import type { Id } from "./_generated/dataModel"
import { completionResponsibilities, ensureCompletionReview } from "./lib/scoutingCompletion"

const eventArgs = { eventId: v.id("events") }

export const openCompletionReview = mutation({
  args: { ...eventArgs, matchNumber: v.number() },
  handler: async (ctx, { eventId, matchNumber }) => {
    await requireAdminFromDb(ctx)
    const match = await ctx.db.query("matches").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", eventId).eq("matchNumber", matchNumber)).unique()
    if (!match) throw new ConvexError("Match not found in this event")
    await ensureCompletionReview(ctx, match)
  },
})

export const completionReport = query({
  args: { ...eventArgs, matchNumber: v.optional(v.number()) },
  handler: async (ctx, { eventId, matchNumber }) => {
    await requireAdminFromDb(ctx)
    const context = await assignmentContext(ctx, eventId)
    if (!context.event) throw new ConvexError("Event not found")
    const teams = (await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)).filter(team => !team.mergedIntoTeamNumber)
    const matches = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
    const reviews = await Promise.all(matches.map(async match => {
      // Existing reports predate completionReviewAt; recognize them without a migration.
      const submitted = match.completionReviewAt || match.tbaResult ? true : !!await ctx.db.query("matchReports").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", eventId).eq("matchNumber", match.matchNumber)).first()
      return { matchNumber: match.matchNumber, started: submitted }
    }))
    reviews.sort((a, b) => a.matchNumber - b.matchNumber)
    const startedReviews = reviews.filter(review => review.started)
    const selectedNumber = matchNumber ?? startedReviews[startedReviews.length - 1]?.matchNumber
    const selected = matches.find(match => match.matchNumber === selectedNumber)
    const reviewOpen = reviews.some(review => review.matchNumber === selectedNumber && review.started)
    const label = (teamNumber: number) => teams.find(team => team.teamNumber === teamNumber)?.eventTeamAlias || String(teamNumber)
    const memberById = new Map(context.members.map(member => [member._id as string, member]))
    const included = new Set<string>(context.scouts)
    const missing: { name: string; kind: "pit" | "match"; teamNumber: number; teamLabel: string; matchNumber?: number }[] = []
    let unassignedPits = 0
    for (const team of teams) {
      const report = await ctx.db.query("pitReports").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId).eq("teamNumber", team.teamNumber)).first()
      if (report) continue
      const group = context.groups.find(group => group.teamNumber === team.teamNumber && included.has(group.scout))
      const owner = group && memberById.get(group.scout)
      if (!owner) { unassignedPits++; continue }
      missing.push({ name: owner.name || owner.email || "Scout", kind: "pit", teamNumber: team.teamNumber, teamLabel: label(team.teamNumber) })
    }
    let unassignedMatchTeams = 0
    if (selected && reviewOpen) {
      const reports = await ctx.db.query("matchReports").withIndex("by_eventId_and_matchNumber", q => q.eq("eventId", eventId).eq("matchNumber", selected.matchNumber)).take(500)
      const completed = new Set(reports.map(report => report.teamNumber))
      const claims = (await ctx.db.query("matchRobotClaims").withIndex("by_eventId_and_matchNumber_and_teamNumber_and_status", q => q.eq("eventId", eventId).eq("matchNumber", selected.matchNumber)).take(500)).filter(claim => claim.status === "active")
      // Claims retain the real owner after edits; a confirmed handoff changes this owner atomically.
      const owners = new Map(completionResponsibilities(context, selected, claims).map(slot => [slot.teamNumber, slot.scoutName]))
      for (const teamNumber of new Set([...selected.redTeams, ...selected.blueTeams])) {
        if (completed.has(teamNumber)) continue
        const name = owners.get(teamNumber)
        if (!name) { unassignedMatchTeams++; continue }
        missing.push({ name, kind: "match", teamNumber, teamLabel: label(teamNumber), matchNumber: selected.matchNumber })
      }
    }
    missing.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind) || a.teamNumber - b.teamNumber)
    return { matches: reviews, matchNumber: selected?.matchNumber ?? null, reviewOpen, missing, unassignedPits, unassignedMatchTeams }
  },
})

export const adminList = query({
  args: eventArgs,
  handler: async (ctx, { eventId }) => {
    await requireAdminFromDb(ctx)
    const event = await ctx.db.get(eventId)
    const context = await assignmentContext(ctx, eventId)
    const assignments = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(500)
    const teams = (await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)).filter(team => !team.mergedIntoTeamNumber)
    const members = context.members
    const matches = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
    const matchAssignments = matches.map(match => ({ matchNumber: match.matchNumber, slots: matchPlan(context, match), uncovered: [...match.redTeams, ...match.blueTeams].length - matchPlan(context, match).length }))
    return { enabled: event?.scoutAssignmentsEnabled ?? false, participants: context.scouts, assignments, teams, matchAssignments, members: members.map(member => ({ _id: member._id, name: member.name || member.email || "Scout" })) }
  },
})
export const setParticipant = mutation({
  args: { ...eventArgs, memberId: v.id("members"), included: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    if (!await ctx.db.get(args.eventId)) throw new ConvexError("Event not found")
    const member = await ctx.db.get(args.memberId)
    if (!member || member.mergedInto || member.approvalStatus === "pending" || member.approvalStatus === "rejected") throw new ConvexError("Choose an approved scout")
    const existing = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", args.eventId).eq("memberId", args.memberId)).unique()
    if (existing) await ctx.db.patch(existing._id, { included: args.included })
    else await ctx.db.insert("scoutAssignmentParticipants", { eventId: args.eventId, memberId: args.memberId, included: args.included })
    if (!args.included) {
      const rows = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_memberId", q => q.eq("eventId", args.eventId).eq("memberId", args.memberId)).take(500)
      for (const row of rows) await ctx.db.delete(row._id)
    }
  },
})
export const setEnabled = mutation({
  args: { ...eventArgs, enabled: v.boolean() },
  handler: async (ctx, args) => { await requireAdminFromDb(ctx); await ctx.db.patch(args.eventId, { scoutAssignmentsEnabled: args.enabled }) },
})
export const generate = mutation({
  args: eventArgs,
  handler: async (ctx, { eventId }) => {
    await requireAdminFromDb(ctx)
    if (!await ctx.db.get(eventId)) throw new ConvexError("Event not found")
    const { scouts } = await assignmentContext(ctx, eventId)
    if (!scouts.length) throw new ConvexError("Include at least one approved scout in the admin list first")
    const teams = (await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)).filter(team => !team.mergedIntoTeamNumber)
    if (!teams.length) throw new ConvexError("Import the event roster first")
    const matches = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
    const plan = planScoutGroups(teams.map(team => team.teamNumber), scouts)
    const existing = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(500)
    for (const row of existing) await ctx.db.delete(row._id)
    for (const row of plan) await ctx.db.insert("scoutTeamAssignments", { eventId, teamNumber: row.teamNumber, memberId: row.scout as Id<"members"> })
    await ctx.db.patch(eventId, { scoutAssignmentsEnabled: true, scoutAssignmentSeed: Math.floor(Math.random() * 2147483647) })
    return { assigned: plan.length, unassigned: teams.length - plan.length, hasSchedule: matches.length > 0 }
  },
})
export const assignTeam = mutation({
  args: { ...eventArgs, teamNumber: v.number(), memberId: v.union(v.id("members"), v.null()) },
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    const team = await ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).unique()
    if (!team || team.mergedIntoTeamNumber) throw new ConvexError("Team not found in event")
    if (args.memberId) {
      const member = await ctx.db.get(args.memberId)
      const participant = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", args.eventId).eq("memberId", args.memberId!)).unique()
      if (participant?.included === false || !member || member.mergedInto || member.approvalStatus === "pending" || member.approvalStatus === "rejected") throw new ConvexError("Choose an included, approved scout")
    }
    const existing = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).unique()
    if (existing) {
      if (args.memberId) await ctx.db.patch(existing._id, { memberId: args.memberId })
      else await ctx.db.delete(existing._id)
    } else if (args.memberId) await ctx.db.insert("scoutTeamAssignments", { eventId: args.eventId, teamNumber: args.teamNumber, memberId: args.memberId })
  },
})
export const mine = query({
  args: eventArgs,
  handler: async (ctx, { eventId }) => {
    const user = await requireApprovedUserFromDb(ctx)
    const event = await ctx.db.get(eventId)
    const assignments = user.memberId ? await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_memberId", q => q.eq("eventId", eventId).eq("memberId", user.memberId!)).take(500) : []
    const roster = await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
    const context = await assignmentContext(ctx, eventId)
    const matches = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
    const label = (teamNumber: number) => roster.find(team => team.teamNumber === teamNumber)?.eventTeamAlias || String(teamNumber)
    const matchAssignments = matches.flatMap(match => matchPlan(context, match).filter(slot => slot.scout === user.memberId).map(slot => ({ matchNumber: match.matchNumber, teamNumber: slot.teamNumber, label: label(slot.teamNumber) }))).sort((a, b) => a.matchNumber - b.matchNumber)
    return { enabled: event?.scoutAssignmentsEnabled ?? false, hasSchedule: matches.length > 0, matchAssignments, teams: assignments.map(row => ({ teamNumber: row.teamNumber, label: label(row.teamNumber) })) }
  },
})
