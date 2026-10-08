/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import { api } from "./_generated/api"
import schema from "./schema"
const modules = import.meta.glob("./**/*.ts")

test("robot photos require approved access and use the selected event year", async () => {
  const t = convexTest(schema, modules)
  const eventId = await t.run(async ctx => {
    const id = await ctx.db.insert("events", { eventKey: "2026test", importStatus: "ready", createdByToken: "admin" })
    await ctx.db.insert("teams", { eventId: id, teamNumber: 9128, nickname: "Test", tbaTeamKey: "frc9128" })
    await ctx.db.insert("members", { tokenIdentifier: "scout", role: "scout", approvalStatus: "approved", lastSeenAt: 1 })
    return id
  })
  const args = { eventId, teamNumber: 9128 }
  await expect(t.action(api.imports.robotPhotos, args)).rejects.toThrow("Not authenticated")
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    { type: "imgur", foreign_key: "photo", direct_url: "https://i.imgur.com/photo.jpeg" },
    { type: "imgur", foreign_key: "unsafe", direct_url: "http://i.imgur.com/no.jpeg" },
    { type: "youtube", direct_url: "https://img.youtube.com/video.jpg" },
  ])))
  vi.stubGlobal("fetch", fetchMock)
  vi.stubEnv("TBA_API_KEY", "test-key")
  try {
    const scout = t.withIdentity({ tokenIdentifier: "scout" })
    expect(await scout.action(api.imports.robotPhotos, args)).toEqual({ photos: [{ id: "tba:photo", url: "https://i.imgur.com/photo.jpeg" }] })
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.thebluealliance.com/api/v3/team/frc9128/media/2026")
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs() }
})
