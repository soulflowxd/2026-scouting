import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const file = join(
  process.cwd(),
  "node_modules",
  "@convex-dev",
  "auth",
  "dist",
  "react",
  "client.js",
)

if (existsSync(file)) {
  const source = readFileSync(file, "utf8")
  const patched = source
    .replaceAll('"auth:signIn"', '"auth.js:signIn"')
    .replaceAll('"auth:signOut"', '"auth.js:signOut"')

  if (patched !== source) {
    writeFileSync(file, patched)
  }
}
