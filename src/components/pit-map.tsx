import { useState } from "react"
import { Maximize, Minus, Plus, Search } from "lucide-react"
import type { NexusMap, MapShape } from "../../convex/lib/nexusMap"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function PitMap({
  layout, teams, onSelect,
}: {
  layout: NexusMap
  teams: { teamNumber: number; nickname: string; pitScouted: boolean }[]
  onSelect: (teamNumber: number) => void
}) {
  const [search, setSearch] = useState("")
  const [zoom, setZoom] = useState(1)
  const needle = search.trim().toLowerCase()
  const byTeam = new Map(teams.map((team) => [team.teamNumber, team]))
  const matches = (pit: MapShape) => !!needle && (
    String(pit.teamNumber ?? "").includes(needle) ||
    pit.id.toLowerCase().includes(needle) ||
    (byTeam.get(pit.teamNumber ?? 0)?.nickname.toLowerCase().includes(needle) ?? false)
  )
  const box = (shape: MapShape) => ({
    x: shape.x - shape.width / 2, y: shape.y - shape.height / 2,
    width: shape.width, height: shape.height,
  })
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-40 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Find team or pit" placeholder="Find team or pit" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
        </label>
        <Button size="icon" variant="outline" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))}><Minus /></Button>
        <Button size="icon" variant="outline" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.5))}><Plus /></Button>
        <Button size="icon" variant="outline" title="Fit map" aria-label="Fit map" onClick={() => setZoom(1)}><Maximize /></Button>
      </div>
      <div className="max-h-[65svh] overflow-auto rounded-md border bg-background p-3" tabIndex={0} aria-label="Pit floor plan">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ width: 560 * zoom, maxWidth: zoom === 1 ? "100%" : undefined, minWidth: zoom === 1 ? undefined : 360, height: "auto" }}
          className="mx-auto block"
          aria-label="Nexus venue pit map"
        >
          <rect width={layout.width} height={layout.height} className="fill-background" />
          {layout.walls.map((wall) => <rect key={wall.id} {...box(wall)} transform={`rotate(${wall.angle} ${wall.x} ${wall.y})`} className="fill-muted-foreground" />)}
          {layout.areas.map((area) => (
            <g key={area.id} transform={`rotate(${area.angle} ${area.x} ${area.y})`}>
              <rect {...box(area)} rx={3} className="fill-emerald-100 stroke-emerald-700 dark:fill-emerald-950 dark:stroke-emerald-500" strokeWidth={2} />
              <text x={area.x} y={area.y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(22, area.width / Math.max(area.label.length * 0.6, 1))} className="fill-emerald-900 dark:fill-emerald-100">{area.label}</text>
            </g>
          ))}
          {layout.pits.map((pit) => {
            const team = byTeam.get(pit.teamNumber ?? 0)
            const highlighted = matches(pit)
            return (
              <g key={pit.id}
                transform={`rotate(${pit.angle} ${pit.x} ${pit.y})`}
                role={team ? "button" : undefined} tabIndex={team ? 0 : undefined}
                aria-label={`Pit ${pit.id}${pit.teamNumber ? `, team ${pit.teamNumber}` : ", empty"}${team?.pitScouted ? ", scouted" : ""}`}
                onClick={() => { if (team) onSelect(team.teamNumber) }}
                onKeyDown={(event) => { if (team && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(team.teamNumber) } }}
                className={`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${team ? "cursor-pointer" : ""} ${needle && !highlighted ? "opacity-35" : ""}`}
              >
                <title>{pit.id}{team ? ` - ${team.teamNumber} ${team.nickname}` : ""}</title>
                <rect {...box(pit)} x={pit.x - pit.width / 2 + 2} y={pit.y - pit.height / 2 + 2} width={pit.width - 4} height={pit.height - 4} rx={3}
                  className={highlighted ? "fill-primary stroke-primary" : team?.pitScouted ? "fill-emerald-100 stroke-emerald-600 dark:fill-emerald-950 dark:stroke-emerald-500" : "fill-muted stroke-muted-foreground"}
                  strokeWidth={highlighted ? 5 : 1.5}
                />
                <text x={pit.x} y={pit.y - 9} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(24, pit.width / 4.2)} fontWeight={600} className={highlighted ? "fill-primary-foreground" : "fill-foreground"}>{pit.teamNumber ?? "Empty"}</text>
                <text x={pit.x} y={pit.y + 18} textAnchor="middle" dominantBaseline="middle" fontSize={18} className={highlighted ? "fill-primary-foreground" : "fill-muted-foreground"}>{pit.id}</text>
              </g>
            )
          })}
          {layout.labels.map((label) => <text key={label.id} x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fontSize={22} transform={`rotate(${label.angle} ${label.x} ${label.y})`} className="fill-foreground">{label.label}</text>)}
          {layout.arrows.map((arrow) => (
            <g key={arrow.id} transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`} className="stroke-primary" strokeWidth={5} fill="none">
              <path d={`M 0 ${-arrow.height / 2} V ${arrow.height / 2} M ${-arrow.width / 2} 0 L 0 ${arrow.height / 2} L ${arrow.width / 2} 0`} />
              {arrow.double && <path d={`M ${-arrow.width / 2} 0 L 0 ${-arrow.height / 2} L ${arrow.width / 2} 0`} />}
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex gap-4"><span>Green: scouted</span><span>{needle ? `${layout.pits.filter(matches).length} matching pits` : `${layout.pits.length} pits`}</span></div>
        <a href="https://frc.nexus" target="_blank" rel="noreferrer" className="underline underline-offset-4">Map by FRC Nexus</a>
      </div>
    </div>
  )
}
