import { spawnSync } from "node:child_process"

function convex(args, input) {
  const result = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", ...args], {
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    env: process.env,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (process.env.MATCH13_API_KEY) {
  convex(["env", "set", "MATCH13_API_KEY"], process.env.MATCH13_API_KEY.trim())
}
convex(["deploy", "--cmd", "bun run build", "--cmd-url-env-var-name", "VITE_CONVEX_URL"])
