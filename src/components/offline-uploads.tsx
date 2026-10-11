import { useConvex } from "convex/react"
import { useEffect, useState } from "react"
import { listUploads, putUpload, type UploadJob } from "@/lib/scouting-outbox"
import { uploadScoutingReport } from "@/lib/upload-scouting-report"
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
        for (const job of pending) {
          if (!active || !convex.connectionState().isWebSocketConnected) break
          if (job.error && !job.retryable) continue
          try { await uploadScoutingReport(convex, owner!, job.id) }
          catch { /* The shared uploader retains the report and a visible retry error. */ }
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
