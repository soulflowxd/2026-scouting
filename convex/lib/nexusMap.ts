export type MapShape = {
  id: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  label: string
  teamNumber: number | null
  double: boolean
}

export type NexusMap = {
  width: number
  height: number
  pits: MapShape[]
  areas: MapShape[]
  walls: MapShape[]
  labels: MapShape[]
  arrows: MapShape[]
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function number(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function normalizeNexusMap(payload: unknown): NexusMap | null {
  const data = record(payload)
  const size = record(data.size)
  const width = number(size.x)
  const height = number(size.y)
  if (width <= 0 || height <= 0) return null
  function shapes(key: string): MapShape[] {
    return Object.entries(record(data[key])).flatMap(([id, value]) => {
      const shape = record(value)
      const position = record(shape.position)
      const dimensions = record(shape.size)
      const w = number(dimensions.x)
      const h = number(dimensions.y)
      if (w <= 0 || h <= 0) return []
      const team = Number(shape.team)
      return [{
        id, x: number(position.x), y: number(position.y),
        width: w, height: h, angle: number(shape.angle),
        label: typeof shape.label === "string" ? shape.label : id,
        teamNumber: Number.isInteger(team) && team > 0 ? team : null,
        double: shape.type === "double",
      }]
    })
  }
  return {
    width, height, pits: shapes("pits"), areas: shapes("areas"),
    walls: shapes("walls"), labels: shapes("labels"), arrows: shapes("arrows"),
  }
}
