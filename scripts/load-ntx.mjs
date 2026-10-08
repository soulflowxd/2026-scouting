import { spawnSync } from "node:child_process"

const deployment = process.argv[2]
if (!deployment) throw new Error("Specify the Convex deployment name")

function run(name, args) {
  const result = spawnSync(process.execPath, [
    "node_modules/convex/bin/main.js", "run", "--deployment", deployment,
    name, JSON.stringify(args),
  ], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || "Convex command failed")
  return result.stdout.trim() ? JSON.parse(result.stdout) : null
}

// Letter-suffixed squads get event-local numeric slots, never their parent team's ID.
const roster = [
  [6369, "Mercenary Robotics"],
  [6773, "Full Throttle Mavericks"],
  [11738, "M.I.T."],
  [148, "Robowranglers"],
  [1296, "Full Metal Jackets"],
  [1745, "Solid State"],
  [99001, "Solider State (1745S)", "1745S"],
  [2718, "OKC"],
  [99002, "Irrational Joeys (2718B)", "2718B"],
  [4192, "Jaguar"],
  [5431, "Titans"],
  [5790, "Proto-Titans"],
  [5829, "Awtybots"],
  [99003, "Awtysparks (5829B)", "5829B"],
  [6171, "Chain Reaction"],
  [6901, "Knightfall"],
  [7121, "Keller Fusion"],
  [7506, "Wildcards"],
  [7503, "Radicubs"],
  [8732, "Trinity Force"],
  [8749, "Farmersville"],
  [8858, "Beast from the East"],
  [9128, "ITKAN Robotics"],
  [10014, "Rebellion"],
  [99004, "Rebellious (10014R)", "10014R"],
  [10032, "Singularity"],
  [10340, "ITKAN Girls"],
  [10661, "Blue Phoenix"],
]

const existingEvent = run("events:list", {}).find(event => event.eventKey === "2026ntx")
const eventId = existingEvent?._id ?? run("importData:beginImport", {
  eventKey: "2026ntx", createdByToken: "manual:ntx-roster-import",
})
const existingTeams = run("teams:list", { eventId })
const missing = roster.filter(([number]) => !existingTeams.some(team => team.teamNumber === number))
if (missing.length) run("importData:applyEventImport", {
  eventId, eventName: "NTX",
  teams: missing.map(([teamNumber, nickname, alias]) => ({
    teamNumber, nickname, tbaTeamKey: `frc${alias ?? teamNumber}`,
  })),
  matches: [],
})
const teams = run("teams:list", { eventId })
if (teams.length < roster.length) throw new Error("Unexpected NTX roster size")
for (const [number] of roster) {
  if (!teams.some(team => team.teamNumber === number)) {
    throw new Error(`Roster verification failed for ${number}`)
  }
}
console.log(`Added ${missing.length} missing teams; verified NTX: ${teams.length} teams (${deployment})`)
