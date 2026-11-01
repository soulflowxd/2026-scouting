export const matchActions = ["Scoring", "Passing", "Climbing", "Idle", "Defending", "Traveling", "Intaking"] as const
export type MatchActivitySegment = { action: string; startMs: number; endMs: number }

export const AUTO_END_MS = 20_000
export const TELEOP_START_MS = 23_000
export const ENDGAME_START_MS = 133_000
export const MATCH_END_MS = 163_000

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
