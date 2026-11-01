import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
import { ArrowLeft, RotateCcw, Square, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { matchActions, matchShift, MATCH_END_MS, AUTO_END_MS, TELEOP_START_MS, TRANSITION_END_MS, ENDGAME_START_MS, type AllianceColor, type MatchActivitySegment } from "@/lib/match-activity"

const segmentColors = {
  Scoring: "#34d399", Passing: "#22d3ee", Climbing: "#a78bfa", Idle: "#94a3b8",
  Defending: "#fb7185", Traveling: "#60a5fa", Intaking: "#fbbf24", Stealing: "#fb923c",
} as const
function timestamp(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
type Props = {
  matchNumber: number; teamNumber: number; alliance: AllianceColor
  startedAt: number; endedAt: number; timeline: MatchActivitySegment[]
  firstInactiveHub: AllianceColor | null
  brokeDown: boolean; breakdownNotes: string
  onBrokeDownChange: (value: boolean) => void; onBreakdownNotesChange: (value: string) => void
  driverRating: number; defenseRating: number
  onDriverRatingChange: (value: number) => void; onDefenseRatingChange: (value: number) => void
  blockedMessage?: string; saving: boolean
  navigationBlocked: boolean
  onStay: () => void; onSaveAndLeave: () => void; onDiscardAndLeave: () => void
  onStart: () => void; onHoldStart: (action: string) => void; onHoldEnd: () => void
  onStop: () => void; onRestart: () => void
  onFirstInactiveHubChange: (hub: AllianceColor | null) => void
  onSubmit: () => void; onExit: () => void
}

export function MatchActivity({ matchNumber, teamNumber, alliance, startedAt, endedAt, timeline, firstInactiveHub, brokeDown, breakdownNotes, onBrokeDownChange, onBreakdownNotesChange, driverRating, defenseRating, onDriverRatingChange, onDefenseRatingChange, blockedMessage, saving, navigationBlocked, onStay, onSaveAndLeave, onDiscardAndLeave, onStart, onHoldStart, onHoldEnd, onStop, onRestart, onFirstInactiveHubChange, onSubmit, onExit }: Props) {
  const [now, setNow] = useState(0)
  const [heldAction, setHeldAction] = useState<string | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const heldRef = useRef<string | null>(null)
  const pointerRef = useRef<number | null>(null)
  const idleDwellRef = useRef<number | null>(null)
  const exitRef = useRef<HTMLButtonElement>(null)

  useEffect(() => () => {
    if (idleDwellRef.current !== null) window.clearTimeout(idleDwellRef.current)
  }, [])

  useEffect(() => {
    const app = document.getElementById("root")
    const wasInert = app?.inert ?? false
    const oldOverflow = document.body.style.overflow
    if (app) app.inert = true
    document.body.style.overflow = "hidden"
    exitRef.current?.focus()
    return () => { if (app) app.inert = wasInert; document.body.style.overflow = oldOverflow }
  }, [])
  useEffect(() => {
    if (!startedAt || endedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [startedAt, endedAt])

  const elapsedMs = startedAt ? Math.max(0, (endedAt || now) - startedAt) : 0
  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const shift = matchShift(elapsedMs, firstInactiveHub)
  const secondsLeft = Math.max(0, Math.ceil((shift.endsAtMs - elapsedMs) / 1000))
  const inGap = elapsedMs >= AUTO_END_MS && elapsedMs < TELEOP_START_MS
  const tileDisabled = saving || !!blockedMessage || inGap || elapsedMs >= MATCH_END_MS
  const needsHubChoice = shift.label.startsWith("Shift ") && firstInactiveHub === null
  const hubStatus = elapsedMs >= MATCH_END_MS ? "Match ended"
    : needsHubChoice ? "Choose whether your team won or lost auto"
    : shift.inactiveHub === alliance ? "YOUR HUB IS OFF"
    : "YOUR HUB IS ON"
  const visibleTimeline = timeline.map((segment, index) => index === timeline.length - 1 && heldAction === segment.action && segment.endMs === segment.startMs
    ? { ...segment, endMs: Math.min(elapsedMs, MATCH_END_MS) } : segment)

  const stopHold = useCallback(() => {
    if (heldRef.current === null) return
    heldRef.current = null
    setHeldAction(null)
    onHoldEnd()
  }, [onHoldEnd])
  function startHold(action: string) {
    if (tileDisabled || heldRef.current !== null) return
    heldRef.current = action
    setHeldAction(action)
    onHoldStart(action)
  }
  function switchHold(action: string) {
    if (tileDisabled || heldRef.current === action) return
    stopHold()
    startHold(action)
  }
  function actionAt(x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-match-action]")
    return element?.dataset.matchAction ?? null
  }
  function clearIdleDwell() {
    if (idleDwellRef.current !== null) window.clearTimeout(idleDwellRef.current)
    idleDwellRef.current = null
  }
  function moveHold(action: string | null) {
    if (action !== "Idle") clearIdleDwell()
    if (!action || action === heldRef.current) return
    if (action === "Idle") {
      if (idleDwellRef.current !== null) return
      idleDwellRef.current = window.setTimeout(() => {
        idleDwellRef.current = null
        if (pointerRef.current !== null) switchHold("Idle")
      }, 180)
      return
    }
    switchHold(action)
  }
  useEffect(() => {
    if (inGap || elapsedMs >= MATCH_END_MS || endedAt) {
      if (idleDwellRef.current !== null) window.clearTimeout(idleDwellRef.current)
      idleDwellRef.current = null
      if (heldRef.current !== null) stopHold()
    }
  }, [inGap, elapsedMs, endedAt, stopHold])

  return createPortal(<div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-[#101116] text-white" style={{ backgroundImage: "radial-gradient(#ffffff08 0.7px, transparent 0.7px)", backgroundSize: "5px 5px" }} role="dialog" aria-modal="true" aria-label={`QM${matchNumber} team ${teamNumber} scouting`}>
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:max-w-xl sm:px-6">
      <header className="flex min-h-11 items-center justify-between gap-3">
        <button ref={exitRef} type="button" onClick={() => { flushSync(stopHold); onExit() }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><ArrowLeft className="size-5" aria-hidden="true" /> Save & exit</button>
        <span className="text-sm font-semibold tabular-nums text-slate-300">QM{matchNumber} <span className="text-slate-500">/</span> Team {teamNumber}</span>
      </header>
      {navigationBlocked && <div role="alert" className="grid gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm"><p>Save this draft before leaving?</p><div className="flex flex-wrap gap-2"><button type="button" onClick={onStay} className="min-h-11 rounded-lg bg-white px-3 font-semibold text-[#101116]">Keep scouting</button><button type="button" onClick={onSaveAndLeave} className="min-h-11 rounded-lg border border-white/30 px-3">Save and leave</button><button type="button" onClick={onDiscardAndLeave} className="min-h-11 rounded-lg border border-white/30 px-3">Discard and leave</button></div></div>}
      {!startedAt ? <main className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
        <div className="grid gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">Match scouting</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Ready for QM{matchNumber}?</h1>
          <p className={cn("text-base font-bold uppercase tracking-wide", alliance === "red" ? "text-rose-300" : "text-blue-300")}>Team {teamNumber} · {alliance} alliance</p>
          <p className="mx-auto max-w-sm text-base leading-relaxed text-slate-300">Start the clock when auto begins, then hold an activity while the robot does it.</p>
        </div>
        {blockedMessage ? <p role="status" className="max-w-sm rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{blockedMessage}</p> : <button type="button" disabled={saving} onClick={onStart} className="min-h-16 w-full max-w-xs rounded-2xl bg-rose-500 px-6 text-lg font-bold text-white shadow-lg shadow-rose-950/40 transition-transform active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-50">Start match</button>}
      </main> : <main className="flex flex-col gap-2 pb-3 pt-1 sm:gap-3">
        <div className="grid justify-items-center gap-1 text-center">
          <p className={cn("text-[11px] font-bold uppercase tracking-[0.12em]", alliance === "red" ? "text-rose-300" : "text-blue-300")}>Team {teamNumber} · {alliance} alliance</p>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">{shift.label}</span>
          <p className="text-[clamp(3.5rem,16vw,4.5rem)] font-bold leading-none tracking-tight tabular-nums" aria-label={`${elapsedSeconds} seconds elapsed`}>{timestamp(elapsedMs)}</p>
          <p className="text-xs font-medium tabular-nums text-slate-400">{secondsLeft}s left in {shift.label.toLowerCase()}</p>
          <p role="status" className={cn("rounded-full border px-3 py-0.5 text-xs font-bold", needsHubChoice || elapsedMs >= MATCH_END_MS ? "border-amber-400/30 bg-amber-400/10 text-amber-100" : shift.inactiveHub === alliance ? "border-rose-400/40 bg-rose-500/15 text-rose-200" : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200")}>{hubStatus}</p>
          <p className="min-h-5 text-xs font-semibold" style={{ color: heldAction ? segmentColors[heldAction as keyof typeof segmentColors] : "#94a3b8" }}>{heldAction ? `● ${heldAction}` : "Hold an activity to record"}</p>
        </div>
        <div className="grid gap-1" aria-label="Recorded match activity timeline">
            <div className="flex items-baseline justify-between text-xs"><span><strong className="text-base text-white">{timeline.length}</strong> <span className="text-slate-400">segments</span></span><span className="text-slate-400 tabular-nums">{Math.min(100, Math.round(elapsedMs / MATCH_END_MS * 100))}%</span></div>
            <div className="relative h-4 overflow-hidden rounded-sm border border-white/15 bg-slate-800" role="img" aria-label={`${timeline.length} activity segments over a 2 minute 50 second match`}>
              {visibleTimeline.map((segment, index) => <span key={`${segment.startMs}-${index}`} className="absolute inset-y-0" style={{ left: `${segment.startMs / MATCH_END_MS * 100}%`, width: `${Math.max(0.8, (segment.endMs - segment.startMs) / MATCH_END_MS * 100)}%`, backgroundColor: segmentColors[segment.action as keyof typeof segmentColors] ?? "#94a3b8" }} />)}
              <span className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${Math.min(100, elapsedMs / MATCH_END_MS * 100)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] tabular-nums text-slate-500"><span>0:00</span><span>0:45</span><span>1:30</span><span>2:50</span></div>
            {!!timeline.length && <div className="flex gap-1 overflow-x-auto py-1" aria-label="Activity segments">{timeline.slice(-8).map((segment, index) => <span key={`${segment.startMs}-${index}`} className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-slate-300"><span style={{ color: segmentColors[segment.action as keyof typeof segmentColors] ?? "#94a3b8" }}>●</span> {segment.action} {timestamp(segment.startMs)}–{timestamp(segment.endMs)}</span>)}</div>}
        </div>
        {!endedAt ? <>
          <button type="button" onClick={() => { flushSync(stopHold); onStop() }} disabled={saving} className="mx-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-rose-500 px-6 text-sm font-bold text-white transition-transform active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-50"><Square className="size-3 fill-current" aria-hidden="true" /> End match</button>
          {elapsedMs >= TRANSITION_END_MS && elapsedMs < ENDGAME_START_MS && <div className="grid gap-1 rounded-xl border border-white/10 bg-white/[.04] p-2">
            <p className="text-xs font-medium text-slate-200">Did your team win auto?</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Your team's auto result">
              {(["won", "lost"] as const).map(result => { const hub = result === "won" ? alliance : alliance === "red" ? "blue" : "red"; return <button key={result} type="button" aria-pressed={firstInactiveHub === hub} disabled={saving} onClick={() => onFirstInactiveHubChange(firstInactiveHub === hub ? null : hub)} className={cn("min-h-11 rounded-lg border px-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50", firstInactiveHub === hub ? "border-amber-300 bg-amber-400 text-slate-950" : "border-white/20 bg-white/5 text-slate-200")}>Your team {result} auto</button> })}
            </div>
          </div>}
          <svg viewBox="0 0 320 320" className="mx-auto aspect-square w-full max-w-[22rem] touch-none select-none" role="group" aria-label="Robot activity dial" onPointerDown={event => { if (tileDisabled) return; const action = actionAt(event.clientX, event.clientY); if (!action) return; event.preventDefault(); pointerRef.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); switchHold(action) }} onPointerMove={event => { if (pointerRef.current !== event.pointerId) return; moveHold(actionAt(event.clientX, event.clientY)) }} onPointerUp={event => { if (pointerRef.current !== event.pointerId) return; pointerRef.current = null; clearIdleDwell(); stopHold() }} onPointerCancel={() => { pointerRef.current = null; clearIdleDwell(); stopHold() }} onLostPointerCapture={() => { pointerRef.current = null; clearIdleDwell(); stopHold() }}>
            {matchActions.filter(action => action !== "Idle").map((action, index) => { const start = -Math.PI / 2 + index * Math.PI * 2 / 7; const end = start + Math.PI * 2 / 7; const point = (radius: number, angle: number) => `${160 + radius * Math.cos(angle)} ${160 + radius * Math.sin(angle)}`; const middle = (start + end) / 2; return <g key={action} data-match-action={action} role="button" tabIndex={tileDisabled ? -1 : 0} aria-label={`${action}. Hold or drag to record.`} aria-pressed={heldAction === action} onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); switchHold(action) } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stopHold() } }} onBlur={stopHold} className="cursor-pointer focus:outline-none"><path d={`M ${point(78, start)} L ${point(154, start)} A 154 154 0 0 1 ${point(154, end)} L ${point(78, end)} A 78 78 0 0 0 ${point(78, start)} Z`} fill={heldAction === action ? segmentColors[action] : "#20232e"} stroke="#8b91a3" strokeWidth="2"/><text x={160 + 117 * Math.cos(middle)} y={160 + 117 * Math.sin(middle)} textAnchor="middle" dominantBaseline="middle" pointerEvents="none" fill={heldAction === action ? "#101116" : "#f1f5f9"} fontSize="11" fontWeight="700">{action}</text></g> })}
            <g data-match-action="Idle" role="button" tabIndex={tileDisabled ? -1 : 0} aria-label="Idle. Hold or drag to record." aria-pressed={heldAction === "Idle"} onKeyDown={event => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); switchHold("Idle") } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stopHold() } }} onBlur={stopHold} className="cursor-pointer focus:outline-none"><circle cx="160" cy="160" r="78" fill={heldAction === "Idle" ? segmentColors.Idle : "#171a23"} stroke="#8b91a3" strokeWidth="2"/><text x="160" y="160" textAnchor="middle" dominantBaseline="middle" pointerEvents="none" fill="white" fontSize="18" fontWeight="700">Idle</text></g>
          </svg>
          <p className="text-center text-xs text-slate-300">Hold, then drag between actions. Release to stop.</p>
        </> : <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[.04] p-5 text-center">
          <p className="text-lg font-semibold">Run captured</p>
          <p className="text-sm text-slate-300">{timeline.length} activity {timeline.length === 1 ? "segment" : "segments"} recorded for team {teamNumber}.</p>
          <div className="grid gap-4 text-left" aria-label="Robot ratings">
            {([{ label: "Driver rating", value: driverRating, onChange: onDriverRatingChange }, { label: "Defense rating", value: defenseRating, onChange: onDefenseRatingChange }] as const).map(({ label, value, onChange }) => <label key={label} className="grid gap-2 text-sm font-medium text-slate-100"><span className="flex justify-between"><span>{label}</span><strong className="tabular-nums">{value}/10</strong></span><input type="range" min="1" max="10" step="1" value={value} onChange={event => onChange(Number(event.target.value))} className="h-11 w-full cursor-pointer accent-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" /></label>)}
          </div>
          <button type="button" disabled={saving || !timeline.length || !!blockedMessage} onClick={onSubmit} className="min-h-14 rounded-xl bg-emerald-500 px-5 font-bold text-[#07130d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40">{saving ? "Saving report…" : "Submit activity report"}</button>
        </div>}
        <div className="grid gap-2 rounded-xl border border-white/10 p-3">
          <button type="button" aria-pressed={brokeDown} onClick={() => onBrokeDownChange(!brokeDown)} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white", brokeDown ? "border-rose-400 bg-rose-500/20 text-rose-100" : "border-white/20 text-slate-200")}><TriangleAlert className="size-4" aria-hidden="true" /> Robot broke down {brokeDown ? "✓" : ""}</button>
          {brokeDown && <label className="grid gap-1 text-xs text-slate-300">Optional breakdown report<textarea value={breakdownNotes} onChange={event => onBreakdownNotesChange(event.target.value)} maxLength={4000} rows={2} placeholder="What stopped working? Add what you observed." className="w-full rounded-lg border border-white/20 bg-[#191b23] p-2 text-sm text-white placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-white" /></label>}
        </div>
        <div className="grid gap-2 pt-2">

          {confirmRestart ? <div className="grid gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3" role="group" aria-label="Confirm restart match run"><p className="text-sm text-rose-100">Discard this run and start the timer over?</p><div className="grid grid-cols-2 gap-2"><button type="button" disabled={saving} onClick={() => { stopHold(); onRestart(); setNow(0); setConfirmRestart(false) }} className="min-h-11 rounded-lg bg-rose-500 px-2 text-sm font-bold text-white disabled:opacity-50">Discard & restart</button><button type="button" onClick={() => setConfirmRestart(false)} className="min-h-11 rounded-lg border border-white/20 px-2 text-sm font-medium text-white">Keep run</button></div></div> : <button type="button" disabled={saving} onClick={() => setConfirmRestart(true)} className="mx-auto inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"><RotateCcw className="size-4" aria-hidden="true" /> Restart match run</button>}
        </div>
      </main>}
    </div>
  </div>, document.body)
}
