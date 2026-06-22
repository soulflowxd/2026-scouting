import { ConvexReactClient } from "convex/react"

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error(
    "Missing VITE_CONVEX_URL. Run `bunx convex dev` to create a Convex deployment and write .env.local.",
  )
}

export const convex = new ConvexReactClient(convexUrl)
