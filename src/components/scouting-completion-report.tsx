import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { Copy } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"

const filters = [
  { value: "all", label: "All reports" },
  { value: "match", label: "Missing match" },
  { value: "pit", label: "Missing pit" },
] as const

export function ScoutingCompletionReport({ eventId }: { eventId: Id<"events"> }) {
  const [matchScope, setMatchScope] = useState("all")
  const [filter, setFilter] = useState<"all" | "match" | "pit">("all")
  const [busy, setBusy] = useState(false)
  const [copying, setCopying] = useState(false)
  const [showText, setShowText] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const data = useQuery(api.scoutAssignments.completionReport, {
    eventId,
    allMatches: matchScope === "all",
    matchNumber: matchScope === "all" || matchScope === "latest" ? undefined : Number(matchScope),
  })
  const finish = useMutation(api.scoutAssignments.openCompletionReview)
  const missing = data?.missing.filter(row => filter === "all" || row.kind === filter) ?? []
  const gaps = data?.coverageGaps.filter(row => filter === "all" || row.kind === filter) ?? []
  const describe = (row: { kind: "pit" | "match"; teamLabel: string; matchNumber?: number }) =>
    `${row.kind === "pit" ? "Pit report" : `QM${row.matchNumber} match report`} · Team ${row.teamLabel}`
  const scopeLabel = filter === "pit" ? "Pit reports" : matchScope === "all" ? "All finished matches" : data?.matchNumber !== null && data?.matchNumber !== undefined ? `QM${data.matchNumber}` : "No finished matches"
  const copyText = data ? [
    `${data.eventName} — Missing scouting reports`,
    `${filters.find(item => item.value === filter)!.label} · ${scopeLabel}`,
    "",
    ...missing.map(row => `${row.name} — ${describe(row)}`),
    ...(!missing.length ? ["No missing reports from assigned scouts."] : []),
    ...(gaps.length ? ["", "Unassigned coverage gaps (no responsible scout):", ...gaps.map(describe)] : []),
  ].join("\n") : ""

  return <section className="grid min-w-0 gap-4 rounded-xl border bg-card p-4" aria-label="Scouting completion report">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-prose"><h2 className="font-semibold">Missing scouting reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">Filter by report type and copy the full list. Finished matches update as results and reports arrive; late submissions disappear automatically.</p>
      </div>
      <Button size="lg" variant="outline" disabled={!data || copying || (!missing.length && !gaps.length)} onClick={async () => {
        setCopying(true)
        let clipboardTimeout: number | undefined
        try {
          await Promise.race([
            navigator.clipboard.writeText(copyText),
            new Promise<never>((_, reject) => {
              clipboardTimeout = window.setTimeout(() => reject(new Error("Clipboard timed out")), 3000)
            }),
          ])
          toast.success("Missing reports copied")
        } catch {
          setShowText(true)
          toast.error("Clipboard unavailable. Select and copy the text below.")
        } finally {
          window.clearTimeout(clipboardTimeout)
          setCopying(false)
        }
      }}><Copy aria-hidden="true" />{copying ? "Copying…" : "Copy list"}</Button>
    </div>
    {!data ? <p className="text-sm text-muted-foreground">Loading completion report…</p> : <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Report type">
        {filters.map(item => <Button key={item.value} size="lg" variant={filter === item.value ? "secondary" : "outline"} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
          {item.label}<span className="tabular-nums text-muted-foreground">{data.missing.filter(row => item.value === "all" || row.kind === item.value).length}</span>
        </Button>)}
      </div>
      {filter !== "pit" && !!data.matches.length && <div className="flex flex-wrap items-center gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">Match scope
          <select aria-label="Completion report match" className="min-h-11 max-w-full rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-ring" value={matchScope} onChange={event => setMatchScope(event.target.value)}>
            <option value="all">All finished matches</option>
            <option value="latest">Latest finished match{data.matchNumber !== null && matchScope === "latest" ? ` · QM${data.matchNumber}` : ""}</option>
            {data.matches.map(match => <option key={match.matchNumber} value={match.matchNumber}>QM{match.matchNumber}{match.started ? "" : " · Not finished"}</option>)}
          </select>
        </label>
        {data.matchNumber !== null && !data.reviewOpen && <Button size="lg" className="self-end" disabled={busy} onClick={async () => {
          setBusy(true)
          try { await finish({ eventId, matchNumber: data.matchNumber! }) }
          catch (error) { toast.error(error instanceof ConvexError ? String(error.data) : "Could not open the completion report") }
          finally { setBusy(false) }
        }}>Match finished</Button>}
      </div>}
      {!data.reviewOpen && filter !== "pit" && <p className="text-xs text-muted-foreground">Select a match and mark it finished if results or submissions are not available yet. Unplayed matches are excluded.</p>}
      <p className="text-sm text-muted-foreground" aria-live="polite">{missing.length} missing {filter === "all" ? "" : `${filter} `}report{missing.length === 1 ? "" : "s"} from assigned scouts{gaps.length > 0 ? ` · ${gaps.length} unassigned coverage gap${gaps.length === 1 ? "" : "s"}` : ""}</p>
      {missing.length ? <ul className="grid divide-y">
        {missing.map(row => <li key={`${row.kind}-${row.matchNumber ?? "pit"}-${row.teamNumber}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <span className="font-medium break-words">{row.name}</span>
          <span className="text-muted-foreground">{describe(row)}</span>
        </li>)}
      </ul> : <p className="text-sm">No missing {filter === "all" ? "reports" : `${filter} reports`} from assigned scouts.</p>}
      {gaps.length > 0 && <details className="text-sm">
        <summary className="min-h-11 cursor-pointer content-center text-amber-700 dark:text-amber-300">Unassigned coverage gaps ({gaps.length})</summary>
        <p className="mb-2 text-xs text-muted-foreground">No responsible scout is assigned. These are included separately in the copied list.</p>
        <ul className="grid gap-1 text-muted-foreground">{gaps.map(row => <li key={`${row.kind}-${row.matchNumber ?? "pit"}-${row.teamNumber}`}>{describe(row)}</li>)}</ul>
      </details>}
      <details open={showText} onToggle={event => setShowText(event.currentTarget.open)} className="min-w-0 text-sm">
        <summary className="min-h-11 cursor-pointer content-center">Copy/paste text</summary>
        <div className="grid gap-2 pt-2">
          <label htmlFor="missing-reports-text" className="text-xs text-muted-foreground">Full list for the current filters</label>
          <textarea id="missing-reports-text" ref={textRef} readOnly value={copyText} rows={8} className="w-full rounded-lg border bg-background p-3 text-sm focus-visible:outline-ring" />
          <Button size="lg" variant="outline" className="justify-self-start" onClick={() => { textRef.current?.focus(); textRef.current?.select() }}>Select all text</Button>
        </div>
      </details>
    </>}
  </section>
}
