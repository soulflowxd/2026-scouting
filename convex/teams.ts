import { ConvexError, v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireAdminFromDb } from "./lib/authz"
import { needsEventStats } from "./lib/demoTeams"

export const setPicked = mutation({
  args: { eventId: v.id("events"), teamNumber: v.number(), picked: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireAdminFromDb(ctx)
    const team = await ctx.db.query("teams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).unique()
    if (!team) throw new ConvexError("Team not found in this event")
    const existing = await ctx.db.query("pickedTeams").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).unique()
    const doc = { ...args, updatedByToken: user.tokenIdentifier, updatedAt: Date.now() }
    if (existing) await ctx.db.patch(existing._id, doc)
    else await ctx.db.insert("pickedTeams", doc)
    return null
  },
})

function climbScore(level: string) {
  if (level === "level3") return 3
  if (level === "level2") return 2
  if (level === "level1") return 1
  return 0
}

function climbLabel(score: number) {
  if (score >= 3) return "Level 3"
  if (score >= 2) return "Level 2"
  if (score >= 1) return "Level 1"
  return "No climb"
}

export const list = query({
  args: {
    eventId: v.id("events"),
    xpScope: v.optional(v.union(v.literal("season"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const selections = await ctx.db.query("pickedTeams")
      .withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId)).take(500)
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)
    const pits = await ctx.db
      .query("pitReports")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)
    const reports = await ctx.db
      .query("matchReports")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(2000)
    const pickItems = await ctx.db
      .query("pickListItems")
      .withIndex("by_eventId_and_teamNumber", (q) => q.eq("eventId", args.eventId))
      .take(2000)
    const externalStats = await ctx.db
      .query("externalStats")
      .withIndex("by_eventId_and_teamNumber", (q) => q.eq("eventId", args.eventId))
      .take(500)

    return teams.filter(team => team.mergedIntoTeamNumber === undefined)
      .sort((a, b) => a.teamNumber - b.teamNumber)
      .map((team) => {
        const teamReports = reports.filter(
          (report) => report.teamNumber === team.teamNumber,
        )
        const driverAverage =
          teamReports.reduce((sum, report) => sum + report.driverRating, 0) /
          Math.max(teamReports.length, 1)
        const teleopAverage =
          teamReports.reduce((sum, report) => sum + (report.teleopFuel ?? 0), 0) /
          Math.max(teamReports.length, 1)
        const endgameScores = teamReports.map((report) =>
          climbScore(report.endgameClimb),
        )
        const bestEndgame = endgameScores.length
          ? climbLabel(Math.max(...endgameScores))
          : "No reports"
        const pickTier =
          pickItems.find((item) => item.teamNumber === team.teamNumber)?.tier ??
          "uncategorized"
        const importedStats = externalStats.find(
          (item) => item.teamNumber === team.teamNumber,
        )
        const eventOnly = needsEventStats(team)
        const stats = eventOnly && !importedStats?.eventOnly ? undefined : importedStats

        return {
          ...team,
          picked: selections.find(item => item.teamNumber === team.teamNumber)?.picked ?? false,
          pitScouted: pits.some((pit) => pit.teamNumber === team.teamNumber),
          matchReportCount: teamReports.length,
          averageDriverRating: Number(driverAverage.toFixed(1)),
          averageTeleopFuel: Number(teleopAverage.toFixed(1)),
          commonEndgameClimb: bestEndgame,
          pickTier,
          epa: stats?.epa,
          xp: args.xpScope && !eventOnly
            ? (args.xpScope === "season" ? stats?.xpSeason?.xp : stats?.xpAll?.xp)
            : stats?.xp,
          averageRp: stats?.averageRp,
          eventRank: stats?.eventRank,
        }
      })
  },
})

export const detail = query({
  args: {
    eventId: v.id("events"),
    teamNumber: v.number(),
    xpScope: v.optional(v.union(v.literal("season"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .unique()
    if (!team) return null

    const selection = await ctx.db.query("pickedTeams")
      .withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).unique()
    const breakdownFollowUps = await ctx.db.query("breakdownFollowUps")
      .withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).take(200)

    const pitReports = await ctx.db
      .query("pitReports")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .take(20)
    const matchReports = await ctx.db
      .query("matchReports")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .take(200)
    const matchVideos = (await ctx.db.query("matches")
      .withIndex("by_eventId", q => q.eq("eventId", args.eventId)).take(500))
      .filter(match => match.videoUrl && [...match.redTeams, ...match.blueTeams].includes(args.teamNumber))
      .map(match => ({ matchNumber: match.matchNumber, videoUrl: match.videoUrl! }))
      .sort((a, b) => a.matchNumber - b.matchNumber)
    const importedStats = await ctx.db
      .query("externalStats")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .unique()

    const eventOnly = needsEventStats(team)
    const stats = eventOnly && !importedStats?.eventOnly ? null : importedStats

    const count = Math.max(matchReports.length, 1)
    const autoHubWins = matchReports.filter(
      (report) => report.wonAuto ?? (report.autoAllianceFuel !== undefined && report.opponentAutoFuel !== undefined && report.autoAllianceFuel > report.opponentAutoFuel),
    ).length
    function cycleAverage(field: "autoCycles" | "teleopCyclesPerShift" | "endgameCycles" | "shift1Cycles" | "shift2Cycles" | "shift3Cycles") {
      const values = matchReports.flatMap(report => report[field] === undefined ? [] : [report[field]])
      return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null
    }
    const averages = {
      autoCycles: cycleAverage("autoCycles"),
      teleopCyclesPerShift: cycleAverage("teleopCyclesPerShift"),
      shift1Cycles: cycleAverage("shift1Cycles"),
      shift2Cycles: cycleAverage("shift2Cycles"),
      shift3Cycles: cycleAverage("shift3Cycles"),
      endgameCycles: cycleAverage("endgameCycles"),
      autoFuel: Number(
        (
          matchReports.reduce((sum, report) => sum + (report.autoFuel ?? 0), 0) / count
        ).toFixed(1),
      ),
      teleopFuel: Number(
        (
          matchReports.reduce((sum, report) => sum + (report.teleopFuel ?? 0), 0) /
          count
        ).toFixed(1),
      ),
      autoHubWinRate: Number(
        (autoHubWins / Math.max(matchReports.length, 1)).toFixed(2),
      ),
      autoClimb: Number(
        (
          matchReports.reduce(
            (sum, report) => sum + climbScore(report.autoClimb),
            0,
          ) / count
        ).toFixed(1),
      ),
      endgameClimb: Number(
        (
          matchReports.reduce(
            (sum, report) => sum + climbScore(report.endgameClimb),
            0,
          ) / count
        ).toFixed(1),
      ),
      driverRating: Number(
        (
          matchReports.reduce((sum, report) => sum + report.driverRating, 0) /
          count
        ).toFixed(1),
      ),
    }

    return {
      team,
      picked: selection?.picked ?? false,
      breakdownFollowUps,
      pitReports,
      matchReports,
      matchVideos,
      stats: stats && args.xpScope && !eventOnly ? {
        ...stats,
        ...{
          xp: undefined, match13Epa: undefined, autoXp: undefined,
          teleopXp: undefined, endgameXp: undefined,
          predictedRp1: undefined, predictedRp2: undefined, predictedRp3: undefined,
        },
        ...(args.xpScope === "season" ? stats.xpSeason : stats.xpAll),
      } : stats,
      averages,
    }
  },
})
