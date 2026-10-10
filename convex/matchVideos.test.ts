/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const videoUrl = "https://drive.google.com/file/d/match-video-1/view?usp=sharing&resourcekey=key"

async function setup() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    for (const [tokenIdentifier, role, approvalStatus] of [
      ["video-admin", "admin", "approved"], ["video-scout", "scout", "approved"],
      ["video-pending", "scout", "pending"], ["video-rejected", "admin", "rejected"],
    ] as const) {
      await ctx.db.insert("members", { tokenIdentifier, role, approvalStatus, name: tokenIdentifier, lastSeenAt: 1 })
    }
    const eventId = await ctx.db.insert("events", { eventKey: "2026txmck", importStatus: "ready", createdByToken: "test", scoutingEnabled: false })
    const otherEventId = await ctx.db.insert("events", { eventKey: "2026ntx", importStatus: "ready", createdByToken: "test" })
    const matchId = await ctx.db.insert("matches", { eventId, matchNumber: 1, tbaMatchKey: "first:2026:TXMCK:Qualification:1", redTeams: [10340], blueTeams: [9128] })
    const otherMatchId = await ctx.db.insert("matches", { eventId: otherEventId, matchNumber: 1, tbaMatchKey: "custom:1", redTeams: [10340], blueTeams: [] })
    await ctx.db.insert("teams", { eventId, teamNumber: 10340, tbaTeamKey: "frc10340", nickname: "ITKAN" })
    await ctx.db.insert("teams", { eventId, teamNumber: 9992, tbaTeamKey: "frc9992", nickname: "Other robot" })
    return { eventId, otherEventId, matchId, otherMatchId }
  })
  return { t, ...ids, admin: t.withIdentity({ tokenIdentifier: "video-admin", subject: "video-admin", issuer: "test" }) }
}

test("admins can add, replace, and remove match video links while scouting is closed", async () => {
  const { t, admin, eventId, otherEventId, matchId, otherMatchId } = await setup()
  await admin.mutation(api.matchScouting.saveVideoLink, { matchId, videoUrl: `  ${videoUrl}  ` })
  expect((await t.query(api.matchScouting.matchesForEvent, { eventId }))[0].videoUrl).toBe(videoUrl)
  expect((await t.query(api.matchScouting.matchesForEvent, { eventId: otherEventId }))[0].videoUrl).toBeUndefined()
  const replacement = "https://drive.google.com/open?id=another-video"
  await admin.mutation(api.matchScouting.saveVideoLink, { matchId, videoUrl: replacement })
  await admin.mutation(api.matchScouting.saveVideoLink, { matchId: otherMatchId, videoUrl })
  await admin.mutation(api.matchScouting.saveVideoLink, { matchId, videoUrl: "  " })
  expect(await t.run(ctx => ctx.db.get(matchId))).toMatchObject({ redTeams: [10340], tbaMatchKey: "first:2026:TXMCK:Qualification:1" })
  expect((await t.run(ctx => ctx.db.get(matchId)))?.videoUrl).toBeUndefined()
  expect((await t.run(ctx => ctx.db.get(otherMatchId)))?.videoUrl).toBe(videoUrl)
})

test("video writes reject scouts, pending/rejected members, and unauthenticated users", async () => {
  const { t, admin, matchId } = await setup()
  await admin.mutation(api.matchScouting.saveVideoLink, { matchId, videoUrl })
  for (const tokenIdentifier of ["video-scout", "video-pending", "video-rejected"]) {
    const user = t.withIdentity({ tokenIdentifier, subject: tokenIdentifier, issuer: "test" })
    await expect(user.mutation(api.matchScouting.saveVideoLink, { matchId, videoUrl: "" })).rejects.toThrow()
  }
  await expect(t.mutation(api.matchScouting.saveVideoLink, { matchId, videoUrl })).rejects.toThrow("Not authenticated")
  expect((await t.run(ctx => ctx.db.get(matchId)))?.videoUrl).toBe(videoUrl)
})

test.each([
  "not a link", "javascript:alert(1)", "http://drive.google.com/file/d/video/view",
  "https://drive.google.com.evil.example/file/d/video/view", "https://evil.example/?next=https://drive.google.com/file/d/video/view",
  "https://name:password@drive.google.com/file/d/video/view", "https://drive.google.com/drive/folders/folder-id",
  "https://drive.google.com/open", `https://drive.google.com/file/d/${"x".repeat(2048)}/view`,
])("invalid video URL is rejected: %s", async badUrl => {
  const { t, admin, matchId } = await setup()
  await expect(admin.mutation(api.matchScouting.saveVideoLink, { matchId, videoUrl: badUrl })).rejects.toThrow("Google Drive")
  expect((await t.run(ctx => ctx.db.get(matchId)))?.videoUrl).toBeUndefined()
})

test("video links survive schedule refreshes and appear only for robots in that event's match", async () => {
  const { t, admin, eventId, matchId, otherMatchId } = await setup()
  await admin.mutation(api.matchScouting.saveVideoLink, { matchId, videoUrl })
  await admin.mutation(api.matchScouting.saveVideoLink, { matchId: otherMatchId, videoUrl: "https://drive.google.com/file/d/other-event/view" })
  await t.mutation(internal.importData.applyEventImport, { eventId, teams: [], matches: [
    { matchNumber: 1, tbaMatchKey: "first:2026:TXMCK:Qualification:1", redTeams: [10340], blueTeams: [9128], scheduledTime: 123 },
  ] })
  expect((await t.run(ctx => ctx.db.get(matchId)))?.videoUrl).toBe(videoUrl)
  const detail = await t.query(api.teams.detail, { eventId, teamNumber: 10340 })
  expect(detail?.matchReports).toEqual([])
  expect(detail?.matchVideos).toEqual([{ matchNumber: 1, videoUrl }])
  expect((await t.query(api.teams.detail, { eventId, teamNumber: 9992 }))?.matchVideos).toEqual([])
})
