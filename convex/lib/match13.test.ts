import { expect, test } from "vitest"
import { match13Stats, scopedMatch13Stats } from "./match13"

test("maps event xP and keeps predicted RP separate from actual RP", () => {
  expect(match13Stats({
    teamNumber: 88, xpEnd: 156.131, xpStart: 193.0922,
    epa: 156.7915, xAuto: 36.3367, xTele: 119.7078, xEnd: 0.0865,
    xRp1: 0.3242, xRp2: 0.1792, xRp3: 0.0598,
  })).toEqual({
    xp: 156.131, match13Epa: 156.7915,
    autoXp: 36.3367, teleopXp: 119.7078, endgameXp: 0.0865,
    predictedRp1: 0.3242, predictedRp2: 0.1792, predictedRp3: 0.0598,
  })
})

test("uses starting xP when ending xP is unavailable and preserves zero", () => {
  expect(match13Stats({ teamNumber: 88, xpEnd: null, xpStart: 12 }).xp).toBe(12)
  expect(match13Stats({ teamNumber: 88, xpEnd: 0, xpStart: 12 }).xp).toBe(0)
  expect(match13Stats({ teamNumber: 88, xpEnd: NaN }).xp).toBeUndefined()
  expect(match13Stats().xp).toBeUndefined()
})

test("scoped ratings use the season rating rather than an event rating", () => {
  expect(scopedMatch13Stats({ teamNumber: 88, xp: 120, xpEnd: 156 }).xp).toBe(120)
  expect(scopedMatch13Stats({ teamNumber: 88, xp: 0 }).xp).toBe(0)
  expect(scopedMatch13Stats({ teamNumber: 88, xpEnd: 156 }).xp).toBeUndefined()
})
