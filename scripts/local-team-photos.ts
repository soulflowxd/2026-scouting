import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import type { Plugin } from "vite"

// Dev-only media lookup: the TBA credential stays in this Node process, never
// in browser bundles or responses. No backend deployment is needed.
export function localTeamPhotos(convexUrl?: string): Plugin {
  const cache = new Map<string, { expires: number; photos: { id: string; url: string }[] }>()
  let keyPromise: Promise<string> | undefined
  return {
    name: "local-team-photos",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith("/__local/team-photos/")) return next()
        response.setHeader("Content-Type", "application/json")
        const match = /^\/__local\/team-photos\/(\d{1,5})\/(20\d{2})$/.exec(request.url)
        if (!match || request.method !== "GET") { response.statusCode = 400; response.end(JSON.stringify({ photos: [], error: "Invalid media request" })); return }
        const [, team, year] = match
        const cached = cache.get(`${team}:${year}`)
        if (cached && cached.expires > Date.now()) { response.end(JSON.stringify({ photos: cached.photos })); return }
        try {
          if (!keyPromise) keyPromise = (async () => {
            const deployment = convexUrl ? new URL(convexUrl).hostname.split(".")[0] : ""
            if (!/^[a-z0-9-]+$/.test(deployment)) throw new Error("Missing configured backend")
            const { stdout } = await promisify(execFile)(process.execPath, [path.resolve("node_modules/convex/bin/main.js"), "env", "get", "TBA_API_KEY", "--deployment", deployment], { timeout: 15000 })
            if (!stdout.trim()) throw new Error("Missing TBA credential")
            return stdout.trim()
          })()
          const key = await keyPromise
          const result = await fetch(`https://www.thebluealliance.com/api/v3/team/frc${team}/media/${year}`, { headers: { "X-TBA-Auth-Key": key }, signal: AbortSignal.timeout(10000) })
          if (!result.ok) throw new Error("Media unavailable")
          const media: unknown = await result.json()
          const photos: { id: string; url: string }[] = []
          if (Array.isArray(media)) for (const item of media) {
            if (item?.type !== "imgur" || typeof item.direct_url !== "string") continue
            const url = new URL(item.direct_url)
            if (url.protocol === "https:" && url.hostname === "i.imgur.com" && !url.username && !url.password) photos.push({ id: `tba:${item.foreign_key}`, url: url.href })
          }
          cache.set(`${team}:${year}`, { expires: Date.now() + 600000, photos: photos.slice(0, 20) })
          response.end(JSON.stringify({ photos: photos.slice(0, 20) }))
        } catch {
          keyPromise = undefined
          response.statusCode = 503
          response.end(JSON.stringify({ photos: [], error: "TBA photos are temporarily unavailable" }))
        }
      })
    },
  }
}
