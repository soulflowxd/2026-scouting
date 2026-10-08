import { ratings, type Vote } from "./mash-ratings"

export function hasMashEvidence(team: { epa?: number; xp?: number; averageRp?: number; pitScouted?: boolean; matchReportCount?: number }) {
  return [team.epa, team.xp, team.averageRp].some(value => typeof value === "number" && Number.isFinite(value))
    || team.pitScouted === true || (team.matchReportCount ?? 0) > 0
}

export function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

export function nextPair(teams: { teamNumber: number }[], votes: Vote[], previous?: [number, number], random = Math.random): [number, number] | null {
  if (teams.length < 2) return null
  const scores = ratings(votes)
  function pick(candidates: typeof teams, weight: (number: number) => number) {
    const weights = candidates.map(team => weight(team.teamNumber))
    let target = random() * weights.reduce((sum, value) => sum + value, 0)
    for (let index = 0; index < candidates.length; index++) {
      target -= weights[index]
      if (target < 0) return candidates[index].teamNumber
    }
    return candidates[candidates.length - 1].teamNumber
  }
  const fresh = teams.filter(team => !previous?.includes(team.teamNumber))
  const left = pick(fresh.length ? fresh : teams, number => 1 / (1 + (scores.get(number)?.games ?? 0) * 0.5))
  const candidates = teams.filter(team => team.teamNumber !== left)
  const right = pick(candidates, number => {
    const repeats = votes.filter(vote => [vote.left, vote.right].includes(left) && [vote.left, vote.right].includes(number)).length
    const sameLastPair = previous?.includes(left) && previous.includes(number)
    return 1 / ((1 + (scores.get(number)?.games ?? 0) * 0.5) * (1 + repeats * 3) * (sameLastPair && teams.length > 2 ? 100 : 1))
  })
  return random() < 0.5 ? [left, right] : [right, left]
}
