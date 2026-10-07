import { v } from "convex/values"

export const match13RatingValidator = v.object({
  xp: v.optional(v.number()),
  match13Epa: v.optional(v.number()),
  autoXp: v.optional(v.number()),
  teleopXp: v.optional(v.number()),
  endgameXp: v.optional(v.number()),
  predictedRp1: v.optional(v.number()),
  predictedRp2: v.optional(v.number()),
  predictedRp3: v.optional(v.number()),
})

export type Match13Team = {
  teamNumber: number
  xp?: number | null
  xpEnd?: number | null
  xpStart?: number | null
  epa?: number | null
  xAuto?: number | null
  xTele?: number | null
  xEnd?: number | null
  xRp1?: number | null
  xRp2?: number | null
  xRp3?: number | null
}

export function scopedMatch13Stats(row?: Match13Team) {
  return match13Stats(row ? { ...row, xpEnd: row.xp, xpStart: null } : undefined)
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function match13Stats(row?: Match13Team) {
  return {
    xp: finite(row?.xpEnd) ?? finite(row?.xpStart),
    match13Epa: finite(row?.epa),
    autoXp: finite(row?.xAuto),
    teleopXp: finite(row?.xTele),
    endgameXp: finite(row?.xEnd),
    predictedRp1: finite(row?.xRp1),
    predictedRp2: finite(row?.xRp2),
    predictedRp3: finite(row?.xRp3),
  }
}
