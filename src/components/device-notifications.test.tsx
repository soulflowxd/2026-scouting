import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { getFunctionName, type FunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "../../convex/_generated/api"
import { DeviceNotificationsProvider } from "./device-notifications"

const harness = vi.hoisted(() => ({
  authenticated: false,
  status: "approved",
  effects: [] as Array<() => unknown>,
  query: vi.fn(),
  useQuery: vi.fn(),
  save: vi.fn(),
  setState: vi.fn(),
}))

// Run effects explicitly so startup and service failures can be checked without
// requiring a real browser's notification permission or service worker.
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    useEffect: (effect: () => unknown) => { harness.effects.push(effect) },
    useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, harness.setState],
  }
})
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: harness.authenticated }),
  useConvex: () => ({ query: harness.query }),
  useQuery: (...args: unknown[]) => {
    harness.useQuery(...args)
    if (args[1] === "skip") return undefined
    if (getFunctionName(args[0] as FunctionReference<"query">) !== "members:me") throw new Error("Protected notification query during render")
    return { approvalStatus: harness.status, tokenIdentifier: "test-user" }
  },
  useMutation: () => harness.save,
}))
vi.mock("@/components/ui/dialog", () => {
  const Container = ({ children }: { children: ReactNode }) => children
  return { Dialog: Container, DialogContent: Container, DialogHeader: Container, DialogTitle: Container, DialogDescription: Container }
})
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", null, children),
}))

function render() {
  return renderToStaticMarkup(createElement(DeviceNotificationsProvider, null, createElement("main", null, "Sign in")))
}

describe("notification startup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.authenticated = false
    harness.status = "approved"
    harness.effects = []
    vi.stubGlobal("window", { isSecureContext: true, Notification: {} , PushManager: {} })
    vi.stubGlobal("Notification", { permission: "granted" })
    vi.stubGlobal("navigator", {
      serviceWorker: {
        register: vi.fn().mockResolvedValue(undefined),
        ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } }),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("keeps login visible and skips protected queries while signed out", () => {
    expect(render()).toContain("Sign in")
    harness.effects.forEach(effect => effect())
    expect(harness.useQuery).toHaveBeenCalledWith(api.members.me, "skip")
    expect(harness.query).not.toHaveBeenCalled()
  })

  it("does not set up push in iPhone Safari without notification support", () => {
    harness.authenticated = true
    vi.stubGlobal("window", { isSecureContext: true })
    expect(render()).toContain("Sign in")
    harness.effects.forEach(effect => effect())
    expect(harness.query).not.toHaveBeenCalled()
  })

  it("does not register rejected accounts", () => {
    harness.authenticated = true
    harness.status = "rejected"
    render()
    harness.effects.forEach(effect => effect())
    expect(harness.query).not.toHaveBeenCalled()
  })

  it.each(["approved", "pending"])("catches push setup errors for %s accounts without crashing the page", async status => {
    harness.authenticated = true
    harness.status = status
    harness.query.mockRejectedValue(new Error("Notification service unavailable"))
    expect(render()).toContain("Sign in")
    harness.effects.forEach(effect => effect())
    await vi.waitFor(() => expect(harness.setState).toHaveBeenCalledWith(expect.stringContaining("Couldn't connect device notifications")))
    expect(harness.query).toHaveBeenCalledWith(api.pushSubscriptions.publicKey, {})
    expect(harness.save).not.toHaveBeenCalled()
  })
})
