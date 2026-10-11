// @vitest-environment node
import "fake-indexeddb/auto"
import { beforeAll, afterEach, expect, test, vi } from "vitest"
import type { ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"
import { getFunctionName } from "convex/server"
import type { Id } from "../../convex/_generated/dataModel"
import { listUploads, queueReport, removeUpload } from "./scouting-outbox"
import { uploadScoutingReport } from "./upload-scouting-report"

beforeAll(() => vi.stubGlobal("window", new EventTarget()))
afterEach(() => vi.unstubAllGlobals())
const args = { eventId: "event" as Id<"events">, teamNumber: 1,
  canScoreFuelHub: true, canIntakeDepot: true, canIntakeFloor: true, canPreload: true, preloadCount: 6,
  canClimbLevel1: false, canClimbLevel2: true, canClimbLevel3: false, canAutoClimbLevel1: false,
  canCrossBump: true, canCrossTrench: true, drivetrain: "Tank", notes: "Retain" }

test("pit uploads checkpoint photos, expose failures, retry without reuploading saved photos, then await server acknowledgement", async () => {
  vi.stubGlobal("window", new EventTarget())
  const mutation = vi.fn(async (reference, payload) => getFunctionName(reference) === "pit:generateUploadUrl" ? "https://upload.test" : payload.clientSubmissionId)
  const client = { connectionState: () => ({ isWebSocketConnected: true }), query: async () => ({ tokenIdentifier: "pit-upload-test" }), mutation } as unknown as ConvexReactClient
  const upload = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ storageId: "photo1" }))).mockResolvedValueOnce(new Response("offline", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ storageId: "photo2" })))
  vi.stubGlobal("fetch", upload)
  const photo = new Blob(["photo"], { type: "image/png" }) as File
  const id = await queueReport("pit-upload-test", { kind: "pit", args, photos: [photo, photo] })
  await expect(uploadScoutingReport(client, "pit-upload-test", id)).rejects.toThrow("503")
  const [saved] = await listUploads("pit-upload-test")
  expect(saved.photos).toHaveLength(1)
  expect(saved).toMatchObject({ error: expect.stringContaining("503"), retryable: true, args: { photoIds: ["photo1"] } })
  expect(mutation.mock.calls.filter(([reference]) => getFunctionName(reference) === "pit:save")).toHaveLength(0)
  await Promise.all([uploadScoutingReport(client, "pit-upload-test", id), uploadScoutingReport(client, "pit-upload-test", id)])
  expect(upload).toHaveBeenCalledTimes(3)
  const saves = mutation.mock.calls.filter(([reference]) => getFunctionName(reference) === "pit:save")
  expect(saves).toHaveLength(1)
  expect(saves[0][1]).toMatchObject({ photoIds: ["photo1", "photo2"], clientSubmissionId: id })
  expect(await listUploads("pit-upload-test")).toEqual([])
})

test("authorization errors remain visible and saved; another scout cannot upload the job", async () => {
  vi.stubGlobal("window", new EventTarget())
  const mutation = vi.fn().mockRejectedValue(new ConvexError("Scouting is closed"))
  const client = { connectionState: () => ({ isWebSocketConnected: true }), query: async () => ({ tokenIdentifier: "pit-locked-test" }), mutation } as unknown as ConvexReactClient
  const id = await queueReport("pit-locked-test", { kind: "pit", args, photos: [] })
  await uploadScoutingReport(client, "different-scout", id)
  expect(mutation).not.toHaveBeenCalled()
  await expect(uploadScoutingReport(client, "pit-locked-test", id)).rejects.toThrow("Scouting is closed")
  expect((await listUploads("pit-locked-test"))[0]).toMatchObject({ id, error: "Scouting is closed", retryable: false })
  await removeUpload(id)
})
