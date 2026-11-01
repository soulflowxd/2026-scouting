export const matchActions = ["Scoring", "Passing", "Climbing", "Idle", "Defending", "Traveling", "Intaking", "Stealing"] as const
export type MatchActivitySegment = { action: string; startMs: number; endMs: number }
export type AllianceColor = "red" | "blue"

export const AUTO_END_MS = 20_000
export const TELEOP_START_MS = 23_000
export const TRANSITION_END_MS = 33_000
export const ENDGAME_START_MS = 133_000
export const MATCH_END_MS = 163_000

export function matchShift(elapsedMs: number, firstInactive: AllianceColor | null) {
  if (elapsedMs < AUTO_END_MS) return { label: "Auto", endsAtMs: AUTO_END_MS, inactiveHub: null }
  if (elapsedMs < TELEOP_START_MS) return { label: "Auto gap", endsAtMs: TELEOP_START_MS, inactiveHub: null }
  if (elapsedMs < TRANSITION_END_MS) return { label: "Transition shift", endsAtMs: TRANSITION_END_MS, inactiveHub: null }
  if (elapsedMs < ENDGAME_START_MS) {
    const index = Math.floor((elapsedMs - TRANSITION_END_MS) / 25_000)
    const inactiveHub = firstInactive === null ? null : index % 2 === 0 ? firstInactive : firstInactive === "red" ? "blue" : "red"
    return { label: `Shift ${index + 1}`, endsAtMs: TRANSITION_END_MS + (index + 1) * 25_000, inactiveHub }
  }
  if (elapsedMs < MATCH_END_MS) return { label: "Endgame", endsAtMs: MATCH_END_MS, inactiveHub: null }
  return { label: "Match complete", endsAtMs: MATCH_END_MS, inactiveHub: null }
}

export function matchPhase(elapsedMs: number) {
  if (elapsedMs < AUTO_END_MS) return "Auto"
  if (elapsedMs < TELEOP_START_MS) return "3-second gap"
  if (elapsedMs < ENDGAME_START_MS) return "Teleop"
  if (elapsedMs < MATCH_END_MS) return "Endgame"
  return "Match complete"
}

export function endActivityAt(segment: MatchActivitySegment, elapsedMs: number) {
  return Math.max(segment.startMs, Math.min(elapsedMs, segment.startMs < AUTO_END_MS ? AUTO_END_MS : MATCH_END_MS))
}
