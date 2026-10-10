import { spawnSync } from "node:child_process"

const deployment = process.argv[2]
const username = process.env.FIRST_API_USERNAME
const token = process.env.FIRST_API_AUTH_TOKEN
if (!deployment) throw new Error("Specify the Convex deployment name")
if (!username || !token) throw new Error("Set FIRST_API_USERNAME and FIRST_API_AUTH_TOKEN")

async function first(path) {
  const response = await fetch(`https://frc-api.firstinspires.org/v3.0/2026/${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}` },
  })
  if (!response.ok) throw new Error(`FIRST API returned ${response.status}`)
  return response.json()
}

function run(name, args) {
  const result = spawnSync(process.execPath, [
    "node_modules/convex/bin/main.js", "run", "--deployment", deployment,
    name, JSON.stringify(args),
  ], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || "Convex command failed")
  return result.stdout.trim() ? JSON.parse(result.stdout) : null
}

const [roster, schedule, details] = await Promise.all([
  first("teams?eventCode=TXMCK"),
  first("schedule/TXMCK?TournamentLevel=Qualification"),
  first("events?eventCode=TXMCK"),
])
if (roster.pageTotal !== 1 || !roster.teams?.some(team => team.teamNumber === 10340)) {
  throw new Error("Expected complete STEM Gals roster including 10340")
}
if (details.Events?.[0]?.name !== "STEM Gals") throw new Error("Unexpected FIRST event")
const teams = roster.teams.map(team => ({
  teamNumber: team.teamNumber, tbaTeamKey: `frc${team.teamNumber}`,
  nickname: team.nameShort.trim(), city: team.city,
  stateProv: team.stateProv, country: team.country,
}))
const numbers = new Set(teams.map(team => team.teamNumber))
const matches = schedule.Schedule.map(match => {
  const stations = [...match.teams].sort((a, b) => a.station.localeCompare(b.station))
  if (stations.length !== 6 || new Set(stations.map(team => team.station)).size !== 6 ||
      stations.some(team => !numbers.has(team.teamNumber))) throw new Error("Invalid FIRST schedule")
  return {
    // FIRST source identifier deliberately differs from a TBA match key.
    tbaMatchKey: `first:2026txmck:qm${match.matchNumber}`,
    matchNumber: match.matchNumber,
    redTeams: stations.filter(team => team.station.startsWith("Red")).map(team => team.teamNumber),
    blueTeams: stations.filter(team => team.station.startsWith("Blue")).map(team => team.teamNumber),
    scheduledTime: Date.parse(`${match.startTime}-05:00`) / 1000,
  }
})
const existing = run("events:list", {}).find(event => event.eventKey === "2026txmck")
const eventId = existing?._id ?? run("importData:beginImport", {
  eventKey: "2026txmck", createdByToken: "manual:first-stem-gals-import",
})
run("importData:applyEventImport", { eventId, eventName: "STEM Gals", teams, matches })
const event = run("events:list", {}).find(event => event._id === eventId)
const savedTeams = run("teams:list", { eventId })
if (event?.importStatus !== "ready" || !savedTeams.some(team => team.teamNumber === 10340) ||
    !teams.every(team => savedTeams.some(saved => saved.teamNumber === team.teamNumber))) {
  throw new Error("STEM Gals import verification failed")
}
console.log(`Verified STEM Gals (${deployment}): ${teams.length} teams, ${matches.length} FIRST qualification matches; scouting ${event.scoutingEnabled ? "open" : "closed"}`)
