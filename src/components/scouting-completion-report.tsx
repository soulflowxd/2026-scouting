import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"

export function ScoutingCompletionReport({ eventId }: { eventId: Id<"events"> }) {
  const [matchNumber, setMatchNumber] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)
  const data = useQuery(api.scoutAssignments.completionReport, { eventId, matchNumber })
  const finish = useMutation(api.scoutAssignments.openCompletionReview)
  return <section className="grid gap-3 rounded-xl border bg-card p-4" aria-label="Scouting completion report">
    <div><h2 className="font-semibold">Missing scouting reports</h2>
      <p className="text-xs text-muted-foreground">Updates after results arrive or the first match report is submitted. Pit responsibility uses regular team assignments. Late submissions disappear from this list.</p>
    </div>
    {!data ? <p className="text-sm text-muted-foreground">Loading completion report…</p> : <>
      {!!data.matches.length && <div className="flex flex-wrap items-center gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">After match
          <select aria-label="Completion report match" className="min-h-11 rounded-md border bg-background px-3 text-sm text-foreground" value={matchNumber ?? "latest"} onChange={event => setMatchNumber(event.target.value === "latest" ? undefined : Number(event.target.value))}>
            <option value="latest">Latest{data.matchNumber !== null && matchNumber === undefined ? ` · QM${data.matchNumber}` : ""}</option>
            {data.matches.map(match => <option key={match.matchNumber} value={match.matchNumber}>QM{match.matchNumber}{match.started ? "" : " · Not finished"}</option>)}
          </select>
        </label>
        {data.matchNumber !== null && !data.reviewOpen && <Button className="self-end" disabled={busy} onClick={async () => {
          setBusy(true)
          try { await finish({ eventId, matchNumber: data.matchNumber! }) }
          catch (error) { toast.error(error instanceof ConvexError ? String(error.data) : "Could not open the completion report") }
          finally { setBusy(false) }
        }}>Match finished</Button>}
      </div>}
      {!data.reviewOpen && <p className="text-xs text-muted-foreground">Select a match and mark it finished if results or submissions are not available yet. Pit status is shown below.</p>}
      {data.missing.length ? <ul className="grid gap-2">
        {data.missing.map(row => <li key={`${row.kind}-${row.teamNumber}`} className="grid gap-1 rounded-lg border px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <span className="font-medium break-words">{row.name}</span>
          <span className="text-muted-foreground">{row.kind === "pit" ? "Pit report" : `QM${row.matchNumber} match report`} · Team {row.teamLabel}</span>
        </li>)}
      </ul> : <p className="text-sm">No missing reports from assigned scouts.</p>}
      {(data.unassignedPits > 0 || data.unassignedMatchTeams > 0) && <p className="text-xs text-amber-600 dark:text-amber-300">No responsible scout assigned: {data.unassignedPits} pit teams{data.reviewOpen ? ` · ${data.unassignedMatchTeams} robots in QM${data.matchNumber}` : ""}. These are coverage gaps, not missing submissions by a named scout.</p>}
    </>}
  </section>
}
