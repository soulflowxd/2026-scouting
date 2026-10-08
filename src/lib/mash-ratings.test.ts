import { expect, test } from "vitest"
import { ratings, topPercent, type Vote } from "./mash-ratings"

test("minimum pool keeps ten scored teams, includes ties and handles smaller pools", () => {
  const teams = Array.from({ length: 20 }, (_, id) => ({ id, score: 100 - id }))
  expect(topPercent(teams, 1, team => team.score, 10)).toHaveLength(10)
  expect(topPercent(teams, 75, team => team.score, 10)).toHaveLength(15)
  expect(topPercent(teams.slice(0, 5), 1, team => team.score, 10)).toHaveLength(5)
  expect(topPercent([...teams, { id: 21, score: 91 }], 1, team => team.score, 10)).toHaveLength(11)
  expect(topPercent([{ score: undefined }], 1, team => team.score, 10)).toEqual([])
})

test("percentile filters include cutoff ties and exclude missing metrics", () => {
  const teams = [{ id: 1, score: 100 }, { id: 2, score: 90 }, { id: 3, score: 90 }, { id: 4, score: 10 }, { id: 5, score: undefined }]
  expect(topPercent(teams, 25, team => team.score).map(team => team.id)).toEqual([1])
  expect(topPercent(teams, 50, team => team.score).map(team => team.id)).toEqual([1, 2, 3])
  expect(topPercent(teams, 100, team => team.score)).toEqual(teams)
  expect(topPercent([{ score: undefined }], 25, team => team.score)).toEqual([])
})

test("a head-to-head win raises the winner and lowers the loser equally", () => {
  const scores = ratings([{ left: 9128, right: 10340, winner: 9128 }])
  expect(scores.get(9128)).toEqual({ score: 1516, games: 1, wins: 1 })
  expect(scores.get(10340)).toEqual({ score: 1484, games: 1, wins: 0 })
})

test("ties count comparisons without inventing wins; undo replays previous ratings", () => {
  const votes: Vote[] = [{ left: 1, right: 2, winner: null }, { left: 1, right: 2, winner: 2 }]
  expect(ratings(votes.slice(0, -1)).get(1)).toEqual({ score: 1500, games: 1, wins: 0 })
  expect(ratings(votes).get(2)?.score).toBeGreaterThan(1500)
  expect(ratings([]).size).toBe(0)
  expect(ratings(votes).has(3)).toBe(false)
})
