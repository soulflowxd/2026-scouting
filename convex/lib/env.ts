type GlobalWithProcess = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>
  }
}

export function readEnv(name: string) {
  return (globalThis as GlobalWithProcess).process?.env?.[name] ?? ""
}

export function readOptionalEnv(name: string) {
  const value = readEnv(name).trim()
  return value.length > 0 ? value : null
}
