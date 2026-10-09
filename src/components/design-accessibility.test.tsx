import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, test, vi } from "vitest"
import { Stepper } from "./stepper"
import { AuthGate } from "@/app/auth-gate"
import { buttonVariants } from "./ui/button"
import { RouteError } from "@/routes/route-error"

const auth = vi.hoisted(() => ({ loading: false }))
vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: auth.loading }),
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
}))
vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }))
vi.mock("@/components/device-notifications", () => ({ DeviceNotifications: () => null }))
beforeEach(() => { auth.loading = false })

test("steppers expose numeric bounds and disable unavailable actions", () => {
  const render = (value: number) => renderToStaticMarkup(createElement(Stepper, { id: "cycles", label: "Auto cycles", value, min: 0, max: 10, onChange: vi.fn() }))
  const minimum = render(0)
  expect(minimum).toContain('for="cycles"')
  expect(minimum).toContain('type="number"')
  expect(minimum).toContain('min="0"')
  expect(minimum).toContain('max="10"')
  expect(minimum).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Decrease Auto cycles/)
  expect(render(10)).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Increase Auto cycles/)
})

test("shared large buttons and stepper icon controls use 44px sizing", () => {
  expect(buttonVariants({ size: "lg" })).toContain("h-11")
  expect(buttonVariants({ size: "icon-lg" })).toContain("size-11")
  expect(buttonVariants({ size: "default" })).toContain("h-9")
})

test("sign-in keeps persistent labels, autofill and password guidance", () => {
  const html = renderToStaticMarkup(createElement(AuthGate, { children: "Private content" }))
  expect(html).toContain('for="email"')
  expect(html).toContain('for="password"')
  expect(html).toContain('autoComplete="current-password"')
  expect(html).toContain("A minimum of 8 characters is required.")
  expect(html).not.toContain("Private content")
})

test("authentication loading has a readable screen-reader status", () => {
  auth.loading = true
  const html = renderToStaticMarkup(createElement(AuthGate, { children: "Private content" }))
  expect(html).toContain('role="status"')
  expect(html).toContain("Loading scouting…")
})

test("route errors give a readable recovery action without exposing a stack trace", () => {
  const html = renderToStaticMarkup(createElement(RouteError))
  expect(html).toContain('role="alert"')
  expect(html).toContain("This page couldn’t load")
  expect(html).toContain("Reload page")
  expect(html).toContain('href="/teams"')
})
