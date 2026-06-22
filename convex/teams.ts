import { v } from "convex/values"
import { query } from "./_generated/server"

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
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
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

    return teams
      .sort((a, b) => a.teamNumber - b.teamNumber)
      .map((team) => {
        const teamReports = reports.filter(
          (report) => report.teamNumber === team.teamNumber,
        )
        const driverAverage =
          teamReports.reduce((sum, report) => sum + report.driverRating, 0) /
          Math.max(teamReports.length, 1)
        const teleopAverage =
          teamReports.reduce((sum, report) => sum + report.teleopFuel, 0) /
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
        const stats = externalStats.find(
          (item) => item.teamNumber === team.teamNumber,
        )

        return {
          ...team,
          pitScouted: pits.some((pit) => pit.teamNumber === team.teamNumber),
          matchReportCount: teamReports.length,
          averageDriverRating: Number(driverAverage.toFixed(1)),
          averageTeleopFuel: Number(teleopAverage.toFixed(1)),
          commonEndgameClimb: bestEndgame,
          pickTier,
          epa: stats?.epa,
          averageRp: stats?.averageRp,
        }
      })
  },
})

export const detail = query({
  args: { eventId: v.id("events"), teamNumber: v.number() },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .unique()
    if (!team) return null

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
    const stats = await ctx.db
      .query("externalStats")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .unique()

    const count = Math.max(matchReports.length, 1)
    const autoHubWins = matchReports.filter(
      (report) => report.autoAllianceFuel > report.opponentAutoFuel,
    ).length
    const averages = {
      autoFuel: Number(
        (
          matchReports.reduce((sum, report) => sum + report.autoFuel, 0) / count
        ).toFixed(1),
      ),
      teleopFuel: Number(
        (
          matchReports.reduce((sum, report) => sum + report.teleopFuel, 0) /
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
      pitReports,
      matchReports,
      stats,
      averages,
    }
  },
})
