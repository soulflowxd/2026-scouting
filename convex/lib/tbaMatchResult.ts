import { v } from "convex/values"

const allianceResult = v.object({
  totalMatchPoints: v.number(),
  wonMatch: v.boolean(),
  tiedMatch: v.boolean(),
  wonAuto: v.optional(v.boolean()),
  tiedAuto: v.optional(v.boolean()),
  autoAllianceFuel: v.optional(v.number()),
  opponentAutoFuel: v.optional(v.number()),
})
export const tbaResultValidator = v.object({ red: allianceResult, blue: allianceResult })
export type AllianceResult = {
  totalMatchPoints: number; wonMatch: boolean; tiedMatch: boolean
  wonAuto?: boolean; tiedAuto?: boolean; autoAllianceFuel?: number; opponentAutoFuel?: number
}
export type TbaResult = { red: AllianceResult; blue: AllianceResult }

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined
}

// Alliance fuel is not a robot's cycle count. In 2026 auto is won by fuel, not tower points.
export function parseTbaResult(payload: unknown, expectedKey: string): TbaResult | null {
  const match = record(payload)
  if (match.key !== expectedKey || match.comp_level !== "qm") return null
  const alliances = record(match.alliances)
  const redScore = count(record(alliances.red).score)
  const blueScore = count(record(alliances.blue).score)
  if (redScore === undefined || blueScore === undefined) return null // -1 means unplayed.
  const breakdown = record(match.score_breakdown)
  const autoFuel = (side: string) => count(record(record(breakdown[side]).hubScore).autoCount)
  const redFuel = autoFuel("red"), blueFuel = autoFuel("blue")
  const result = (score: number, opponent: number, fuel: number | undefined, opponentFuel: number | undefined): AllianceResult => ({
    totalMatchPoints: score, wonMatch: score > opponent, tiedMatch: score === opponent,
    ...(fuel !== undefined && opponentFuel !== undefined ? {
      wonAuto: fuel > opponentFuel, tiedAuto: fuel === opponentFuel,
      autoAllianceFuel: fuel, opponentAutoFuel: opponentFuel,
    } : {}),
  })
  return { red: result(redScore, blueScore, redFuel, blueFuel), blue: result(blueScore, redScore, blueFuel, redFuel) }
}

export function reportResult(result: AllianceResult) {
  const { tiedMatch: _matchTie, tiedAuto: _autoTie, ...fields } = result
  void _matchTie; void _autoTie
  return fields
}
