import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth, useMutation, useQueries, useQuery, type RequestForQueries } from "convex/react"
import { Bell, Menu, MonitorCog, Moon, TriangleAlert, Sun, UserRound } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { NavLink, Outlet, useNavigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Doc } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DeviceNotifications } from "@/components/device-notifications"
import { OfflineUploads } from "@/components/offline-uploads"
import { ScoutHandoffs } from "@/components/scout-handoffs"
import { disconnectDeviceNotifications } from "@/lib/device-notifications"
import { useActiveEvent } from "@/lib/active-event"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const navItems = [
  { to: "/teams", label: "Teams" },
  { to: "/pit", label: "Pit" },
  { to: "/matches", label: "Matches" },
  { to: "/strategy", label: "Strategy Board" },
  { to: "/pick-lists", label: "Pick Lists" },
  { to: "/team-mash", label: "Rank Teams" },
  { to: "/event", label: "Event Setup" },
  { to: "/account", label: "Account" },
]

function NavItems({
  role,
  onNavigate,
  compact = false,
}: {
  role?: "superAdmin" | "admin" | "scout"
  onNavigate?: () => void
  compact?: boolean
}) {
  const items =
    role === "admin" || role === "superAdmin"
      ? [...navItems, { to: "/admin", label: "Admin" }]
      : navItems.filter(item => item.to !== "/event")
  return (
    <>
      {items.filter(item => !compact || !["/event", "/account", "/admin"].includes(item.to)).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            isActive
              ? "shrink-0 whitespace-nowrap rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground"
              : "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          }
        >
          {item.label}
        </NavLink>
      ))}
    </>
  )
}

