import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { match13RatingValidator } from "./lib/match13"
import { tbaResultValidator } from "./lib/tbaMatchResult"

const pickTier = v.union(
  v.literal("tier1"),
  v.literal("tier2"),
  v.literal("tier3"),
  v.literal("doNotPick"),
  v.literal("uncategorized"),
)

const climbLevel = v.union(
  v.literal("none"),
  v.literal("level1"),
  v.literal("level2"),
  v.literal("level3"),
)

export default defineSchema({
  ...authTables,
  users: defineTable({
    ...authTables.users.validator.fields,
    teamNumber: v.optional(v.union(v.literal(9128), v.literal(10340))),
  }).index("email", ["email"]).index("phone", ["phone"]),
  members: defineTable({
    teamNumber: v.optional(v.union(v.literal(9128), v.literal(10340))),
    authUserId: v.optional(v.id("users")),
    mergedInto: v.optional(v.id("members")),
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.union(
      v.literal("superAdmin"),
      v.literal("admin"),
      v.literal("scout"),
    ),
    approvalStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    requestedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    approvalNoticePending: v.optional(v.boolean()),
    approvedByToken: v.optional(v.string()),
    lastSeenAt: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_authUserId", ["authUserId"])
    .index("by_role", ["role"])
    .index("by_approvalStatus", ["approvalStatus"]),
  events: defineTable({
    scoutAssignmentsEnabled: v.optional(v.boolean()),
    scoutAssignmentSeed: v.optional(v.number()),
    scoutingEnabled: v.optional(v.boolean()),
    eventKey: v.string(),
    name: v.optional(v.string()),
    importStatus: v.union(
      v.literal("empty"),
      v.literal("importing"),
      v.literal("ready"),
      v.literal("error"),
    ),
    importMessage: v.optional(v.string()),
    importedAt: v.optional(v.number()),
    statsRefreshedAt: v.optional(v.number()),
    activeAt: v.optional(v.number()),
    createdByToken: v.string(),
  })
    .index("by_eventKey", ["eventKey"])
    .index("by_activeAt", ["activeAt"]),
  pickedTeams: defineTable({
    eventId: v.id("events"),
    teamNumber: v.number(),
    picked: v.boolean(),
    updatedByToken: v.string(),
    updatedAt: v.number(),
  }).index("by_eventId_and_teamNumber", ["eventId", "teamNumber"]),
  teams: defineTable({
    avatar: v.optional(v.string()),
    mergedIntoTeamNumber: v.optional(v.number()),
    eventTeamAlias: v.optional(v.string()),
    eventId: v.id("events"),
    tbaTeamKey: v.string(),
    teamNumber: v.number(),
    nickname: v.string(),
    city: v.optional(v.string()),
    stateProv: v.optional(v.string()),
    country: v.optional(v.string()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_teamNumber", ["eventId", "teamNumber"]),
  matches: defineTable({
    completionReviewAt: v.optional(v.number()),
    completionAssignments: v.optional(v.array(v.object({ teamNumber: v.number(), scoutToken: v.string(), scoutName: v.string() }))),
    tbaResult: v.optional(tbaResultValidator),
    tbaCheckedAt: v.optional(v.number()),
    eventId: v.id("events"),
    tbaMatchKey: v.string(),
    matchNumber: v.number(),
    redTeams: v.array(v.number()),
    blueTeams: v.array(v.number()),
    scheduledTime: v.optional(v.number()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_matchNumber", ["eventId", "matchNumber"]),
  externalStats: defineTable({
    eventOnly: v.optional(v.boolean()),
    eventId: v.id("events"),
    teamNumber: v.number(),
    opr: v.optional(v.number()),
    dpr: v.optional(v.number()),
    ccwm: v.optional(v.number()),
    wins: v.optional(v.number()),
    losses: v.optional(v.number()),
    ties: v.optional(v.number()),
    averageRp: v.optional(v.number()),
    eventRank: v.optional(v.number()),
    xp: v.optional(v.number()),
    xpSeason: v.optional(match13RatingValidator),
    xpAll: v.optional(match13RatingValidator),
    match13Epa: v.optional(v.number()),
    autoXp: v.optional(v.number()),
    teleopXp: v.optional(v.number()),
    endgameXp: v.optional(v.number()),
    predictedRp1: v.optional(v.number()),
    predictedRp2: v.optional(v.number()),
    predictedRp3: v.optional(v.number()),
    epa: v.optional(v.number()),
    autoEpa: v.optional(v.number()),
    teleopEpa: v.optional(v.number()),
    endgameEpa: v.optional(v.number()),
    refreshedAt: v.number(),
  }).index("by_eventId_and_teamNumber", ["eventId", "teamNumber"]),
  winPredictions: defineTable({
    eventId: v.id("events"),
    matchNumber: v.number(),
    redWinProb: v.optional(v.number()),
    blueWinProb: v.optional(v.number()),
    source: v.string(),
    refreshedAt: v.number(),
  }).index("by_eventId_and_matchNumber", ["eventId", "matchNumber"]),
  pitReports: defineTable({
    photoIds: v.optional(v.array(v.id("_storage"))),
    eventId: v.id("events"),
    teamNumber: v.number(),
    scoutToken: v.string(),
    canScoreFuelHub: v.boolean(),
    canIntakeDepot: v.boolean(),
    canIntakeOutpost: v.optional(v.boolean()),
    electricalQuality: v.optional(v.number()),
    buildQuality: v.optional(v.number()),
    programmingLanguage: v.optional(v.string()),
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
    allianceRole: v.optional(v.string()),
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
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_teamNumber", ["eventId", "teamNumber"]),
  matchReports: defineTable({
    eventId: v.id("events"),
    matchNumber: v.number(),
    teamNumber: v.number(),
    scoutToken: v.string(),
    autoFuel: v.optional(v.number()),
    autoCycles: v.optional(v.number()),
    teleopCyclesPerShift: v.optional(v.number()),
    shift1Cycles: v.optional(v.number()),
    shift2Cycles: v.optional(v.number()),
    shift3Cycles: v.optional(v.number()),
    transitionActivity: v.optional(v.string()),
    endgameCycles: v.optional(v.number()),
    offShiftActivity: v.optional(v.string()),
    autoClimb: v.union(v.literal("none"), v.literal("level1")),
    autoNotes: v.string(),
    autoPath: v.optional(v.array(v.array(v.object({ x: v.number(), y: v.number() })))),
    teleopFuel: v.optional(v.number()),
    teleopNotes: v.string(),
    endgameClimb: climbLevel,
    endgameNotes: v.string(),
    driverRating: v.number(),
    defenseRating: v.number(),
    tags: v.array(v.string()),
    autoAllianceFuel: v.optional(v.number()),
    opponentAutoFuel: v.optional(v.number()),
    wonAuto: v.optional(v.boolean()),
    wonMatch: v.optional(v.boolean()),
    totalMatchPoints: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_teamNumber", ["eventId", "teamNumber"])
    .index("by_eventId_and_matchNumber", ["eventId", "matchNumber"])
    .index("by_eventId_and_matchNumber_and_teamNumber_and_scoutToken", [
      "eventId",
      "matchNumber",
      "teamNumber",
      "scoutToken",
    ]),
  scoutAssignmentParticipants: defineTable({
    eventId: v.id("events"), memberId: v.id("members"),
    included: v.optional(v.boolean()),
  }).index("by_eventId_and_memberId", ["eventId", "memberId"]),
  scoutTeamAssignments: defineTable({
    eventId: v.id("events"), teamNumber: v.number(), memberId: v.id("members"),
  }).index("by_eventId_and_teamNumber", ["eventId", "teamNumber"])
    .index("by_eventId_and_memberId", ["eventId", "memberId"]),
  matchRobotClaims: defineTable({
    eventId: v.id("events"),
    matchNumber: v.number(),
    teamNumber: v.number(),
    scoutToken: v.string(),
    scoutName: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("released")),
    claimedAt: v.number(),
    releasedAt: v.optional(v.number()),
    substituteToken: v.optional(v.string()),
    substituteName: v.optional(v.string()),
    breakRequestedAt: v.optional(v.number()),
    substituteAcceptedAt: v.optional(v.number()),
    handoffFromToken: v.optional(v.string()),
    handoffCompletedAt: v.optional(v.number()),
  })
    .index("by_scoutToken", ["scoutToken"])
    .index("by_substituteToken", ["substituteToken"])
    .index("by_eventId_and_matchNumber_and_teamNumber_and_status", [
      "eventId",
      "matchNumber",
      "teamNumber",
      "status",
    ])
    .index("by_eventId_and_matchNumber_and_scoutToken_and_status", [
      "eventId",
      "matchNumber",
      "scoutToken",
      "status",
    ]),
  pushSubscriptions: defineTable({
    recipientToken: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    updatedAt: v.number(),
  }).index("by_endpoint", ["endpoint"])
    .index("by_recipientToken", ["recipientToken"]),
  breakdownFollowUps: defineTable({
    eventId: v.id("events"),
    matchNumber: v.number(),
    teamNumber: v.number(),
    whatBroke: v.string(),
    cause: v.string(),
    repairStatus: v.string(),
    notes: v.string(),
    scoutToken: v.string(),
    scoutName: v.string(),
    submittedAt: v.number(),
  }).index("by_eventId_and_matchNumber_and_teamNumber", ["eventId", "matchNumber", "teamNumber"])
    .index("by_eventId_and_teamNumber", ["eventId", "teamNumber"]),
  scoutNotifications: defineTable({
    recipientToken: v.string(),
    eventId: v.id("events"),
    kind: v.literal("robotBreakdown"),
    matchNumber: v.number(),
    teamNumber: v.number(),
    message: v.string(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_eventId_and_matchNumber_and_teamNumber", ["eventId", "matchNumber", "teamNumber"])
    .index("by_recipientToken_and_createdAt", ["recipientToken", "createdAt"])
    .index("by_recipientToken_and_eventId_and_matchNumber_and_teamNumber", [
      "recipientToken",
      "eventId",
      "matchNumber",
      "teamNumber",
    ]),
  pickLists: defineTable({
    eventId: v.id("events"),
    kind: v.union(v.literal("personal"), v.literal("primary")),
    name: v.string(),
    ownerToken: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_kind", ["eventId", "kind"])
    .index("by_eventId_and_ownerToken", ["eventId", "ownerToken"]),
  pickListItems: defineTable({
    pickListId: v.id("pickLists"),
    eventId: v.id("events"),
    teamNumber: v.number(),
    tier: pickTier,
    rank: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pickListId", ["pickListId"])
    .index("by_pickListId_and_teamNumber", ["pickListId", "teamNumber"])
    .index("by_eventId_and_teamNumber", ["eventId", "teamNumber"]),
  mashVotes: defineTable({
    eventId: v.id("events"),
    ownerToken: v.string(),
    left: v.number(),
    right: v.number(),
    winner: v.union(v.number(), v.null()),
  }).index("by_eventId", ["eventId"]),
  consensusRuns: defineTable({
    eventId: v.id("events"),
    createdByToken: v.string(),
    createdAt: v.number(),
    appliedAt: v.optional(v.number()),
  }).index("by_eventId", ["eventId"]),
  consensusItems: defineTable({
    consensusRunId: v.id("consensusRuns"),
    eventId: v.id("events"),
    teamNumber: v.number(),
    suggestedTier: pickTier,
    suggestedRank: v.number(),
    score: v.number(),
  })
    .index("by_consensusRunId", ["consensusRunId"])
    .index("by_eventId", ["eventId"]),
})
