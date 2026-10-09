// @vitest-environment node
import "fake-indexeddb/auto"
import { beforeAll, expect, test, vi } from "vitest"
import { deleteDraft, listUploads, putUpload, queueReport, readDraft, removeUpload, writeDraft } from "./scouting-outbox"
import type { Id } from "../../convex/_generated/dataModel"

beforeAll(() => vi.stubGlobal("window", new EventTarget()))
const args = { eventId: "test" as Id<"events">, matchNumber: 1, teamNumber: 1,
  autoFuel: 0, teleopFuel: 0, autoClimb: "none" as const, autoNotes: "auto",
  teleopNotes: "teleop", endgameClimb: "none" as const, endgameNotes: "",
  driverRating: 5, defenseRating: 5, tags: [] }

test("queued submissions persist, isolate owners, and remain until acknowledged", async () => {
  await queueReport("alice", { kind: "match", args, photos: [] })
  let jobs = await listUploads("alice")
  expect(jobs).toHaveLength(1)
  expect(await listUploads("bob")).toEqual([])
  expect(jobs[0].args).toEqual(args)
  const id = jobs[0].id
  await putUpload({ ...jobs[0], error: "Scouting closed" })
  jobs = await listUploads("alice")
  expect(jobs[0].error).toBe("Scouting closed")
  await putUpload({ ...jobs[0], error: undefined })
  expect((await listUploads("alice"))[0].id).toBe(id)
  expect(await listUploads("alice")).toHaveLength(1)
  await removeUpload(id)
  expect(await listUploads("alice")).toEqual([])
})

test("device drafts preserve photo blobs and do not enter the upload queue", async () => {
  const photo = new Blob(["robot photo"], { type: "image/png" })
  await writeDraft("alice", "pit:1", { notes: "intake", photos: [photo] })
  expect(await readDraft("bob", "pit:1")).toBeUndefined()
  const draft = await readDraft<{ notes: string; photos: Blob[] }>("alice", "pit:1")
  expect(draft?.notes).toBe("intake")
  expect(await draft!.photos[0].text()).toBe("robot photo")
  expect(await listUploads("alice")).toEqual([])
  await deleteDraft("alice", "pit:1")
  expect(await readDraft("alice", "pit:1")).toBeUndefined()
})

test("pit submissions keep photos and resume from a persisted photo checkpoint", async () => {
  const photo = new Blob(["photo"], { type: "image/png" }) as File
  const pitArgs = { eventId: args.eventId, teamNumber: 1,
    canScoreFuelHub: true, canIntakeDepot: true, canIntakeFloor: true, canPreload: true, preloadCount: 6,
    canClimbLevel1: false, canClimbLevel2: true, canClimbLevel3: false, canAutoClimbLevel1: false,
    canCrossBump: true, canCrossTrench: true, drivetrain: "Tank", notes: "Offline", photoIds: [] }
  await queueReport("photos", { kind: "pit", args: pitArgs, photos: [photo, photo] })
  const [job] = await listUploads("photos")
  expect(await job.photos[0].text()).toBe("photo")
  if (job.kind !== "pit") throw new Error("Expected pit report")
  await putUpload({ ...job, photos: job.photos.slice(1), args: { ...job.args, photoIds: ["uploaded" as Id<"_storage">] } })
  const [resumed] = await listUploads("photos")
  expect(resumed.photos).toHaveLength(1)
  expect(resumed.kind === "pit" && resumed.args.photoIds).toEqual(["uploaded"])
  expect(resumed.id).toBe(job.id)
  await removeUpload(job.id)
})