export function RootRoute() {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { signOut } = useAuthActions()
  const me = useQuery(api.members.me)
  const acknowledgeApproval = useMutation(api.members.acknowledgeApproval)
  const { isAuthenticated } = useConvexAuth()
  const notificationQueries = useMemo((): RequestForQueries => {
    if (!isAuthenticated) return {}
    return {
      mine: { query: api.notifications.mine, args: {} },
      ...(me?.role === "admin" ? { approvals: { query: api.notifications.pendingApprovals, args: {} } } : {}),
    }
  }, [isAuthenticated, me?.role])
  const notificationResults = useQueries(notificationQueries)
  const notificationResult = notificationResults.mine
  const approvalResult = notificationResults.approvals
  const approvals: { _id: string; name: string; requestedAt: number }[] = approvalResult instanceof Error ? [] : approvalResult ?? []
  const notificationError = notificationResult instanceof Error
  const notifications: Doc<"scoutNotifications">[] | undefined = notificationError ? undefined : notificationResult
  const [selectedAlert, setSelectedAlert] = useState<Doc<"scoutNotifications"> | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const removeDevice = useMutation(api.pushSubscriptions.remove)
  const syncBreakdownAlerts = useMutation(api.notifications.syncBreakdownAlerts)
  const { activeEvent } = useActiveEvent()
  const seenNotificationIds = useRef<Set<string> | null>(null)
  const unreadNotifications = notifications ?? []
  const approvalNoticePending = me?.member?.approvalNoticePending === true
  const notificationCount = unreadNotifications.length + approvals.length + (approvalNoticePending ? 1 : 0)

  useEffect(() => {
    const notificationId = searchParams.get("breakdown")
    if (!notificationId || !notifications) return
    const alert = notifications.find((item) => item._id === notificationId)
    if (alert) setSelectedAlert(alert)
    else toast.info("This breakdown has already been followed up, or is unavailable for your account.")
    setSearchParams((params) => {
      params.delete("breakdown")
      return params
    }, { replace: true })
  }, [notifications, searchParams, setSearchParams])

  useEffect(() => {
    if (!notifications) return
    if (seenNotificationIds.current === null) {
      seenNotificationIds.current = new Set(notifications.map((item) => item._id))
      return
    }
    for (const notification of notifications) {
      if (!seenNotificationIds.current.has(notification._id)) {
        toast.warning(notification.message, {
          id: `breakdown-${notification.eventId}-${notification.matchNumber}-${notification.teamNumber}`,
          duration: 10_000,
        })
        seenNotificationIds.current.add(notification._id)
      }
    }
  }, [notifications])

  useEffect(() => {
    if (!isAuthenticated || !activeEvent) return
    void syncBreakdownAlerts({ eventId: activeEvent._id })
  }, [activeEvent, isAuthenticated, syncBreakdownAlerts])

  return (
    <div className="min-h-svh bg-background text-foreground">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <header className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-3 pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:px-4">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="xl:hidden" />}>
              <Menu aria-hidden="true" />
              <span className="sr-only">Menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 max-w-[90vw] overflow-y-auto overscroll-contain">
              <SheetHeader>
                <SheetTitle>2026 Scouting</SheetTitle>
              </SheetHeader>
              <nav aria-label="Main navigation" className="grid gap-1 px-3 pb-4">
                <NavItems role={me?.role} onNavigate={() => setMenuOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 max-w-48 flex-1 xl:flex-none">
            <p className="text-sm font-semibold">2026 Scouting</p>
            <p className="truncate text-xs text-muted-foreground">
              {activeEvent ? (activeEvent.name || activeEvent.eventKey) : "No event imported"}
            </p>
          </div>
          <Separator orientation="vertical" className="hidden h-5 md:block" />
          <nav aria-label="Main navigation" className="hidden min-w-0 items-center gap-1 overflow-x-auto xl:flex">
            <NavItems role={me?.role} compact />
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label={
                      notificationCount
                        ? `${notificationCount} unread notifications`
                        : "Notifications"
                    }
                  />
                }
              >
                <Bell aria-hidden="true" />
                {notificationCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
                    {Math.min(notificationCount, 99)}
                  </span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold">Scout alerts</p>
                    <p className="text-xs text-muted-foreground">
                      {notificationCount
                        ? `${notificationCount} need attention`
                        : "You're all caught up"}
                    </p>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto p-1.5">
                  {approvalNoticePending && <button type="button" className="block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted" onClick={() => void acknowledgeApproval().catch(() => toast.error("Could not dismiss approval notification"))}>
                    <span className="block font-medium">Your account is approved</span>
                    <span className="block">You can now start scouting.</span>
                  </button>}
                  {approvalResult instanceof Error && <p role="alert" className="px-3 py-2 text-sm text-muted-foreground">Approval alerts are temporarily unavailable.</p>}
                  {approvals.map(approval => (
                    <NavLink key={approval._id} to="/admin" className="block rounded-md px-2.5 py-2 text-sm hover:bg-muted">
                      <span className="block font-medium">Account approval needed</span>
                      <span className="block break-words">{approval.name} is waiting for approval.</span>
                      <span className="block text-xs text-muted-foreground">{formatNotificationTime(approval.requestedAt)}</span>
                    </NavLink>
                  ))}
                  {notificationError && <p role="alert" className="px-3 py-2 text-sm text-muted-foreground">Notifications are temporarily unavailable.</p>}
                  {!notificationError && notifications === undefined && (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      Loading alerts…
                    </p>
                  )}
                  {notifications?.length === 0 && approvals.length === 0 && !approvalNoticePending && (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No scout alerts yet.
                    </p>
                  )}
                  {notifications?.map((notification) => (
                    <button
                      key={notification._id}
                      type="button"
                      className="flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setSelectedAlert(notification)}
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        <TriangleAlert className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug">{notification.message}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatNotificationTime(notification.createdAt)}
                          {" · Tap to record pit follow-up"}
                        </span>
                      </span>
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Needs follow-up" />
                    </button>
                  ))}
                </div>
                <DeviceNotifications />
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
                <UserRound aria-hidden="true" />
                <span className="sr-only">Account and settings</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <p className="px-2 py-2 text-xs text-muted-foreground">{me?.isSuperAdmin ? "Super admin" : me?.role === "admin" ? "Admin" : "Scout"}</p>
                <DropdownMenuItem onClick={() => navigate("/account")}>Account</DropdownMenuItem>
                {me?.role === "admin" && <DropdownMenuItem onClick={() => navigate("/event")}>Event setup</DropdownMenuItem>}
                {me?.role === "admin" && <DropdownMenuItem onClick={() => navigate("/admin")}>Administration</DropdownMenuItem>}
                <Separator className="my-1" />
                <p className="px-2 py-1 text-xs text-muted-foreground">Appearance</p>
                <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">
                  <Sun aria-hidden="true" />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon aria-hidden="true" />
                  Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <MonitorCog aria-hidden="true" />
                  System
                </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <Separator className="my-1" />
                <DropdownMenuItem onClick={() => {
                  void disconnectDeviceNotifications(removeDevice).then(() => signOut()).catch(() => toast.error("Couldn't disconnect device alerts. Please try signing out again."))
                }}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <Dialog open={selectedAlert !== null} onOpenChange={(open) => { if (!open) setSelectedAlert(null) }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          {selectedAlert && (
            <BreakdownFollowUpForm
              key={selectedAlert._id}
              notification={selectedAlert}
              onComplete={() => setSelectedAlert(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-7xl py-4 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] outline-none sm:px-4 sm:py-6">
        {activeEvent?.scoutingEnabled === false && <p role="status" className="mb-4 rounded-lg border bg-muted px-4 py-3 text-sm">Scouting submissions are closed for this event. An admin can enable them in Event setup. Existing data remains viewable.</p>}
        <ScoutHandoffs />
        <OfflineUploads owner={isAuthenticated && me?.approvalStatus !== "pending" && me?.approvalStatus !== "rejected" ? me?.tokenIdentifier : undefined} />
        <Outlet />
      </main>
    </div>
  )
}

function BreakdownFollowUpForm({ notification, onComplete }: {
  notification: Doc<"scoutNotifications">
  onComplete: () => void
}) {
  const submit = useMutation(api.notifications.submitBreakdownFollowUp)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError(null)
    try {
      await submit({
        notificationId: notification._id,
        whatBroke: String(data.get("whatBroke") ?? ""),
        cause: String(data.get("cause") ?? ""),
        repairStatus: String(data.get("repairStatus") ?? ""),
        notes: String(data.get("notes") ?? ""),
      })
      toast.success("Breakdown follow-up saved. Alert resolved for all scouts.")
      onComplete()
    } catch {
      setError("Could not save the follow-up. Your alert is still active. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Team {notification.teamNumber} · QM{notification.matchNumber} breakdown</DialogTitle>
        <DialogDescription>
          Ask the team at their pit what happened. This alert stays active until a scout submits the follow-up.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="breakdown-what">What broke or stopped working?</Label>
        <Textarea id="breakdown-what" name="whatBroke" required maxLength={4000} placeholder="Describe the failed part or system and what the team told you." />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="breakdown-cause">What caused it?</Label>
        <Input id="breakdown-cause" name="cause" required maxLength={4000} placeholder="Cause, or unknown if the team is still investigating" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="breakdown-repair">Repair status / readiness for the next match</Label>
        <Textarea id="breakdown-repair" name="repairStatus" required maxLength={4000} placeholder="Fixed, repair in progress, or unknown? What still needs work?" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="breakdown-notes">Additional notes (optional)</Label>
        <Textarea id="breakdown-notes" name="notes" maxLength={4000} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Submit breakdown follow-up"}</Button>
      <p className="text-xs text-muted-foreground">Submitting resolves this breakdown alert for all scouts.</p>
    </form>
  )
}

function formatNotificationTime(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}
