/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

function setAdminEnv() {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }
  globalWithProcess.process = {
    env: {
      ADMIN_EMAILS: "admin@example.com",
      TBA_API_KEY: "test",
    },
  }
}

function user(email: string, tokenIdentifier: string) {
  return {
    email,
    tokenIdentifier,
    subject: tokenIdentifier,
    issuer: "test",
  }
}

async function seedEvent() {
  setAdminEnv()
  const t = convexTest(schema, modules)
  const admin = t.withIdentity(user("admin@example.com", "admin-token"))
  const eventId = await admin.mutation(api.events.createOrSelect, {
    eventKey: "2026nvlv",
  })
  await t.mutation(internal.imports.applyEventImport, {
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
  test("non-admin cannot create event", async () => {
    setAdminEnv()
    const t = convexTest(schema, modules)
    const scout = t.withIdentity(user("scout@example.com", "scout-token"))
    await expect(
      scout.mutation(api.events.createOrSelect, { eventKey: "2026nvlv" }),
    ).rejects.toThrow("Unauthorized")
  })

  test("claim lock prevents duplicate robot and duplicate scout claims", async () => {
    const { t, eventId } = await seedEvent()
    const scoutA = t.withIdentity(user("a@example.com", "scout-a"))
    const scoutB = t.withIdentity(user("b@example.com", "scout-b"))

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
  })

  test("match report rejects illegal auto climb", async () => {
    const { t, eventId } = await seedEvent()
    const scout = t.withIdentity(user("a@example.com", "scout-a"))
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

  test("scout cannot write another user's pick list", async () => {
    const { t, eventId } = await seedEvent()
    const scoutA = t.withIdentity(user("a@example.com", "scout-a"))
    const scoutB = t.withIdentity(user("b@example.com", "scout-b"))
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

  test("consensus merge is deterministic", async () => {
    const { t, eventId } = await seedEvent()
    const admin = t.withIdentity(user("admin@example.com", "admin-token"))
    const scoutA = t.withIdentity(user("a@example.com", "scout-a"))
    const scoutB = t.withIdentity(user("b@example.com", "scout-b"))
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
