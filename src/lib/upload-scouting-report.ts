import type { ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { listUploads, putUpload, removeUpload, type UploadJob } from "./scouting-outbox"

const uploads = new Map<string, Promise<void>>()
// Foreground submissions and the outbox worker share a lock and photo checkpoints.
export async function uploadScoutingReport(convex: ConvexReactClient, owner: string, id: string) {
  const run = async () => {
    const current = uploads.get(id)
    if (current) return current
    const task = send()
    uploads.set(id, task)
    try { await task } finally { uploads.delete(id) }
  }
  const send = async () => {
    let job = (await listUploads(owner)).find(row => row.id === id)
    if (!job) return // Another tab already received acknowledgement.
    if (!convex.connectionState().isWebSocketConnected) throw new Error("You are offline. The report is saved on this device and will retry when connected.")
    const assertOwner = async () => {
      const me = await convex.query(api.members.me, {})
      if (me?.tokenIdentifier !== owner) throw new ConvexError("Sign back in as the scout who saved this report to upload it.")
    }
    try {
      if (job.kind === "pit") {
        while (job.photos.length) {
          const photo = job.photos[0]
          await assertOwner()
          const url = await convex.mutation(api.pit.generateUploadUrl, {})
          const response = await fetch(url, { method: "POST", headers: { "Content-Type": photo.type }, body: photo })
          if (!response.ok) throw new Error(`Robot photo upload failed (${response.status}). Your report is saved; retry the upload.`)
          const { storageId } = await response.json() as { storageId?: Id<"_storage"> }
          if (!storageId) throw new Error("Robot photo upload did not return a file. Your report is saved; retry the upload.")
          job = { ...job, photos: job.photos.slice(1), args: { ...job.args, photoIds: [...(job.args.photoIds ?? []), storageId] } }
          await putUpload(job)
        }
        await assertOwner()
        await convex.mutation(api.pit.save, { ...job.args, clientSubmissionId: job.id })
      } else {
        await assertOwner()
        await convex.mutation(api.matchScouting.saveReport, { ...job.args, clientSubmissionId: job.id })
      }
      await removeUpload(job.id)
    } catch (cause) {
      const error = cause instanceof ConvexError ? String(cause.data) : cause instanceof Error ? cause.message : "Upload failed. Retry your saved report."
      await putUpload({ ...job, error, retryable: !(cause instanceof ConvexError) } as UploadJob)
      throw new Error(error, { cause })
    }
  }
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`scouting-report:${id}`, run)
  return run()
}
