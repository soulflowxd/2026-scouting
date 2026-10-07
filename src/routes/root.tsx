import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth, useMutation, useQueries, useQuery, type RequestForQueries } from "convex/react"
import { Bell, Menu, MonitorCog, Moon, TriangleAlert, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useRef } from "react"
import { NavLink, Outlet } from "react-router"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Doc } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { eventLabel, useActiveEvent } from "@/lib/active-event"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  { to: "/event", label: "Event Setup" },
]

function NavItems({
  role,
  onNavigate,
}: {
  role?: "superAdmin" | "admin" | "scout"
  onNavigate?: () => void
}) {
  const items =
    role === "admin" || role === "superAdmin"
      ? [...navItems, { to: "/admin", label: "Admin" }]
      : navItems
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            isActive
              ? "rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground"
              : "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          }
        >
          {item.label}
        </NavLink>
      ))}
    </>
  )
}

export function RootRoute() {
  const { setTheme } = useTheme()
  const { signOut } = useAuthActions()
  const me = useQuery(api.members.me)
  const { isAuthenticated } = useConvexAuth()
  const notificationQueries = useMemo((): RequestForQueries => {
    if (!isAuthenticated) return {}
    return { mine: { query: api.notifications.mine, args: {} } }
  }, [isAuthenticated])
  const notificationResult = useQueries(notificationQueries).mine
  const notificationError = notificationResult instanceof Error
  const notifications: Doc<"scoutNotifications">[] | undefined = notificationError ? undefined : notificationResult
  const markNotificationRead = useMutation(api.notifications.markRead)
  const markAllNotificationsRead = useMutation(api.notifications.markAllRead)
  const syncBreakdownAlerts = useMutation(api.notifications.syncBreakdownAlerts)
  const { activeEvent } = useActiveEvent()
  const seenNotificationIds = useRef<Set<string> | null>(null)
  const unreadNotifications = notifications?.filter((item) => !item.readAt) ?? []

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
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-4">
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="xl:hidden" />}>
              <Menu aria-hidden="true" />
              <span className="sr-only">Menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader>
                <SheetTitle>2026 Scouting</SheetTitle>
              </SheetHeader>
              <nav className="grid gap-1 px-3">
                <NavItems role={me?.role} />
              </nav>
            </SheetContent>
          </Sheet>
          <div className="min-w-0">
            <p className="text-sm font-semibold">2026 Scouting</p>
            <p className="truncate text-xs text-muted-foreground">
              {activeEvent ? eventLabel(activeEvent) : "No event imported"}
            </p>
          </div>
          <Separator orientation="vertical" className="hidden h-5 md:block" />
          <nav className="hidden shrink-0 items-center gap-1 xl:flex">
            <NavItems role={me?.role} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {me?.role ?? "scout"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label={
                      unreadNotifications.length
                        ? `${unreadNotifications.length} unread notifications`
                        : "Notifications"
                    }
                  />
                }
              >
                <Bell aria-hidden="true" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
                    {Math.min(unreadNotifications.length, 99)}
                  </span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold">Scout alerts</p>
                    <p className="text-xs text-muted-foreground">
                      {unreadNotifications.length
                        ? `${unreadNotifications.length} need attention`
                        : "You're all caught up"}
                    </p>
                  </div>
                  {unreadNotifications.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void markAllNotificationsRead()}
                    >
                      Mark all read
                    </Button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto p-1.5">
                  {notificationError && <p role="alert" className="px-3 py-2 text-sm text-muted-foreground">Notifications are temporarily unavailable.</p>}
                  {!notificationError && notifications === undefined && (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      Loading alerts…
                    </p>
                  )}
                  {notifications?.length === 0 && (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No scout alerts yet.
                    </p>
                  )}
                  {notifications?.map((notification) => (
                    <button
                      key={notification._id}
                      type="button"
                      className="flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => void markNotificationRead({ notificationId: notification._id })}
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        <TriangleAlert className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug">{notification.message}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatNotificationTime(notification.createdAt)}
                        </span>
                      </span>
                      {!notification.readAt && (
                        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                      )}
                    </button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
                <MonitorCog aria-hidden="true" />
                <span className="sr-only">Theme</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                  <Sun aria-hidden="true" />
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                  <Moon aria-hidden="true" />
                  Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  <MonitorCog aria-hidden="true" />
                  System
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <Outlet />
      </main>
    </div>
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
