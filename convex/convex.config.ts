import { defineApp } from "convex/server"
import { v } from "convex/values"

const app = defineApp({
  env: {
    TBA_API_KEY: v.string(),
    STATBOTICS_API_KEY: v.optional(v.string()),
    NEXUS_API_KEY: v.optional(v.string()),
    ADMIN_EMAILS: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    JWT_PRIVATE_KEY: v.optional(v.string()),
    JWKS: v.optional(v.string()),
  },
})

export default app
