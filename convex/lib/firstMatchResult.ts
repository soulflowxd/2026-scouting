import { firstRecord } from "./firstApi"
import type { AllianceResult, TbaResult } from "./tbaMatchResult"

const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined

export function firstStations(payload: unknown) {
  if (!Array.isArray(payload) || payload.length !== 6) return null
  const stations = payload.map(firstRecord)
  const labels = new Set(stations.map(team => team.station))
  if (["Red1", "Red2", "Red3", "Blue1", "Blue2", "Blue3"].some(station => !labels.has(station)) ||
    stations.some(team => count(team.teamNumber) === undefined || team.teamNumber === 0) || new Set(stations.map(team => team.teamNumber)).size !== 6) return null
  return {
    redTeams: [1, 2, 3].map(n => stations.find(team => team.station === `Red${n}`)!.teamNumber as number),
    blueTeams: [1, 2, 3].map(n => stations.find(team => team.station === `Blue${n}`)!.teamNumber as number),
  }
}

export function parseFirstResult(payload: unknown, details: unknown, match: { matchNumber: number; redTeams: number[]; blueTeams: number[] }, year: number): TbaResult | null {
  const row = firstRecord(payload)
  if (row.tournamentLevel !== "Qualification" || row.matchNumber !== match.matchNumber ||
    typeof row.postResultTime !== "string" || !row.postResultTime.startsWith(`${year}-`) || !/^\d{4}-\d{2}-\d{2}T/.test(row.postResultTime) || !Number.isFinite(Date.parse(row.postResultTime))) return null
  const redScore = count(row.scoreRedFinal), blueScore = count(row.scoreBlueFinal)
  if (redScore === undefined || blueScore === undefined) return null
  const stations = firstStations(row.teams)
  if (!stations || stations.redTeams.some((team, n) => match.redTeams[n] !== team) || stations.blueTeams.some((team, n) => match.blueTeams[n] !== team) || match.redTeams.length !== 3 || match.blueTeams.length !== 3) return null
  const breakdown = firstRecord(details)
  const alliances = year === 2026 && breakdown.matchLevel === "Qualification" && breakdown.matchNumber === match.matchNumber && Array.isArray(breakdown.alliances) ? breakdown.alliances.map(firstRecord) : []
  const autoFuel = (side: string) => count(firstRecord(alliances.find(alliance => alliance.alliance === side)?.hubScore).autoCount)
  const redFuel = autoFuel("Red"), blueFuel = autoFuel("Blue")
  const result = (score: number, opponent: number, fuel: number | undefined, otherFuel: number | undefined): AllianceResult => ({
    totalMatchPoints: score, wonMatch: score > opponent, tiedMatch: score === opponent,
    ...(fuel !== undefined && otherFuel !== undefined ? { wonAuto: fuel > otherFuel, tiedAuto: fuel === otherFuel, autoAllianceFuel: fuel, opponentAutoFuel: otherFuel } : {}),
  })
  return { red: result(redScore, blueScore, redFuel, blueFuel), blue: result(blueScore, redScore, blueFuel, redFuel) }
}
