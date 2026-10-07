import { mutation, query } from "./_generated/server"
import { requireApprovedUserFromDb } from "./lib/authz"
import { pitReportInputValidator } from "./validators"

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

export const getForTeam = query({
  args: {
    eventId: pitReportInputValidator.eventId,
    teamNumber: pitReportInputValidator.teamNumber,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pitReports")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .take(20)
  },
})

export const save = mutation({
  args: pitReportInputValidator,
  handler: async (ctx, args) => {
    const user = await requireApprovedUserFromDb(ctx)
    for (const value of [args.fuelCapacity, args.intakeBps, args.framePerimeter, args.frameLength, args.frameWidth, args.weight, args.overallLength, args.overallWidth]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error("Robot measurements must be non-negative numbers")
    }
    if (args.fuelCapacity !== undefined && !Number.isInteger(args.fuelCapacity)) throw new Error("Fuel capacity must be a whole number")
    for (const value of [args.autoScore, args.teleopScore, args.cyclesPerShift]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error("Scoring and cycle counts must be non-negative numbers")
    }
    if (args.autoPath && (args.autoPath.length > 200 || args.autoPath.reduce((count, path) => count + path.length, 0) > 2000 || args.autoPath.some((path) => path.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 500)))) {
      throw new Error("Invalid auto path")
    }
    if (args.bps !== undefined && (!Number.isFinite(args.bps) || args.bps < 0)) {
      throw new Error("BPS must be a non-negative number")
    }
    const preloadCount = clamp(args.preloadCount, 0, 8)
    const existing = await ctx.db
      .query("pitReports")
      .withIndex("by_eventId_and_teamNumber", (q) =>
        q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber),
      )
      .take(20)
    const mine = existing.find(
      (report) => report.scoutToken === user.tokenIdentifier,
    )
    const doc = {
      ...args,
      swerveType: args.drivetrain.toLowerCase().includes("swerve") ? args.swerveType : "",
      tread: args.drivetrain.toLowerCase().includes("swerve") ? args.tread : "",
      preloadCount,
      scoutToken: user.tokenIdentifier,
      updatedAt: Date.now(),
    }
    if (mine) {
      await ctx.db.patch(mine._id, doc)
      return mine._id
    }
    return await ctx.db.insert("pitReports", doc)
  },
})
