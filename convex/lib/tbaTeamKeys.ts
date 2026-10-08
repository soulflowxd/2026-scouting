export type TeamRemapping = Record<string, string> | null | undefined

export function eventTeamKeys(teamKey: string, remapping: TeamRemapping): string[] {
  const mapped = remapping?.[teamKey]
  return mapped && /^frc\d+[A-Za-z]*$/.test(mapped) && mapped !== teamKey
    ? [mapped, teamKey]
    : [teamKey]
}

export function eventTeamNumber(teamKey: string, remapping: TeamRemapping): number {
  const original = Object.entries(remapping ?? {}).find(([, mapped]) => mapped === teamKey)?.[0] ?? teamKey
  if (!/^frc\d+$/.test(original)) throw new Error(`Unmapped event team: ${teamKey}`)
  return Number(original.slice(3))
}

export function eventTeamValue<T>(values: Record<string, T> | undefined, keys: string[]): T | undefined {
  for (const key of keys) {
    if (values?.[key] !== undefined) return values[key]
  }
  return undefined
}
