import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdminFromDb, requireApprovedUserFromDb } from "./lib/authz"
import { planScoutGroups } from "./lib/scoutAssignmentPlan"
import { assignmentContext, matchPlan } from "./lib/scoutMatchAssignments"
import type { Id } from "./_generated/dataModel"

const eventArgs = { eventId: v.id("events") }
export const adminList = query({
  args: eventArgs,
  handler: async (ctx, { eventId }) => {
    await requireAdminFromDb(ctx)
    const event = await ctx.db.get(eventId)
    const participants = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", eventId)).take(500)
    const assignments = await ctx.db.query("scoutTeamAssignments").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", eventId)).take(500)
    const teams = (await ctx.db.query("teams").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)).filter(team => !team.mergedIntoTeamNumber)
    const members = (await ctx.db.query("members").take(500)).filter(member => !member.mergedInto && member.approvalStatus !== "rejected" && member.approvalStatus !== "pending")
    const matches = await ctx.db.query("matches").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(500)
    const eligible = new Set(members.map(member => member._id))
    const context = { event, groups: assignments.map(row => ({ teamNumber: row.teamNumber, scout: row.memberId as string })), scouts: participants.filter(row => eligible.has(row.memberId)).map(row => row.memberId as string), members }
    const matchAssignments = matches.map(match => ({ matchNumber: match.matchNumber, slots: matchPlan(context, match), uncovered: [...match.redTeams, ...match.blueTeams].length - matchPlan(context, match).length }))
    return { enabled: event?.scoutAssignmentsEnabled ?? false, participants: participants.map(row => row.memberId), assignments, teams, matchAssignments, members: members.map(member => ({ _id: member._id, name: member.name || member.email || "Scout" })) }
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
    if (args.included && !existing) await ctx.db.insert("scoutAssignmentParticipants", { eventId: args.eventId, memberId: args.memberId })
    if (!args.included) {
      if (existing) await ctx.db.delete(existing._id)
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
    const participants = await ctx.db.query("scoutAssignmentParticipants").withIndex("by_eventId_and_memberId", q => q.eq("eventId", eventId)).take(500)
    const scouts: Id<"members">[] = []
    for (const participant of participants) {
      const member = await ctx.db.get(participant.memberId)
      if (member && !member.mergedInto && member.approvalStatus !== "rejected" && member.approvalStatus !== "pending") scouts.push(member._id)
    }
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
      if (!participant || !member || member.mergedInto || member.approvalStatus === "pending" || member.approvalStatus === "rejected") throw new ConvexError("Choose an included, approved scout")
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
