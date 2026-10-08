import { useEffect, useState } from "react"

export type TeamColors = { primary: string; secondary: string }
const cache = new Map<number, { colors?: TeamColors; expires: number }>()

export function parseTeamColors(value: unknown): Record<number, TeamColors> {
  const result: Record<number, TeamColors> = {}
  if (!value || typeof value !== "object" || !("teams" in value) || !value.teams || typeof value.teams !== "object") return result
  for (const [key, team] of Object.entries(value.teams)) {
    const number = Number(key)
    if (!Number.isInteger(number) || number < 1 || !team || typeof team !== "object" || !("colors" in team)) continue
    const colors = team.colors
    if (!colors || typeof colors !== "object" || !("primaryHex" in colors) || !("secondaryHex" in colors)) continue
    const { primaryHex, secondaryHex } = colors
    if (typeof primaryHex === "string" && typeof secondaryHex === "string" && /^#[\da-f]{6}$/i.test(primaryHex) && /^#[\da-f]{6}$/i.test(secondaryHex)) {
      result[number] = { primary: primaryHex, secondary: secondaryHex }
    }
  }
  return result
}

export function useTeamColors(teamNumbers: number[]) {
  const key = [...new Set(teamNumbers)].sort((a, b) => a - b).join(",")
  const [colors, setColors] = useState<Record<number, TeamColors>>({})
  useEffect(() => {
    const numbers = key ? key.split(",").map(Number) : []
    const controller = new AbortController()
    const current: Record<number, TeamColors> = {}
    for (const number of numbers) {
      const entry = cache.get(number)
      if (entry && entry.expires > Date.now() && entry.colors) current[number] = entry.colors
    }
    setColors(current)
    const missing = numbers.filter(number => (cache.get(number)?.expires ?? 0) <= Date.now())
    void (async () => {
      for (let offset = 0; offset < missing.length; offset += 50) {
        const batch = missing.slice(offset, offset + 50)
        const params = new URLSearchParams(batch.map(number => ["team", String(number)]))
        try {
          const response = await fetch(`https://api.frc-colors.com/v1/team?${params}`, { signal: controller.signal })
          if (!response.ok) continue
          const found = parseTeamColors(await response.json())
          if (controller.signal.aborted) return
          for (const number of batch) cache.set(number, { colors: found[number], expires: Date.now() + 60 * 60 * 1000 })
          Object.assign(current, found)
          setColors({ ...current })
        } catch { if (controller.signal.aborted) return }
      }
    })()
    return () => controller.abort()
  }, [key])
  return colors
}
