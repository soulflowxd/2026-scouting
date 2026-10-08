import { useEffect, useState } from "react"
import { useQuery } from "convex/react"
import { MapPin, RotateCcw } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { AutoPath, type PathPoint } from "@/components/auto-path"
import { Button } from "@/components/ui/button"
import { eventLabel, useActiveEvent } from "@/lib/active-event"

const stations = [
  { name: "Red 1", color: "#b91c1c" },
  { name: "Red 2", color: "#c2410c" },
  { name: "Red 3", color: "#be185d" },
  { name: "Blue 1", color: "#1d4ed8" },
  { name: "Blue 2", color: "#0e7490" },
  { name: "Blue 3", color: "#6d28d9" },
]
type StationState = { team: string; paths: PathPoint[][]; position: PathPoint }
const fresh = (): StationState[] => stations.map((_, i) => ({ team: "", paths: [], position: { x: i < 3 ? 80 : 920, y: 100 + (i % 3) * 150 } }))
function load(key: string): StationState[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null")
    const validPoint = (p: unknown): p is PathPoint => !!p && typeof p === "object" && "x" in p && "y" in p && typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 500
    if (Array.isArray(saved) && saved.length === 6 && saved.every((s) => typeof s?.team === "string" && validPoint(s.position) && Array.isArray(s.paths) && s.paths.length <= 200 && s.paths.every((path: unknown) => Array.isArray(path) && path.length <= 2000 && path.every(validPoint)))) return saved
  } catch { /* Ignore an invalid saved board. */ }
  return fresh()
}
export function StrategyBoardRoute() {
  const { activeEvent } = useActiveEvent()
  const teams = useQuery(api.teams.list, activeEvent ? { eventId: activeEvent._id } : "skip")
  if (!activeEvent) return <h1 className="text-xl font-semibold">No event selected</h1>
  return <Board key={activeEvent._id} storageKey={`scouting:strategy:${activeEvent._id}`} title={eventLabel(activeEvent)} teams={teams ?? []} />
}
function Board({ storageKey, title, teams }: { storageKey: string; title: string; teams: { teamNumber: number; nickname: string }[] }) {
  const [board, setBoard] = useState(() => load(storageKey))
  const [active, setActive] = useState(0)
  const [placing, setPlacing] = useState(false)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(board)); setStorageError(false) }
    catch { setStorageError(true) }
  }, [board, storageKey])
  const update = (index: number, patch: Partial<StationState>) => setBoard((current) => current.map((s, i) => i === index ? { ...s, ...patch } : s))
  return <section className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Strategy Board</h1><p className="text-sm text-muted-foreground">{title}</p></div>
      <Button variant="outline" onClick={() => { if (window.confirm("Reset all teams and paths on this board?")) { setBoard(fresh()); setPlacing(false) } }}><RotateCcw />Reset board</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stations.map((station, index) => <div key={station.name} className="grid min-w-0 gap-2 border-b pb-3">
        <button type="button" aria-pressed={active === index} onClick={() => { setActive(index); setPlacing(false) }} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-semibold ${active === index ? "border-foreground bg-muted" : "border-transparent"}`}>
          <span className="size-3 rounded-full" style={{ backgroundColor: station.color }} />{station.name}
        </button>
        <select aria-label={`${station.name} team`} className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm" value={board[index].team} onChange={(event) => update(index, { team: event.target.value })}>
          <option value="">Select team</option>
          {teams.map((team) => <option key={team.teamNumber} value={team.teamNumber} disabled={board.some((s, i) => i !== index && s.team === String(team.teamNumber))}>{team.teamNumber} {team.nickname}</option>)}
        </select>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <h2 className="flex items-center gap-2 font-semibold"><span className="size-3 rounded-full" style={{ backgroundColor: stations[active].color }} />{stations[active].name}{board[active].team ? ` - Team ${board[active].team}` : ""}</h2>
      <Button variant={placing ? "default" : "outline"} aria-pressed={placing} disabled={!board[active].team} onClick={() => setPlacing(!placing)}><MapPin />Place robot</Button>
    </div>
    {storageError && <p role="alert" className="text-sm text-destructive">Board could not be saved in this browser.</p>}
    <AutoPath value={board[active].paths} color={stations[active].color} readOnly={!board[active].team}
      fullscreenControls={<div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">Robot
          <select aria-label="Active robot" value={active} className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" onChange={event => { setActive(Number(event.target.value)); setPlacing(false) }}>
            {stations.map((station, index) => <option key={station.name} value={index}>{station.name}{board[index].team ? ` · ${board[index].team}` : " · No team"}</option>)}
          </select>
        </label>
        <Button type="button" variant={placing ? "default" : "outline"} disabled={!board[active].team} aria-pressed={placing} onClick={() => setPlacing(!placing)}><MapPin aria-hidden="true" />Place robot</Button>
      </div>}
      onChange={(paths) => { setPlacing(false); update(active, { paths }) }}
      onPlace={placing ? (position) => { update(active, { position }); setPlacing(false) } : undefined}
      layers={board.flatMap((s, i) => i === active || !s.team ? [] : [{ color: stations[i].color, paths: s.paths }])}
      markers={board.flatMap((s, i) => s.team ? [{ color: stations[i].color, label: s.team, position: s.position }] : [])} />
  </section>
}
