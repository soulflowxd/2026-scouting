import { v } from "convex/values"

export const pickTierValidator = v.union(
  v.literal("tier1"),
  v.literal("tier2"),
  v.literal("tier3"),
  v.literal("doNotPick"),
  v.literal("uncategorized"),
)

export const autoClimbValidator = v.union(
  v.literal("none"),
  v.literal("level1"),
)

export const climbLevelValidator = v.union(
  v.literal("none"),
  v.literal("level1"),
  v.literal("level2"),
  v.literal("level3"),
)

export const pitReportInputValidator = {
  eventId: v.id("events"),
  teamNumber: v.number(),
  canScoreFuelHub: v.boolean(),
  canIntakeDepot: v.boolean(),
  canIntakeFloor: v.boolean(),
  canPreload: v.boolean(),
  preloadCount: v.number(),
  canClimbLevel1: v.boolean(),
  canClimbLevel2: v.boolean(),
  canClimbLevel3: v.boolean(),
  canAutoClimbLevel1: v.boolean(),
  canCrossBump: v.boolean(),
  canCrossTrench: v.boolean(),
  drivetrain: v.string(),
  swerveType: v.optional(v.string()),
  tread: v.optional(v.string()),
  motorBrand: v.optional(v.string()),
  robotArchitecture: v.optional(v.string()),
  autoDescription: v.optional(v.string()),
  autoScore: v.optional(v.number()),
  teleopScore: v.optional(v.number()),
  cyclesPerShift: v.optional(v.number()),
  autoPath: v.optional(v.array(v.array(v.object({ x: v.number(), y: v.number() })))),
  bps: v.optional(v.number()),
  fuelCapacity: v.optional(v.number()),
  intakeBps: v.optional(v.number()),
  framePerimeter: v.optional(v.number()),
  frameLength: v.optional(v.number()),
  frameWidth: v.optional(v.number()),
  weight: v.optional(v.number()),
  overallLength: v.optional(v.number()),
  overallWidth: v.optional(v.number()),
  notes: v.string(),
}

export const matchReportInputValidator = {
  eventId: v.id("events"),
  matchNumber: v.number(),
  teamNumber: v.number(),
  autoFuel: v.number(),
  autoClimb: autoClimbValidator,
  autoNotes: v.string(),
  teleopFuel: v.number(),
  teleopNotes: v.string(),
  endgameClimb: climbLevelValidator,
  endgameNotes: v.string(),
  driverRating: v.number(),
  defenseRating: v.number(),
  tags: v.array(v.string()),
  autoAllianceFuel: v.number(),
  opponentAutoFuel: v.number(),
}
