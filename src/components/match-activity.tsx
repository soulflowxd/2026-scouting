import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { matchActions, matchPhase, MATCH_END_MS, AUTO_END_MS, TELEOP_START_MS, type MatchActivitySegment } from "@/lib/match-activity"

export function MatchActivity({ startedAt, endedAt, timeline, onStart, onAction, onStop }: {
  startedAt: number; endedAt: number; timeline: MatchActivitySegment[]
  onStart: () => void; onAction: (action: string) => void; onStop: () => void
}) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!startedAt || endedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [startedAt, endedAt])
  const elapsed = startedAt ? Math.max(0, Math.floor(((endedAt || now) - startedAt) / 1000)) : 0
  const elapsedMs = elapsed * 1000
  const inGap = elapsedMs >= AUTO_END_MS && elapsedMs < TELEOP_START_MS
  const last = timeline.at(-1)
  const active = startedAt && !endedAt && !inGap && elapsedMs < MATCH_END_MS &&
    !(elapsedMs >= TELEOP_START_MS && last && last.startMs < AUTO_END_MS) ? last?.action : null
  return <section className="grid gap-3 rounded-xl border bg-card p-4 sm:p-5" aria-label="Live robot activity tracker">
    <div className="flex items-center justify-between gap-3">
      <div><h3 className="text-base font-semibold">Robot activity</h3><p className="mt-1 text-xs text-muted-foreground">Tap what the robot is doing. Each change records a timed interval.</p></div>
      <span className="font-semibold tabular-nums" aria-label={`${elapsed} seconds elapsed`}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
    </div>
    {!!startedAt && <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">{matchPhase(elapsedMs)}{inGap ? " · Teleop starts at 0:23" : ""}</p>}
    {!startedAt ? <Button type="button" size="lg" onClick={onStart}>Start match run</Button> : !endedAt ? <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {matchActions.map(action => <Button key={action} type="button" disabled={inGap || elapsedMs >= MATCH_END_MS} variant={active === action ? "default" : "outline"} aria-pressed={active === action} className="min-h-14" onClick={() => onAction(action)}>{action}</Button>)}
      </div>
      <Button type="button" variant="secondary" onClick={onStop}>End match run</Button>
    </> : <p role="status" className="text-sm font-medium">Run captured · {timeline.length} activity {timeline.length === 1 ? "interval" : "intervals"}</p>}
    <p className="text-xs text-muted-foreground">Auto: 0:00–0:20 · Gap: 0:20–0:23 · Teleop: 0:23–2:43. The timeline is saved with your report.</p>
  </section>
}
