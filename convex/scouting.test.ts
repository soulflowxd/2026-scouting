/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test"
import { describe, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

function setAdminEnv() {
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com")
  vi.stubEnv("TBA_API_KEY", "test")
}

function user(email: string, tokenIdentifier: string) {
  return {
    email,
    tokenIdentifier,
    subject: tokenIdentifier,
    issuer: "test",
  }
}

async function approvedScout(
  t: TestConvex<typeof schema>,
  email: string,
  tokenIdentifier: string,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      tokenIdentifier,
      email,
      name: email.split("@")[0],
      role: "scout",
      approvalStatus: "approved",
      requestedAt: 1,
      approvedAt: 1,
      lastSeenAt: 1,
    })
  })
  return t.withIdentity(user(email, tokenIdentifier))
}

async function seedEvent() {
  setAdminEnv()
  const t = convexTest(schema, modules)
  const admin = t.withIdentity(user("admin@example.com", "admin-token"))
  const eventId = await admin.mutation(api.events.createOrSelect, {
    eventKey: "2026nvlv",
  })
  await admin.mutation(api.events.setScoutingEnabled, { eventId, enabled: true })
  await t.mutation(internal.importData.applyEventImport, {
    eventId,
    teams: [
      { tbaTeamKey: "frc1", teamNumber: 1, nickname: "One" },
      { tbaTeamKey: "frc2", teamNumber: 2, nickname: "Two" },
      { tbaTeamKey: "frc3", teamNumber: 3, nickname: "Three" },
    ],
    matches: [
      {
        tbaMatchKey: "2026nvlv_qm1",
        matchNumber: 1,
        redTeams: [1, 2, 3],
        blueTeams: [4, 5, 6],
      },
    ],
  })
  return { t, eventId }
}

