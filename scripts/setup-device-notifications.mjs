import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import webPush from "web-push"

// Keep the private signing key out of files, shell arguments, and console output.
const localEnv = readFileSync(".env.local", "utf8")
const url = localEnv.match(/^VITE_CONVEX_URL=["']?([^\s"']+)/m)?.[1]
if (!url) throw new Error("VITE_CONVEX_URL is required")
const env = { ...process.env, CONVEX_DEPLOYMENT: `prod:${new URL(url).hostname.split(".")[0]}` }
const cli = "node_modules/convex/bin/main.js"
function existing(name) {
  const result = spawnSync(process.execPath, [cli, "env", "get", name], { env, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`Could not check ${name}; verify Convex access before setting keys`)
  return result.stdout.trim()
}
const publicKey = existing("VAPID_PUBLIC_KEY")
const privateKey = existing("VAPID_PRIVATE_KEY")
if (!!publicKey !== !!privateKey) throw new Error("Only one VAPID key exists; repair the configuration without rotating subscribed devices")
if (!publicKey) {
  const keys = webPush.generateVAPIDKeys()
  for (const [name, value] of [["VAPID_PUBLIC_KEY", keys.publicKey], ["VAPID_PRIVATE_KEY", keys.privateKey]]) {
    const result = spawnSync(process.execPath, [cli, "env", "set", name], { env, input: value, encoding: "utf8" })
    if (result.status !== 0) throw new Error(`Could not configure ${name}`)
  }
}
console.log("Device notification signing keys are configured in Convex.")
