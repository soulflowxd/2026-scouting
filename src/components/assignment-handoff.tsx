import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"

export function AssignmentHandoff({ eventId, closed }: { eventId: Id<"events">; closed: boolean }) {
  const options = useQuery(api.scoutHandoffs.options, { eventId })
  const history = useQuery(api.scoutHandoffs.history, { eventId })
  const pending = useQuery(api.scoutHandoffs.mine, {})?.some(row => row.eventId === eventId) ?? false
  const request = useMutation(api.scoutHandoffs.request)
  const [substituteId, setSubstituteId] = useState("")
  const [start, setStart] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fromMatchNumber = options?.matches.includes(Number(start)) ? Number(start) : options?.fromMatchNumber
  const hasAssignments = !!options && (options.teamLabels.length > 0 || options.matchCount > 0 || options.driverStations.length > 0)
  return <div className="grid min-w-0 gap-3 border-t pt-3">
    {!!options && <details open={!hasAssignments}>
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">{hasAssignments ? "Need a break? Hand off assignments" : "Take over for another scout"}</summary>
      <form className="grid gap-3 pt-3" onSubmit={async event => {
        event.preventDefault()
        if (!substituteId) return
        setBusy(true); setError(null)
        try {
          await request({ eventId, substituteId: hasAssignments ? substituteId as Id<"members"> : options.selfId, ...(hasAssignments ? {} : { sourceId: substituteId as Id<"members"> }), fromMatchNumber: fromMatchNumber! })
          toast.success(hasAssignments ? "Handoff requested. Keep scouting until your substitute accepts and you confirm." : "Takeover requested. The assigned scout must confirm before you start scouting.")
          setSubstituteId("")
        } catch (cause) { setError(cause instanceof ConvexError ? String(cause.data) : "Could not request a handoff. Try again.") }
        finally { setBusy(false) }
      }}>
        <p className="text-sm text-muted-foreground">{hasAssignments ? `Transfer ${options.driverStations.length ? `your ${options.driverStations.join(", ")} station and its future teams` : "your regular teams"} and remaining match assignments after both scouts confirm. Earlier matches stay your responsibility.` : "Choose the assigned scout you are replacing. Your request confirms that you are ready; they confirm on their account to transfer future assignments. You do not need the assignment checkbox selected."} Device drafts do not transfer.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">{hasAssignments ? "Substitute scout" : "Scout to replace"}
            <select className="min-h-11 min-w-0 rounded-md border bg-background px-3" required value={substituteId} disabled={busy || closed || pending} onChange={event => setSubstituteId(event.target.value)}>
              <option value="">Choose an approved scout</option>
              {(hasAssignments ? options.scouts : options.owners).map(scout => <option key={scout._id} value={scout._id}>{scout.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">First match to transfer
            <select className="min-h-11 min-w-0 rounded-md border bg-background px-3" value={String(fromMatchNumber)} disabled={busy || closed || pending} onChange={event => setStart(event.target.value)}>
              {options.matches.length ? options.matches.map(number => <option key={number} value={number}>QM{number} onward</option>) : <option value={options.fromMatchNumber}>Remaining team work · No upcoming matches</option>}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Approved scouts can accept even if they were not included in automatic assignments. Overlapping match assignments must be resolved first.</p>
        {closed && <p className="text-sm text-muted-foreground">Scouting is closed for this event.</p>}
        {pending && <p role="status" className="text-sm text-muted-foreground">A handoff is pending. Finish or cancel it in the handoff card above before starting another.</p>}
        {!hasAssignments && !options.owners.length && <p className="text-sm text-muted-foreground">No scouts have assignments to transfer yet. Ask an admin to assign driver stations or generate team assignments.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={!substituteId || busy || closed || pending} className="min-h-11 justify-self-start">{busy ? "Requesting…" : hasAssignments ? "Request handoff" : "Request to take over"}</Button>
      </form>
    </details>}
    <details>
      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Handoff history{history ? ` (${history.length})` : ""}</summary>
      {!history ? <p className="py-2 text-sm text-muted-foreground">Loading history…</p> : history.length ? <ul className="grid divide-y">
        {history.map(row => <li key={row._id} className="grid gap-1 py-3 text-sm">
          <span className="font-medium">{row.fromName} → {row.toName} · From QM{row.fromMatchNumber}</span>
          <span className="text-muted-foreground">{row.matchSlots.length} match assignments{row.driverStations.length ? ` · ${row.driverStations.join(", ")}` : ""} · Teams {row.teamLabels.join(", ") || "station teams"} · {new Date(row.confirmedAt!).toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">Earlier matches remain with {row.fromName}; transferred matches belong to {row.toName}.</span>
        </li>)}
      </ul> : <p className="py-2 text-sm text-muted-foreground">No confirmed handoffs for this event.</p>}
    </details>
  </div>
}