describe("scouting backend", () => {
  test("notifications are empty when signed out and private to their recipient", async () => {
    const { t, eventId } = await seedEvent()
    await t.run(async (ctx) => {
      await ctx.db.insert("scoutNotifications", { recipientToken: "scout-a", eventId, kind: "robotBreakdown", matchNumber: 1, teamNumber: 1, message: "Robot breakdown", createdAt: 1 })
    })
    expect(await t.query(api.notifications.mine, {})).toEqual([])
    const a = t.withIdentity(user("a@example.com", "scout-a"))
    const b = t.withIdentity(user("b@example.com", "scout-b"))
    expect(await a.query(api.notifications.mine, {})).toHaveLength(1)
    expect(await b.query(api.notifications.mine, {})).toEqual([])
  })
  test("pit configuration saves, updates and validates BPS", async () => {
    const { t, eventId } = await seedEvent()
    const scout = await approvedScout(t, "a@example.com", "scout-a")
    const photoId = await t.run(async ctx => {
      const id = await ctx.storage.store(new Blob(["test image"], { type: "image/png" }))
      // convex-test omits contentType when storing blobs; simulate upload metadata.
      // @ts-expect-error System metadata writes are test-fixture only.
      await ctx.db.patch(id, { contentType: "image/png" })
      return id
    })
    const report = {
      photoIds: [photoId],
      eventId, teamNumber: 1, canScoreFuelHub: true, canIntakeDepot: false,
      canIntakeFloor: true, canPreload: false, preloadCount: 0,
      canClimbLevel1: false, canClimbLevel2: false, canClimbLevel3: false,
      canAutoClimbLevel1: false, canCrossBump: true, canCrossTrench: true,
      drivetrain: "Swerve", swerveType: "MK4i", tread: "Blue nitrile",
      motorBrand: "Kraken / NEO", robotArchitecture: "Turret", autoDescription: "Depot intake, score, then climb", bps: 5.5, notes: "",
      autoScore: 20, teleopScore: 100, cyclesPerShift: 3,
      fuelCapacity: 60, intakeBps: 8.5, framePerimeter: 96, frameLength: 24, frameWidth: 24, weight: 115, overallLength: 36, overallWidth: 32,
      autoPath: [[{ x: 10, y: 20 }, { x: 900, y: 450 }]],
    }
    const id = await scout.mutation(api.pit.save, report)
    await expect(scout.mutation(api.pit.save, { ...report, electricalQuality: 0 })).rejects.toThrow("1 to 10")
    await expect(scout.mutation(api.pit.save, { ...report, buildQuality: 10.5 })).rejects.toThrow("1 to 10")
    await expect(scout.mutation(api.pit.save, { ...report, programmingLanguage: " " })).rejects.toThrow("programming language")
    await scout.mutation(api.pit.save, { ...report, electricalQuality: 8, buildQuality: 9, programmingLanguage: " Java " })
    expect((await scout.query(api.pit.getForTeam, { eventId: report.eventId, teamNumber: report.teamNumber }))[0]).toMatchObject({ electricalQuality: 8, buildQuality: 9, programmingLanguage: "Java" })
    await expect(scout.mutation(api.pit.save, { ...report, photoIds: [] })).rejects.toThrow("at least one robot photo")
    await expect(scout.mutation(api.pit.save, { ...report, photoIds: undefined })).rejects.toThrow("at least one robot photo")
    const invalidPhoto = await t.run(async ctx => await ctx.storage.store(new Blob(["not an image"], { type: "text/plain" })))
    await expect(scout.mutation(api.pit.save, { ...report, photoIds: [invalidPhoto] })).rejects.toThrow("images under 10 MB")
    await expect(scout.mutation(api.pit.save, { ...report, photoIds: Array(7).fill(photoId) })).rejects.toThrow("Maximum 6")
    expect((await scout.query(api.pit.getForTeam, { eventId, teamNumber: 1 }))[0]).toMatchObject(report)
    await expect(scout.mutation(api.pit.save, { ...report, bps: -1 })).rejects.toThrow("BPS")
    await expect(scout.mutation(api.pit.save, { ...report, intakeBps: -1 })).rejects.toThrow("non-negative")
    await expect(scout.mutation(api.pit.save, { ...report, overallWidth: Number.NaN })).rejects.toThrow("non-negative")
    await expect(scout.mutation(api.pit.save, { ...report, fuelCapacity: 1.5 })).rejects.toThrow("whole number")
    await expect(scout.mutation(api.pit.save, { ...report, autoScore: -1 })).rejects.toThrow("non-negative")
    await expect(scout.mutation(api.pit.save, { ...report, autoPath: [[{ x: 1001, y: 20 }]] })).rejects.toThrow("Invalid auto path")
    expect(await scout.mutation(api.pit.save, { ...report, drivetrain: "Tank", bps: 0 })).toBe(id)
    expect((await scout.query(api.pit.getForTeam, { eventId, teamNumber: 1 }))[0]).toMatchObject({ swerveType: "", tread: "", bps: 0 })
  })
  test("xP scope selects independent ratings in team lists and profiles", async () => {
    const { t, eventId } = await seedEvent()
    await t.mutation(internal.importData.applyStatsRefresh, {
      eventId, refreshedAt: 1, predictions: [],
      stats: [{
        teamNumber: 1, epa: 90, averageRp: 3, xp: 80,
        xpSeason: { xp: 100, autoXp: 10 },
        xpAll: { xp: 150, autoXp: 20 },
      }],
    })
    const season = await t.query(api.teams.list, { eventId, xpScope: "season" })
    const all = await t.query(api.teams.list, { eventId, xpScope: "all" })
    expect(season[0].xp).toBe(100)
    expect(all[0].xp).toBe(150)
    expect(season[0].epa).toBe(all[0].epa)
    expect(season[0].averageRp).toBe(all[0].averageRp)
    const detail = await t.query(api.teams.detail, {
      eventId, teamNumber: 1, xpScope: "all",
    })
    expect(detail?.stats?.autoXp).toBe(20)
    expect(all[1].xp).toBeUndefined()
  })

  test("non-admin cannot create event", async () => {
    setAdminEnv()
    const t = convexTest(schema, modules)
    const scout = await approvedScout(t, "scout@example.com", "scout-token")
    await expect(
      scout.mutation(api.events.createOrSelect, { eventKey: "2026nvlv" }),
    ).rejects.toThrow("Unauthorized")
  })

  test("new accounts wait for approval and the super admin manages admins", async () => {
    setAdminEnv()
    const t = convexTest(schema, modules)
    const scout = t.withIdentity(user("new@example.com", "new-scout"))
    const superAdmin = t.withIdentity(
      user("luqman.a.khan101010@gmail.com", "super-admin-token"),
    )

    await scout.mutation(api.members.ensureMe, {})
    expect((await scout.query(api.members.me, {})).approvalStatus).toBe("pending")

    await superAdmin.mutation(api.members.ensureMe, {})
    expect(await superAdmin.query(api.members.me, {})).toMatchObject({
      role: "admin",
      isSuperAdmin: true,
    })
    const member = (await superAdmin.query(api.members.listForAdmin, {})).find(
      (item) => item.tokenIdentifier === "new-scout",
    )
    if (!member) throw new Error("New scout was not registered")

    await superAdmin.mutation(api.members.setApproval, {
      memberId: member._id,
      status: "approved",
    })
    expect((await scout.query(api.members.me, {})).approvalStatus).toBe("approved")

    await superAdmin.mutation(api.members.setAdminRole, {
      memberId: member._id,
      isAdmin: true,
    })
    expect((await scout.query(api.members.me, {})).role).toBe("admin")
    await superAdmin.mutation(api.members.setAdminRole, {
      memberId: member._id,
      isAdmin: false,
    })
    expect((await scout.query(api.members.me, {})).role).toBe("scout")
  })

  test("claim lock prevents duplicate robot and duplicate scout claims", async () => {
    const { t, eventId } = await seedEvent()
    const scoutA = await approvedScout(t, "a@example.com", "scout-a")
    const scoutB = await approvedScout(t, "b@example.com", "scout-b")

    await scoutA.mutation(api.matchScouting.claimRobot, {
      eventId,
      matchNumber: 1,
      teamNumber: 1,
    })
    await expect(
      scoutB.mutation(api.matchScouting.claimRobot, {
        eventId,
        matchNumber: 1,
        teamNumber: 1,
      }),
    ).rejects.toThrow("Robot already claimed")
    await expect(
      scoutA.mutation(api.matchScouting.claimRobot, {
        eventId,
        matchNumber: 1,
        teamNumber: 2,
      }),
    ).rejects.toThrow("Scout already claimed")
    const claims = await scoutA.query(api.matchScouting.claimsForMatch, { eventId, matchNumber: 1 })
    await expect(scoutB.mutation(api.matchScouting.releaseClaim, { claimId: claims[0]._id })).rejects.toThrow("Only the scout")
    await scoutA.mutation(api.matchScouting.releaseClaim, { claimId: claims[0]._id })
    await scoutA.mutation(api.matchScouting.claimRobot, { eventId, matchNumber: 1, teamNumber: 2 })
  })

  test("match report rejects illegal auto climb", async () => {
    const { t, eventId } = await seedEvent()
    const scout = await approvedScout(t, "a@example.com", "scout-a")
    await scout.mutation(api.matchScouting.claimRobot, {
      eventId,
      matchNumber: 1,
      teamNumber: 1,
    })
    await expect(
      scout.mutation(api.matchScouting.saveReport, {
        eventId,
        matchNumber: 1,
        teamNumber: 1,
        autoFuel: 1,
        autoClimb: "level2",
        autoNotes: "",
        teleopFuel: 2,
        teleopNotes: "",
        endgameClimb: "level3",
        endgameNotes: "",
        driverRating: 8,
        defenseRating: 4,
        tags: [],
        autoAllianceFuel: 4,
        opponentAutoFuel: 3,
      } as never),
    ).rejects.toThrow()
  })

  test("a breakdown report alerts scouts and admins once and syncs missed alerts", async () => {
    const { t, eventId } = await seedEvent()
    const admin = t.withIdentity(user("admin@example.com", "admin-token"))
    const scoutA = t.withIdentity(user("a@example.com", "scout-a"))
    const scoutB = t.withIdentity(user("b@example.com", "scout-b"))
    const lateScout = t.withIdentity(user("late@example.com", "scout-late"))
    await admin.mutation(api.members.ensureMe, {})
    await scoutA.mutation(api.members.ensureMe, {})
    await scoutB.mutation(api.members.ensureMe, {})
    const initialMembers = await admin.query(api.members.listForAdmin, {})
    for (const member of initialMembers.filter((item) =>
      ["scout-a", "scout-b"].includes(item.tokenIdentifier),
    )) {
      await admin.mutation(api.members.setApproval, {
        memberId: member._id,
        status: "approved",
      })
    }
    await scoutA.mutation(api.matchScouting.claimRobot, {
      eventId,
      matchNumber: 1,
      teamNumber: 1,
    })

    const report = {
      eventId,
      matchNumber: 1,
      teamNumber: 1,
      autoFuel: 1,
      autoClimb: "none" as const,
      autoNotes: "",
      teleopFuel: 2,
      teleopNotes: "Stopped moving",
      endgameClimb: "none" as const,
      endgameNotes: "",
      driverRating: 5,
      defenseRating: 5,
      tags: ["Broke down"],
      autoAllianceFuel: 4,
      opponentAutoFuel: 3,
    }

    await scoutA.mutation(api.matchScouting.saveReport, report)
    await lateScout.mutation(api.members.ensureMe, {})
    const lateMember = (await admin.query(api.members.listForAdmin, {})).find(
      (member) => member.tokenIdentifier === "scout-late",
    )
    if (!lateMember) throw new Error("Late scout was not registered")
    await admin.mutation(api.members.setApproval, {
      memberId: lateMember._id,
      status: "approved",
    })
    expect(await lateScout.query(api.notifications.mine, {})).toEqual([])
    expect(
      await lateScout.mutation(api.notifications.syncBreakdownAlerts, { eventId }),
    ).toBe(1)
    expect(
      await lateScout.mutation(api.notifications.syncBreakdownAlerts, { eventId }),
    ).toBe(0)

    const alertsAdmin = await admin.query(api.notifications.mine, {})
    const alertsA = await scoutA.query(api.notifications.mine, {})
    const alertsB = await scoutB.query(api.notifications.mine, {})
    const alertsLate = await lateScout.query(api.notifications.mine, {})
    expect(alertsAdmin).toHaveLength(1)
    expect(alertsA).toHaveLength(1)
    expect(alertsB).toHaveLength(1)
    expect(alertsLate).toHaveLength(1)
    expect(alertsB[0]).toMatchObject({
      eventId,
      matchNumber: 1,
      teamNumber: 1,
      kind: "robotBreakdown",
    })

    await scoutB.mutation(api.notifications.markRead, {
      notificationId: alertsB[0]._id,
    })
    await scoutB.mutation(api.notifications.markAllRead, {})
    expect(await scoutB.query(api.notifications.mine, {})).toHaveLength(1)
    await expect(scoutB.mutation(api.notifications.submitBreakdownFollowUp, {
      notificationId: alertsB[0]._id, whatBroke: "Chain snapped", cause: "  ", repairStatus: "Fixed", notes: "",
    })).rejects.toThrow("Describe what caused")
    await expect(scoutA.mutation(api.notifications.submitBreakdownFollowUp, {
      notificationId: alertsB[0]._id, whatBroke: "Chain", cause: "", repairStatus: "Fixed", notes: "",
    })).rejects.toThrow("Notification not found")
    await expect(scoutB.mutation(api.notifications.submitBreakdownFollowUp, {
      notificationId: alertsB[0]._id, whatBroke: "  ", cause: "", repairStatus: "Fixed", notes: "",
    })).rejects.toThrow("Describe what broke")
    expect(await scoutB.query(api.notifications.mine, {})).toHaveLength(1)
    const followUpId = await scoutB.mutation(api.notifications.submitBreakdownFollowUp, {
      notificationId: alertsB[0]._id, whatBroke: "Intake chain snapped", cause: "Loose tension", repairStatus: "Replaced and tested", notes: "Ready for next match",
    })
    expect(await scoutA.query(api.notifications.mine, {})).toEqual([])
    expect(await scoutB.query(api.notifications.mine, {})).toEqual([])
    expect(await admin.query(api.notifications.mine, {})).toEqual([])
    expect(await lateScout.query(api.notifications.mine, {})).toEqual([])
    await t.run(async (ctx) => {
      expect(await ctx.db.get(followUpId)).toMatchObject({
        teamNumber: 1, matchNumber: 1, whatBroke: "Intake chain snapped", scoutToken: "scout-b",
      })
    })
    expect(await scoutA.mutation(api.notifications.submitBreakdownFollowUp, {
      notificationId: alertsA[0]._id, whatBroke: "Duplicate", cause: "Loose tension", repairStatus: "Fixed", notes: "",
    })).toBe(followUpId)
  })

  test("scout cannot write another user's pick list", async () => {
    const { t, eventId } = await seedEvent()
    const scoutA = await approvedScout(t, "a@example.com", "scout-a")
    const scoutB = await approvedScout(t, "b@example.com", "scout-b")
    const listId = await scoutA.mutation(api.pickLists.createPersonal, {
      eventId,
      name: "A list",
    })
    await expect(
      scoutB.mutation(api.pickLists.moveTeam, {
        pickListId: listId,
        teamNumber: 1,
        tier: "tier1",
        rank: 0,
      }),
    ).rejects.toThrow("Unauthorized")
  })

  test("only admins can edit the main pick list; scouts can edit their own", async () => {
    const { t, eventId } = await seedEvent()
    const admin = t.withIdentity(user("admin@example.com", "admin-token"))
    const scout = await approvedScout(t, "scout@example.com", "scout")
    const pickListId = await admin.mutation(api.pickLists.ensurePrimary, { eventId })
    const placement = { teamNumber: 1, tier: "tier1" as const, rank: 0 }
    await expect(scout.mutation(api.pickLists.ensurePrimary, { eventId })).rejects.toThrow("Unauthorized")
    await expect(scout.mutation(api.pickLists.moveTeam, { pickListId, ...placement })).rejects.toThrow("Unauthorized")
    expect(await scout.mutation(api.pickLists.moveTeams, { pickListId, placements: [placement] })).toMatchObject({ ok: false })
    await expect(scout.mutation(api.pickLists.runConsensus, { eventId })).rejects.toThrow("Unauthorized")
    const runId = await admin.mutation(api.pickLists.runConsensus, { eventId })
    await expect(scout.mutation(api.pickLists.applyConsensusToPrimary, { consensusRunId: runId })).rejects.toThrow("Unauthorized")
    expect((await scout.query(api.pickLists.listForEvent, { eventId }))[0].items).toHaveLength(0)
    expect(await admin.mutation(api.pickLists.moveTeams, { pickListId, placements: [placement] })).toMatchObject({ ok: true })
    const personalId = await scout.mutation(api.pickLists.createPersonal, { eventId, name: "My list" })
    expect(await scout.mutation(api.pickLists.moveTeams, { pickListId: personalId, placements: [placement] })).toMatchObject({ ok: true })
  })

  test("consensus merge is deterministic", async () => {
    const { t, eventId } = await seedEvent()
    const admin = t.withIdentity(user("admin@example.com", "admin-token"))
    const scoutA = await approvedScout(t, "a@example.com", "scout-a")
    const scoutB = await approvedScout(t, "b@example.com", "scout-b")
    const listA = await scoutA.mutation(api.pickLists.createPersonal, {
      eventId,
      name: "A",
    })
    const listB = await scoutB.mutation(api.pickLists.createPersonal, {
      eventId,
      name: "B",
    })
    await scoutA.mutation(api.pickLists.moveTeam, {
      pickListId: listA,
      teamNumber: 1,
      tier: "tier1",
      rank: 0,
    })
    await scoutB.mutation(api.pickLists.moveTeam, {
      pickListId: listB,
      teamNumber: 1,
      tier: "tier2",
      rank: 0,
    })

    await admin.mutation(api.pickLists.runConsensus, { eventId })
    const first = await admin.query(api.pickLists.latestConsensus, { eventId })
    await admin.mutation(api.pickLists.runConsensus, { eventId })
    const second = await admin.query(api.pickLists.latestConsensus, { eventId })

    expect(first?.items.map(({ teamNumber, suggestedTier, suggestedRank, score }) => ({
      teamNumber,
      suggestedTier,
      suggestedRank,
      score,
    }))).toEqual(
      second?.items.map(({ teamNumber, suggestedTier, suggestedRank, score }) => ({
        teamNumber,
        suggestedTier,
        suggestedRank,
        score,
      })),
    )
  })
})
