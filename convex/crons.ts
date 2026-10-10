import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()
crons.interval("Refresh STEM Gals FIRST rankings", { minutes: 5 }, internal.firstRankings.refreshStemGals, {})
export default crons
