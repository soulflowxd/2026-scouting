import { env } from "../_generated/server"

type EventReference = { eventKey: string; firstEventCode?: string }

export function firstEventReference(event: EventReference) {
  if (/^\d{4}ntx$/i.test(event.eventKey)) return null
  const year = Number(event.eventKey.slice(0, 4))
  const code = event.firstEventCode ?? (/^\d{4}txmck$/i.test(event.eventKey) ? "TXMCK" : undefined)
  if (!Number.isInteger(year) || year < 2015 || year > 2099 || !code || !/^[a-z0-9]{3,30}$/i.test(code)) return null
  return { year, code: code.toUpperCase() }
}

export function importEventReference(input: string) {
  const value = input.trim()
  if (!value.startsWith("https://")) {
    const eventKey = value.toLowerCase()
    if (!/^20\d{2}[a-z0-9]{3,30}$/.test(eventKey)) throw new Error("Enter an event key or FIRST event URL")
    return { eventKey, firstEventCode: /^\d{4}txmck$/.test(eventKey) ? "TXMCK" : undefined }
  }
  const url = new URL(value)
  const match = url.pathname.match(/^\/(20\d{2})\/([a-z0-9]{3,30})\/?$/i)
  if (url.hostname !== "frc-events.firstinspires.org" || url.port || url.username || url.password || !match) throw new Error("Enter a FIRST event URL such as https://frc-events.firstinspires.org/2026/TXMCK/")
  return { eventKey: `${match[1]}${match[2].toLowerCase()}`, firstEventCode: match[2].toUpperCase() }
}

export async function firstJson(path: string): Promise<unknown> {
  const username = env.FIRST_API_USERNAME?.trim(), token = env.FIRST_API_AUTH_TOKEN?.trim()
  if (!username || !token) throw new Error("Missing FIRST API credentials")
  const response = await fetch(`https://frc-api.firstinspires.org/v3.0/${path}`, {
    headers: { Authorization: `Basic ${btoa(`${username}:${token}`)}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`FIRST API request failed (${response.status})`)
  return response.json()
}

export function firstRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

// FIRST returns venue-local timestamps and Windows timezone names. Never use
// the server's timezone or assume every event has the same UTC offset.
const timezones: Record<string, string> = {
  "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver", "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles", "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu", "Atlantic Standard Time": "America/Halifax",
  "Newfoundland Standard Time": "America/St_Johns", "Israel Standard Time": "Asia/Jerusalem",
  "China Standard Time": "Asia/Shanghai", "Taipei Standard Time": "Asia/Taipei",
  "Korea Standard Time": "Asia/Seoul", "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney", "E. Australia Standard Time": "Australia/Brisbane",
  "New Zealand Standard Time": "Pacific/Auckland", "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin", "Romance Standard Time": "Europe/Paris",
  "SA Pacific Standard Time": "America/Bogota", "Central Standard Time (Mexico)": "America/Mexico_City",
  UTC: "UTC",
}
export function firstTimestamp(value: unknown, timezone: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return undefined
  if (/(Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp / 1000 : undefined
  }
  if (typeof timezone !== "string") return undefined
  try {
    const format = new Intl.DateTimeFormat("en-US", { timeZone: timezones[timezone] ?? timezone, timeZoneName: "longOffset" })
    const local = Date.parse(`${value}Z`)
    if (!Number.isFinite(local)) return undefined
    let utc = local
    for (let i = 0; i < 3; i++) {
      const offset = format.formatToParts(new Date(utc)).find(part => part.type === "timeZoneName")?.value ?? ""
      const match = offset.match(/^GMT([+-])(\d{2}):(\d{2})$/)
      if (offset !== "GMT" && !match) return undefined
      const minutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1) : 0
      utc = local - minutes * 60_000
    }
    return utc / 1000
  } catch { return undefined }
}
