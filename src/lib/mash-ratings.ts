export type Vote = { left: number; right: number; winner: number | null }

export function readVotes(key: string): Vote[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(saved) ? saved.filter((v): v is Vote => v && Number.isInteger(v.left) && Number.isInteger(v.right) && v.left !== v.right && (v.winner === null || v.winner === v.left || v.winner === v.right)).slice(-5000) : []
  } catch { return [] }
}

export function topPercent<T>(items: T[], percent: number, score: (item: T) => number | undefined, minimum = 1): T[] {
  if (percent >= 100) return items
  const known = items.flatMap(item => { const value = score(item); return value !== undefined && Number.isFinite(value) ? [value] : [] }).sort((a, b) => b - a)
  if (!known.length) return []
  const count = Math.min(known.length, Math.max(minimum, Math.ceil(known.length * Math.max(1, percent) / 100)))
  const cutoff = known[Math.max(0, count - 1)]
  return items.filter(item => { const value = score(item); return value !== undefined && value >= cutoff })
}

export function ratings(votes: Vote[]) {
  const result = new Map<number, { score: number; games: number; wins: number }>()
  for (const vote of votes) {
    const left = result.get(vote.left) ?? { score: 1500, games: 0, wins: 0 }
    const right = result.get(vote.right) ?? { score: 1500, games: 0, wins: 0 }
    const actual = vote.winner === null ? 0.5 : Number(vote.winner === vote.left)
    const change = 32 * (actual - 1 / (1 + 10 ** ((right.score - left.score) / 400)))
    result.set(vote.left, { score: left.score + change, games: left.games + 1, wins: left.wins + Number(vote.winner === vote.left) })
    result.set(vote.right, { score: right.score - change, games: right.games + 1, wins: right.wins + Number(vote.winner === vote.right) })
  }
  return result
}
