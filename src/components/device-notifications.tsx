import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { disconnectDeviceNotifications } from "@/lib/device-notifications"

const promptStorageKey = "scouting-device-notification-prompt-session-v2"

function shouldPrompt() {
  if (typeof window === "undefined") return false
  if ("Notification" in window && Notification.permission === "granted") return false
  try { return sessionStorage.getItem(promptStorageKey) !== "done" } catch { return true }
}

function notificationError(error: unknown) {
  if (error instanceof ConvexError) {
    if (error.data === "Unsupported device notification service") {
      return "This browser's device notification service isn't supported. Open Scouting in Chrome or Edge to enable device alerts. Scout alerts inside the site still work here."
    }
    if (typeof error.data === "string") return error.data
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Allow notifications in your browser's site settings to receive device alerts."
  }
  return "Couldn't connect device notifications. Try again in Chrome or Edge. Scout alerts inside the site still work."
}
const DeviceContext = createContext<{
  enabled: boolean
  busy: boolean
  supported: boolean
  loading: boolean
  message: string | null
  toggle: () => Promise<void>
} | null>(null)

function applicationKey(value: string) {
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0))
}

export function DeviceNotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const convex = useConvex()
  const me = useQuery(api.members.me, isAuthenticated ? {} : "skip")
  const canRegister = isAuthenticated && (me?.approvalStatus === "approved" || me?.approvalStatus === "pending")
  const save = useMutation(api.pushSubscriptions.save)
  const remove = useMutation(api.pushSubscriptions.remove)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [promptOpen, setPromptOpen] = useState(shouldPrompt)
  const supported = typeof window !== "undefined" && window.isSecureContext && "Notification" in window && "PushManager" in window && "serviceWorker" in navigator

  useEffect(() => {
    let cancelled = false
    if (!supported || !canRegister) return
    async function restore() {
      await navigator.serviceWorker.register("/sw.js")
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription && Notification.permission === "granted") {
        // Keep optional notification failures out of React's render path.
        // This endpoint requires an authenticated, eligible account.
        const publicKey = await convex.query(api.pushSubscriptions.publicKey, {})
        if (cancelled) return
        if (publicKey) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey) })
      }
      if (!subscription) return
      const json = subscription.toJSON()
      if (!json.keys?.p256dh || !json.keys.auth) return
      await save({ endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth })
      if (!cancelled) {
        setEnabled(true)
        setPromptOpen(false)
      }
    }
    void restore().catch(error => { if (!cancelled) setMessage(notificationError(error)) })
    return () => { cancelled = true }
  }, [convex, save, supported, canRegister, me?.tokenIdentifier])

  function dismissPrompt() {
    try { sessionStorage.setItem(promptStorageKey, "done") } catch { /* The prompt can still be dismissed without storage. */ }
    setPromptOpen(false)
  }

  async function toggle() {
    setBusy(true)
    setMessage(null)
    try {
      if (enabled) {
        await disconnectDeviceNotifications(remove)
        setEnabled(false)
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== "granted") { setMessage("Allow notifications in your browser's site settings to receive device alerts."); return }
      if (!canRegister) { dismissPrompt(); return }
      const publicKey = await convex.query(api.pushSubscriptions.publicKey, {})
      if (!publicKey) { setMessage("Device notifications are being set up. Please try again shortly."); return }
      await navigator.serviceWorker.register("/sw.js")
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey) })
      const json = subscription.toJSON()
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Could not register this device")
      await save({ endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth })
      setEnabled(true)
      dismissPrompt()
      await registration.showNotification("Scouting device alerts enabled", {
        body: "Robot breakdown alerts will appear here. Tap a breakdown alert to complete its pit follow-up.",
        icon: "/scouting-icon.svg",
        tag: "scouting-device-enabled",
        data: { url: "/matches" },
      })
    } catch (error) {
      setMessage(notificationError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DeviceContext.Provider value={{ enabled, busy, supported, loading: isAuthenticated && me === undefined, message, toggle }}>
      {children}
      <Dialog open={promptOpen} onOpenChange={(open) => { if (!open && !busy) dismissPrompt() }}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Allow scouting notifications</DialogTitle>
            <DialogDescription>
              Turn on notifications so you don’t miss scouting alerts and robot breakdowns, even when Scouting is closed. {isAuthenticated ? "Tap a breakdown alert to record what happened at the pit." : "After you sign in, we’ll connect this device to your account."}
            </DialogDescription>
          </DialogHeader>
          {supported ? (
            <Button type="button" onClick={() => void toggle()} disabled={busy}>
              {busy ? "Connecting…" : "Allow notifications"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">On iPhone, add Scouting to your Home Screen and open it there to allow notifications. Other devices need a browser that supports notifications.</p>
          )}
          {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
          <Button type="button" variant="ghost" onClick={dismissPrompt} disabled={busy}>Not now</Button>
        </DialogContent>
      </Dialog>
    </DeviceContext.Provider>
  )
}

export function DeviceNotifications() {
  const device = useContext(DeviceContext)
  if (!device) return null
  const { enabled, busy, supported, loading, message, toggle } = device
  return (
    <div className="border-t px-3 py-3">
      {supported ? (
        <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => void toggle()} disabled={busy || loading}>
          {busy ? "Updating…" : enabled ? "Disable device notifications" : "Enable device notifications"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">For device alerts on iPhone, add Scouting to your Home Screen and open it there. Other devices need a browser that supports notifications.</p>
      )}
      {enabled && <p className="mt-2 text-xs text-muted-foreground">This device will receive breakdown alerts even when Scouting is closed.</p>}
      {message && <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
