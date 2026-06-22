import { useAuthActions } from "@convex-dev/auth/react"
import { useQuery } from "convex/react"
import { Menu, MonitorCog, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { NavLink, Outlet } from "react-router"
import { api } from "../../convex/_generated/api"
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
  { to: "/pick-lists", label: "Pick Lists" },
  { to: "/event", label: "Event Setup" },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {navItems.map((item) => (
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
  const { activeEvent } = useActiveEvent()

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-4">
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
              <Menu aria-hidden="true" />
              <span className="sr-only">Menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader>
                <SheetTitle>2026 Scouting</SheetTitle>
              </SheetHeader>
              <nav className="grid gap-1 px-3">
                <NavItems />
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
          <nav className="hidden items-center gap-1 md:flex">
            <NavItems />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {me?.role ?? "scout"}
            </span>
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
