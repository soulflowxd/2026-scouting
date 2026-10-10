/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { afterEach, expect, test, vi } from "vitest"
import { api, internal } from "./_generated/api"
import schema from "./schema"
import { driveFolderUrl, parseDriveListing, readDriveVideos, videoMatchNumber } from "./lib/driveVideos"

const modules = import.meta.glob("./**/*.ts")
const videoUrl = "https://drive.google.com/file/d/match-video-1/view?usp=sharing&resourcekey=key"
afterEach(() => vi.unstubAllGlobals())

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

const folderUrl = "https://drive.google.com/drive/u/0/folders/root-folder"
function listing(entries: { id: string; name: string; folder?: boolean; video?: boolean }[]) {
  return `<div class="flip-entries">${entries.map(entry => `<div class="flip-entry" id="entry-${entry.id}"><a href="https://drive.google.com/${entry.folder ? `drive/folders/${entry.id}` : `file/d/${entry.id}/view?usp=drive_web&amp;resourcekey=key`}">${entry.video ? '<img alt="Video"/>' : ''}<div class="flip-entry-title">${entry.name}</div></a></div>`).join("")}</div>`
}

test("folder settings are admin-only, event scoped, and retain no video files", async () => {
  const { t, admin, eventId, otherEventId } = await setup()
  const scout = t.withIdentity({ tokenIdentifier: "video-scout", subject: "video-scout", issuer: "test" })
  await expect(scout.mutation(api.events.saveVideoFolder, { eventId, folderUrl, prefix: "stem gals" })).rejects.toThrow("Unauthorized")
  await admin.mutation(api.events.saveVideoFolder, { eventId, folderUrl, prefix: "stem gals" })
  expect(await t.query(api.events.videoSettings, { eventId })).toEqual({ folderUrl: "https://drive.google.com/drive/folders/root-folder", prefix: "stem gals" })
  expect((await t.query(api.events.videoSettings, { eventId: otherEventId }))?.folderUrl).toBeUndefined()
  const fetchMock = vi.fn(async () => new Response(listing([
    { id: "video-one", name: "stem gals qm1.mp4", video: true },
    { id: "wrong-event", name: "ntx qm1.mp4", video: true },
    { id: "not-scheduled", name: "stem gals qm2.mp4", video: true },
  ])))
  vi.stubGlobal("fetch", fetchMock)
  const videos = await scout.action(api.matchVideos.listFromDrive, { eventId })
  expect(videos).toEqual([{ matchNumber: 1, name: "stem gals qm1.mp4", videoUrl: "https://drive.google.com/file/d/video-one/view?usp=drive_web&resourcekey=key" }])
  expect(fetchMock.mock.calls).toHaveLength(1)
  const stored = await t.run(async ctx => ({ matches: await ctx.db.query("matches").take(10), files: await ctx.db.system.query("_storage").take(10) }))
  expect(stored.matches.every(match => match.videoUrl === undefined)).toBe(true)
  expect(stored.files).toEqual([])
  await expect(t.action(api.matchVideos.listFromDrive, { eventId })).rejects.toThrow("Not authenticated")
  await admin.mutation(api.events.saveVideoFolder, { eventId, folderUrl: "", prefix: "stem gals" })
  expect((await t.query(api.events.videoSettings, { eventId }))?.folderUrl).toBeUndefined()
})

test("reads videos through nested folders, ignores other events, and sees newly uploaded files on refresh", async () => {
  let added = false
  const fetchMock = vi.fn(async (url: URL) => {
    if (url.searchParams.get("id") === "root-folder") return new Response(listing([
      { id: "stem-folder", name: "stem gals match videos", folder: true },
      { id: "ntx-folder", name: "ntx match videos", folder: true },
    ]))
    if (url.searchParams.get("id") === "stem-folder") return new Response(listing([
      { id: "video-one", name: "stem gals qm1.mp4", video: true },
      ...(added ? [{ id: "video-two", name: "STEM GALS QM02.MP4", video: true }] : []),
      { id: "wrong-prefix", name: "ntx qm1.mp4", video: true },
      { id: "notes", name: "stem gals qm1.txt" },
    ]))
    throw new Error(`Unexpected folder ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  expect((await readDriveVideos(folderUrl, "stem gals", new Set([1, 2]))).map(video => video.matchNumber)).toEqual([1])
  added = true
  expect((await readDriveVideos(folderUrl, "stem gals", new Set([1, 2]))).map(video => video.matchNumber)).toEqual([1, 2])
  expect(fetchMock.mock.calls.every(([url]) => url.hostname === "drive.google.com" && url.pathname === "/embeddedfolderview")).toBe(true)
})

test("Drive parsing rejects sign-in pages, unsafe URLs, and confusing filenames", () => {
  expect(driveFolderUrl(`${folderUrl}?resourcekey=key&usp=sharing`)).toBe("https://drive.google.com/drive/folders/root-folder?resourcekey=key")
  expect(() => driveFolderUrl("https://drive.google.com.evil.example/drive/folders/root")).toThrow("Google Drive")
  expect(() => parseDriveListing('<html>Sign in</html>')).toThrow("unavailable")
  const unsafe = '<div class="flip-entries"><div class="flip-entry" id="bad"><a href="https://evil.example/file/d/id/view"><div class="flip-entry-title">stem gals qm1.mp4</div></a></div></div>'
  expect(parseDriveListing(unsafe)).toEqual([])
  expect(videoMatchNumber("STEM_GALS QM 01.mp4", "stem gals")).toBe(1)
  for (const name of ["ntx qm1.mp4", "stem gals qm0.mp4", "stem gals qm1 notes.mp4", "stem gals qm1.mp4.exe", "stem gals finals1.mp4"]) expect(videoMatchNumber(name, "stem gals")).toBeNull()
})
