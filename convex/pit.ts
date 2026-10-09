import { mutation, query } from "./_generated/server"
import { requireAdminFromDb, requireApprovedUserFromDb } from "./lib/authz"
import { requireScoutingOpen } from "./lib/scoutingAccess"
import { pitReportInputValidator } from "./validators"
import { ConvexError, v } from "convex/values"

export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await requireApprovedUserFromDb(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const photoUrls = query({
  args: { photoIds: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    await requireApprovedUserFromDb(ctx)
    if (args.photoIds.length > 6) throw new ConvexError("Maximum 6 photos per read request")
    return await Promise.all(args.photoIds.map(async id => ({ id, url: await ctx.storage.getUrl(id) })))
  },
})

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

export const remove = mutation({
  args: { reportId: v.id("pitReports") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminFromDb(ctx)
    const report = await ctx.db.get(args.reportId)
    if (!report) throw new ConvexError("Pit report not found")
    // Preserve storage files: another report may reference the same photo.
    await ctx.db.delete(report._id)
    return null
  },
})

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
    if (args.clientSubmissionId) {
      if (args.clientSubmissionId.length > 100) throw new ConvexError("Invalid submission identifier")
      const previous = await ctx.db.query("pitReports").withIndex("by_eventId_and_teamNumber", q => q.eq("eventId", args.eventId).eq("teamNumber", args.teamNumber)).first()
      if (previous?.clientSubmissionId === args.clientSubmissionId && previous.scoutToken === user.tokenIdentifier) return previous._id
    }
    await requireScoutingOpen(ctx, args.eventId)
    for (const value of [args.electricalQuality, args.buildQuality]) {
      if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 10)) throw new ConvexError("Quality ratings must be whole numbers from 1 to 10")
    }
    if (args.programmingLanguage !== undefined && (!args.programmingLanguage.trim() || args.programmingLanguage.length > 100)) throw new ConvexError("Enter a programming language (or Unknown), up to 100 characters")
    if (args.allianceRole !== undefined && args.allianceRole.length > 200) throw new ConvexError("Keep alliance role under 200 characters")
    const canSkipPhoto = user.role === "admin" || user.role === "superAdmin"
    if (!args.photoIds?.length && !canSkipPhoto) throw new ConvexError("Upload at least one robot photo before submitting")
    if ((args.photoIds?.length ?? 0) > 4) throw new ConvexError("Maximum 4 robot photos")
    for (const id of args.photoIds ?? []) {
      const photo = await ctx.db.system.get(id)
      if (!photo || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(photo.contentType ?? "") || photo.size > 10 * 1024 * 1024) {
        throw new ConvexError("Robot photos must be JPG, PNG, WebP or GIF images under 10 MB")
      }
    }
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
      .first()
    if (existing) throw new ConvexError("Pit report already submitted. An admin must delete it before scouting this team again.")
    const doc = {
      ...args,
      programmingLanguage: args.programmingLanguage?.trim(),
      allianceRole: args.allianceRole?.trim(),
      swerveType: args.drivetrain.toLowerCase().includes("swerve") ? args.swerveType : "",
      tread: args.drivetrain.toLowerCase().includes("swerve") ? args.tread : "",
      preloadCount,
      scoutToken: user.tokenIdentifier,
      updatedAt: Date.now(),
    }
    return await ctx.db.insert("pitReports", doc)
  },
})
