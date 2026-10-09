import { useConvex } from "convex/react"
import { ConvexError } from "convex/values"
import { useEffect, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { listUploads, putUpload, removeUpload, type UploadJob } from "@/lib/scouting-outbox"
import { Button } from "@/components/ui/button"

export function OfflineUploads({ owner }: { owner?: string }) {
  const convex = useConvex()
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    if (!owner) return
    let active = true
    let busy = false
    async function flush() {
      if (busy || !active) return
      busy = true
      try {
        const pending = await listUploads(owner!)
        if (active) setJobs(pending)
        for (let job of pending) {
          if (!active || !convex.connectionState().isWebSocketConnected) break
          if (job.error) continue
          try {
            if (job.kind === "pit") {
              while (job.photos.length) {
                if (!active) return
                const photo = job.photos[0]
                const url = await convex.mutation(api.pit.generateUploadUrl, {})
                if (!active) return
                const response = await fetch(url, { method: "POST", headers: { "Content-Type": photo.type }, body: photo })
                if (!response.ok) throw new Error("Photo upload unavailable")
                const { storageId } = await response.json() as { storageId: Id<"_storage"> }
                job = { ...job, photos: job.photos.slice(1), args: { ...job.args, photoIds: [...(job.args.photoIds ?? []), storageId] } }
                await putUpload(job)
              }
              if (!active) return
              await convex.mutation(api.pit.save, { ...job.args, clientSubmissionId: job.id })
            } else {
              await convex.mutation(api.matchScouting.saveReport, { ...job.args, clientSubmissionId: job.id })
            }
            await removeUpload(job.id)
          } catch (error) {
            if (error instanceof ConvexError) await putUpload({ ...job, error: String(error.data) })
            else break
          }
        }
        if (active) setJobs(await listUploads(owner!))
      } catch { if (active) setStorageError(true) }
      finally { busy = false }
    }
    const wake = () => {
      if (navigator.locks) void navigator.locks.request("scouting-outbox-upload", { ifAvailable: true }, lock => lock ? flush() : undefined)
      else void flush()
    }
    const interval = window.setInterval(wake, 5000)
    window.addEventListener("online", wake)
    window.addEventListener("scouting-outbox", wake)
    wake()
    return () => { active = false; clearInterval(interval); window.removeEventListener("online", wake); window.removeEventListener("scouting-outbox", wake) }
  }, [convex, owner])
  if (!owner || (!jobs.length && !storageError)) return null
  return <div role="status" className="border-b px-4 py-2 text-sm">
    {storageError ? "Device storage unavailable. Keep your scouting form open." : `${jobs.length} scouting report(s) saved on this device, awaiting upload.`}
    {jobs.filter(job => job.error).map(job => <div key={job.id} className="flex items-center gap-2">
      <span>Team {job.args.teamNumber}: {job.error}</span>
      <Button variant="outline" size="sm" onClick={() => void putUpload({ ...job, error: undefined })}>Retry upload</Button>
    </div>)}
  </div>
}
