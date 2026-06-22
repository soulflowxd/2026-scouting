import { v } from "convex/values"
import { internal } from "./_generated/api"
import { action, env, internalQuery } from "./_generated/server"

type EventInfo = {
  eventKey: string
}

type PitMapEntry = {
  teamNumber: number
  location: string
}

type NexusRecord = Record<string, unknown>

export const eventInfo = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<EventInfo | null> => {
    const event = await ctx.db.get(args.eventId)
    return event ? { eventKey: event.eventKey } : null
  },
})

export const fetchPitMap = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<{ eventKey: string; pits: PitMapEntry[]; message?: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Sign in to load Nexus pit map")
    }

    const apiKey = env.NEXUS_API_KEY?.trim()
    if (!apiKey) {
      throw new Error("Missing NEXUS_API_KEY Convex environment variable")
    }

    const event: EventInfo | null = await ctx.runQuery(internal.nexus.eventInfo, {
      eventId: args.eventId,
    })
    if (!event) {
      throw new Error("Event not found")
    }

    const response = await fetch(
      `https://frc.nexus/api/v1/event/${encodeURIComponent(event.eventKey)}/pits`,
      { headers: { "Nexus-Api-Key": apiKey } },
    )
    const text = await response.text()
    const payload = parseJson(text)

    if (!response.ok) {
      const message = extractMessage(payload) ?? text.trim() ?? `Nexus returned ${response.status}`
      if (response.status === 404) {
        return { eventKey: event.eventKey, pits: [], message }
      }
      throw new Error(message)
    }

    const pits = normalizePits(payload)
    return {
      eventKey: event.eventKey,
      pits,
      message: pits.length > 0 ? undefined : "Nexus returned no pit map entries.",
    }
  },
})

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function extractMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload
  }
  if (!isRecord(payload)) {
    return null
  }
  for (const key of ["message", "error", "detail"]) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function normalizePits(payload: unknown) {
  const rows = findRows(payload)
  const pits = rows.map(normalizePit).filter((pit): pit is PitMapEntry => pit !== null)
  return pits.sort((left, right) => left.teamNumber - right.teamNumber)
}

function findRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }
  if (!isRecord(payload)) {
    return []
  }

  for (const key of ["pits", "pitMap", "pit_map", "teams", "data"]) {
    const value = payload[key]
    if (Array.isArray(value)) {
      return value
    }
  }

  return Object.entries(payload).map(([key, value]) =>
    isRecord(value) ? { teamNumber: key, ...value } : { teamNumber: key, location: value },
  )
}

function normalizePit(row: unknown): PitMapEntry | null {
  if (!isRecord(row)) {
    return null
  }

  const teamNumber = firstNumber(row, [
    "teamNumber",
    "team_number",
    "frcTeamNumber",
    "frc_team_number",
    "team",
    "number",
  ])
  if (teamNumber === null) {
    return null
  }

  const location =
    firstText(row, [
      "pit",
      "pitNumber",
      "pit_number",
      "pitLocation",
      "pit_location",
      "location",
      "station",
      "booth",
      "table",
      "row",
      "column",
    ]) ?? "Pit listed"

  return { teamNumber, location }
}

function firstNumber(row: NexusRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string") {
      const match = value.match(/\d+/)
      if (match) {
        return Number(match[0])
      }
    }
  }
  return null
}

function firstText(row: NexusRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value)
    }
  }
  return null
}

function isRecord(value: unknown): value is NexusRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
