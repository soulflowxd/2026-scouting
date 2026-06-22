type GlobalWithProcess = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}

const convexSiteUrl =
  (globalThis as GlobalWithProcess).process?.env?.CONVEX_SITE_URL ?? ""

export default {
  providers: [
    {
      domain: convexSiteUrl,
      applicationID: "convex",
    },
  ],
}
