import { expect, test } from "vitest"
import { hasMashEvidence, nextPair, seededRandom } from "./mash-pairing"

test("empty offseason teams are skipped but real stats and scouting evidence count", () => {
  expect(hasMashEvidence({})).toBe(false)
  expect(hasMashEvidence({ pitScouted: false, matchReportCount: 0, epa: NaN })).toBe(false)
  expect(hasMashEvidence({ epa: 0 })).toBe(true)
  expect(hasMashEvidence({ xp: 42 })).toBe(true)
  expect(hasMashEvidence({ averageRp: 0 })).toBe(true)
  expect(hasMashEvidence({ pitScouted: true })).toBe(true)
  expect(hasMashEvidence({ matchReportCount: 1 })).toBe(true)
})

const teams = [118, 127, 9128, 10340, 254, 1678].map(teamNumber => ({ teamNumber }))

test("opening pairs vary across seeds, stay stable within a session, and never match a team against itself", () => {
  const pairs = new Set<string>()
  for (let seed = 1; seed <= 100; seed++) {
    const pair = nextPair(teams, [], undefined, seededRandom(seed * 1234567))!
    expect(pair[0]).not.toBe(pair[1])
    expect(nextPair(teams, [], undefined, seededRandom(seed * 1234567))).toEqual(pair)
    pairs.add([...pair].sort().join(":"))
  }
  expect(pairs.size).toBeGreaterThan(10)
})

test("pairing respects the supplied pool and avoids the previous pair when possible", () => {
  expect(nextPair([], [])).toBeNull()
  expect(nextPair(teams.slice(0, 1), [])).toBeNull()
  expect(nextPair(teams.slice(0, 2), [], [118, 127], seededRandom(42))?.sort()).toEqual([118, 127])
  const pair = nextPair(teams, [], [118, 127], seededRandom(42))!
  expect(pair.some(number => number !== 118 && number !== 127)).toBe(true)
})
