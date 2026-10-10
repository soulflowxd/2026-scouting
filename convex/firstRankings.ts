"use node"

import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalAction, env } from "./_generated/server"

export type FirstRanking = {
  teamNumber: number
  rank: number
  sortOrder1: number
  matchesPlayed: number
  wins: number
  losses: number
  ties: number
}

export async function fetchFirstRankings(eventKey: string): Promise<FirstRanking[]> {
  if (!/^\d{4}txmck$/.test(eventKey)) throw new Error("Unsupported FIRST event")
  const username = env.FIRST_API_USERNAME
  const token = env.FIRST_API_AUTH_TOKEN
  if (!username || !token) throw new Error("Missing FIRST API credentials")
  const response = await fetch(
    `https://frc-api.firstinspires.org/v3.0/${eventKey.slice(0, 4)}/rankings/${eventKey.slice(4).toUpperCase()}`,
    { headers: { Authorization: `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}` }, signal: AbortSignal.timeout(15000) },
  )
  if (!response.ok) throw new Error(`FIRST rankings request failed (${response.status})`)
  const data: { Rankings?: FirstRanking[] } = await response.json()
  if (!Array.isArray(data.Rankings)) throw new Error("Invalid FIRST rankings response")
  return data.Rankings.filter(row =>
    Number.isInteger(row.teamNumber) && row.teamNumber > 0 &&
    Number.isInteger(row.rank) && row.rank > 0 &&
    Number.isFinite(row.sortOrder1) && row.sortOrder1 >= 0 &&
    Number.isInteger(row.matchesPlayed) && row.matchesPlayed > 0 &&
    [row.wins, row.losses, row.ties].every(value => Number.isInteger(value) && value >= 0),
  )
}

export const refreshEvent = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<number> => {
    const event = await ctx.runQuery(internal.importData.getEventForRefresh, args)
    if (!event || !/^\d{4}txmck$/.test(event.eventKey)) return 0
    const rankings = await fetchFirstRankings(event.eventKey)
    await ctx.runMutation(internal.importData.applyFirstRankings, {
      eventId: args.eventId,
      rankings: rankings.map(row => ({
        teamNumber: row.teamNumber, eventRank: row.rank, averageRp: row.sortOrder1,
        wins: row.wins, losses: row.losses, ties: row.ties,
      })),
    })
    return rankings.length
  },
})

export const refreshStemGals = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const events = await ctx.runQuery(internal.importData.firstEvents, {})
    let count = 0
    for (const event of events) {
      count += await ctx.runAction(internal.firstRankings.refreshEvent, { eventId: event._id })
    }
    return count
  },
})
