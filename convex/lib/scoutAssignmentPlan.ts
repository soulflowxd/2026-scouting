export type ScheduledMatch = { redTeams: number[]; blueTeams: number[] }
function shuffle<T>(values: T[], random: () => number) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
export type TeamAssignment = { teamNumber: number; scout: string }
// Evenly divide every team among the participating scouts, without a fixed cap.
export function planScoutGroups(teams: number[], scouts: string[], random = Math.random): TeamAssignment[] {
  const order = shuffle(scouts, random)
  return order.length ? shuffle(teams, random).map((teamNumber, index) => ({ teamNumber, scout: order[index % order.length] })) : []
}
export function seededRandom(seed: number) {
  let state = seed | 0
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
// Seeded per match: rerenders and different devices see the same random choices.
export function planMatchAssignments(groups: TeamAssignment[], scouts: string[], match: ScheduledMatch & { matchNumber: number }, seed: number): TeamAssignment[] {
  const random = seededRandom(seed + match.matchNumber * 7919)
  const remaining = new Set([...match.redTeams, ...match.blueTeams])
  const available = shuffle(scouts, random)
  const plan: TeamAssignment[] = []
  for (const scout of available) {
    const candidates = groups.filter(group => group.scout === scout && remaining.has(group.teamNumber))
    const choice = shuffle(candidates, random)[0]
    if (choice) { plan.push(choice); remaining.delete(choice.teamNumber) }
  }
  const used = new Set(plan.map(row => row.scout))
  const spare = shuffle(available.filter(scout => !used.has(scout)), random)
  for (const teamNumber of shuffle([...remaining], random)) {
    const scout = spare.pop()
    if (!scout) break
    plan.push({ teamNumber, scout })
  }
  return plan
}
