import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const message = (error: unknown) => error instanceof ConvexError ? String(error.data) : "Could not update the leave request. Try again."

export function ScoutLeaveRequest({ eventId, closed, hasAssignments }: { eventId: Id<"events">; closed: boolean; hasAssignments: boolean }) {
  const rows = useQuery(api.scoutLeave.mine, { eventId })
  const request = useMutation(api.scoutLeave.request)
  const cancel = useMutation(api.scoutLeave.cancel)
  const [reason, setReason] = useState("Pit shift")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = rows?.[0]
  const pending = rows?.find(row => row.status === "pending")
  return <details className="border-t pt-3">
    <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Request to leave for a pit shift{pending ? " · Awaiting approval" : ""}</summary>
    <div className="grid gap-3 pt-3">
      <p className="text-sm text-muted-foreground">Keep scouting until an admin approves your request. Future assignments will be left unassigned for an admin to fill. Earlier matches remain your responsibility.</p>
      {pending ? <>
        <p role="status" className="text-sm">Awaiting admin approval · {pending.reason}</p>
        <Button className="min-h-11 justify-self-start" variant="outline" disabled={busy} onClick={async () => {
          setBusy(true); setError(null)
          try { await cancel({ requestId: pending._id }) } catch (cause) { setError(message(cause)) } finally { setBusy(false) }
        }}>Cancel leave request</Button>
      </> : <form className="grid gap-3" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError(null)
        try { await request({ eventId, reason }) } catch (cause) { setError(message(cause)) } finally { setBusy(false) }
      }}>
        {latest?.status === "approved" && <p role="status" className="text-sm">Leave approved by {latest.reviewedBy}. Your assignments from QM{latest.fromMatchNumber} are now unassigned. You can go to your pit shift.</p>}
        {latest?.status === "rejected" && <p role="status" className="text-sm">Request declined by {latest.reviewedBy}. Keep your scouting assignments.</p>}
        {!hasAssignments && <p className="text-sm text-muted-foreground">You have no current scouting assignments to leave.</p>}
        <label className="grid gap-1 text-sm">Reason<Input value={reason} onChange={event => setReason(event.target.value)} required maxLength={300} disabled={busy || closed || !hasAssignments} /></label>
        <Button className="min-h-11 justify-self-start" disabled={!rows || busy || closed || !hasAssignments || !reason.trim()}>{busy ? "Requesting…" : "Request admin approval"}</Button>
      </form>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </details>
}

export function ScoutLeaveAdmin({ eventId }: { eventId: Id<"events"> }) {
  const rows = useQuery(api.scoutLeave.pending, { eventId })
  const review = useMutation(api.scoutLeave.review)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function respond(requestId: Id<"scoutLeaveRequests">, approve: boolean) {
    setBusy(true); setError(null)
    try { await review({ requestId, approve }) }
    catch (cause) { setError(message(cause)) } finally { setBusy(false) }
  }
  return <section className="grid gap-3 rounded-xl border bg-card p-4" aria-label="Scout leave requests">
    <h2 className="font-semibold">Scout leave requests{rows ? ` (${rows.length})` : ""}</h2>
    <p className="text-sm text-muted-foreground">Approval releases the scout’s future assignments and leaves them unassigned. Assign a replacement separately; earlier matches remain the original scout’s responsibility.</p>
    {!rows ? <p className="text-sm text-muted-foreground">Loading requests…</p> : !rows.length ? <p className="text-sm text-muted-foreground">No scouts are waiting for leave approval.</p> : rows.map(row => <div key={row._id} className="grid gap-3 border-t pt-3">
      <p className="break-words text-sm"><strong>{row.scoutName}</strong> · {row.reason}</p>
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={busy} onClick={() => void respond(row._id, true)}>Approve leave</Button><Button className="min-h-11" variant="outline" disabled={busy} onClick={() => void respond(row._id, false)}>Decline request</Button></div>
    </div>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
