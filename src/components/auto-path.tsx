import { useEffect, useId, useRef, useState, type PointerEvent } from "react"
import { Pencil, Route, Undo2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export type PathPoint = { x: number; y: number }
export function AutoPath({ value, onChange, readOnly = false, color = "#7e22ce", layers = [], markers = [], onPlace }: {
  value: PathPoint[][]; onChange?: (value: PathPoint[][]) => void; readOnly?: boolean
  color?: string
  layers?: { color: string; paths: PathPoint[][] }[]
  markers?: { color: string; label: string; position: PathPoint }[]
  onPlace?: (point: PathPoint) => void
}) {
  const [mode, setMode] = useState<"line" | "points">("line")
  const carpetFilter = useId()
  const drawing = useRef(false)
  const current = useRef(value)
  useEffect(() => {
    current.current = value
  }, [value])
  const update = (next: PathPoint[][]) => { current.current = next; onChange?.(next) }
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.round(Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000))), y: Math.round(Math.max(0, Math.min(500, (event.clientY - rect.top) / rect.height * 500))) }
  }
  return <div className="grid min-w-0 gap-2">
    {!readOnly && <div className="flex flex-wrap gap-2">
      <div className="flex gap-1" role="group" aria-label="Drawing mode">
        <Button type="button" variant={mode === "line" ? "default" : "outline"} aria-pressed={mode === "line"} onClick={() => setMode("line")}><Pencil />Line</Button>
        <Button type="button" variant={mode === "points" ? "default" : "outline"} aria-pressed={mode === "points"} onClick={() => setMode("points")}><Route />Points</Button>
      </div>
      <Button type="button" variant="outline" size="icon" title="Undo" aria-label="Undo path" disabled={!value.length} onClick={() => {
        const last = value[value.length - 1]
        update(mode === "points" && last.length > 1 ? [...value.slice(0, -1), last.slice(0, -1)] : value.slice(0, -1))
      }}><Undo2 /></Button>
      <Button type="button" variant="outline" size="icon" title="Clear path" aria-label="Clear path" disabled={!value.length} onClick={() => update([])}><Trash2 /></Button>
    </div>}
    <svg viewBox="0 0 1000 500" aria-label="Auto path drawing area" className={`block aspect-[2/1] w-full rounded-md border bg-background ${readOnly ? "" : "touch-none cursor-crosshair"}`}
      onPointerDown={(event) => {
        if (readOnly || event.button !== 0 || current.current.reduce((sum, path) => sum + path.length, 0) >= 2000) return
        if (onPlace) { onPlace(point(event)); return }
        event.currentTarget.setPointerCapture(event.pointerId)
        const p = point(event)
        if (mode === "points" && current.current.length) update([...current.current.slice(0, -1), [...current.current[current.current.length - 1], p]])
        else update([...current.current, [p]])
        drawing.current = mode === "line"
      }}
      onPointerMove={(event) => {
        if (!drawing.current || readOnly) return
        const paths = current.current
        const last = paths[paths.length - 1]
        const p = point(event)
        if (!last || paths.reduce((sum, path) => sum + path.length, 0) >= 2000 || Math.hypot(p.x - last[last.length - 1].x, p.y - last[last.length - 1].y) < 3) return
        update([...paths.slice(0, -1), [...last, p]])
      }} onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }} onLostPointerCapture={() => { drawing.current = false }}>
      <rect width={1000} height={500} fill="#9b9b97" />
      <defs>
        <filter id={carpetFilter} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" />
          <feComponentTransfer result="whiteBackground">
            <feFuncA type="discrete" tableValues={`${Array(99).fill(0).join(" ")} 1`} />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="whiteBackground" operator="out" />
        </filter>
      </defs>
      <image href="/field-2026.png" x={0} y={0} width={1000} height={500} preserveAspectRatio="none" pointerEvents="none" filter={`url(#${carpetFilter})`} />
      {layers.map((layer, i) => <g key={i} pointerEvents="none">{layer.paths.map((path, j) => <g key={j}>
        <polyline points={path.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="white" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={path.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={layer.color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        {path[0] && <circle cx={path[0].x} cy={path[0].y} r={6} fill={layer.color} />}
      </g>)}</g>)}
      {value.map((path, i) => <g key={i}>
        <polyline points={path.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="white" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={path.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        {path.filter((_, index) => index === 0 || index === path.length - 1 || mode === "points").map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={7} fill={color} stroke="white" strokeWidth={2} />)}
      </g>)}
      {markers.map((marker, i) => <g key={i} transform={`translate(${marker.position.x} ${marker.position.y})`} pointerEvents="none">
        <rect x={-24} y={-24} width={48} height={48} rx={4} fill={marker.color} stroke="white" strokeWidth={3} />
        <text textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={13} fontWeight={700}>{marker.label}</text>
      </g>)}
    </svg>
    <a href="https://www.chiefdelphi.com/t/2026-strategy-board-field-images/514729" target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline underline-offset-4">REBUILT field image by _AD</a>
  </div>
}
