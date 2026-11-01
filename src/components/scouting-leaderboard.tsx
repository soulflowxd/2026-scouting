import { useQuery } from "convex/react"
import { Trophy } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

export function ScoutingLeaderboard({ eventId }: { eventId: Id<"events"> }) {
  const rows = useQuery(api.scoutingProgress.leaderboard, { eventId })
  if (!rows || rows.every(row => row.match + row.pit === 0)) return null
  return <section aria-label="Scouting contributions" className="rounded-xl border bg-card p-4 sm:p-5">
    <h2 className="flex items-center gap-2 text-base font-semibold"><Trophy className="size-4 text-primary" aria-hidden="true" />Scouting contributions</h2>
    <p className="mt-1 text-xs text-muted-foreground">Submitted reports for this event. Device drafts and pending uploads do not count.</p>
    <ol className="mt-3 grid gap-1">
      {rows.slice(0, 8).map((row, index) => <li key={`${row.name}-${index}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm odd:bg-muted/30">
        <span className="w-6 shrink-0 text-center font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{row.name}{row.isYou ? " · You" : ""}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{row.match} match · {row.pit} pit</span>
      </li>)}
    </ol>
    {rows.length > 8 && rows.findIndex(row => row.isYou) >= 8 && <p className="mt-2 text-xs text-muted-foreground">Your position: {rows.findIndex(row => row.isYou) + 1} of {rows.length}</p>}
  </section>
}
