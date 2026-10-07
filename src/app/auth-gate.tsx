import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { useMutation, useQuery } from "convex/react"
import { Clock3, Loader2, ShieldX } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type AuthGateProps = {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn, signOut } = useAuthActions()
  const ensureMe = useMutation(api.members.ensureMe)
  const me = useQuery(api.members.me, isAuthenticated ? {} : "skip")
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn")
  const [error, setError] = useState<string | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      void ensureMe().catch((caught) => {
        setAccountError(
          caught instanceof Error ? caught.message : "Could not load your account",
        )
      })
    }
  }, [ensureMe, isAuthenticated])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const formData = new FormData(event.currentTarget)
    formData.set("flow", mode)
    try {
      await signIn("password", formData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed")
    } finally {
      setPending(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid min-h-svh place-items-center bg-background text-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="grid min-h-svh place-items-center bg-background p-4 text-foreground">
        <form
          onSubmit={onSubmit}
          className="grid w-full max-w-sm gap-4 rounded-xl border bg-card p-5 shadow-sm"
        >
          <div className="grid gap-1">
            <h1 className="text-xl font-semibold">2026 Scouting</h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signIn"
                ? "Sign in to your scouting account"
                : "Create an account for an admin to approve"}
            </p>
          </div>
          {mode === "signUp" && (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">
              A minimum of 8 characters is required.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Working..." : mode === "signIn" ? "Sign in" : "Create account"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError(null)
              setMode(mode === "signIn" ? "signUp" : "signIn")
            }}
          >
            {mode === "signIn" ? "Need an account?" : "Have an account?"}
          </Button>
        </form>
      </div>
    )
  }

  if (me === undefined) {
    return (
      <div className="grid min-h-svh place-items-center bg-background text-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
    )
  }

  if (accountError) {
    return (
      <AccountStatusCard
        icon={<ShieldX className="size-6" aria-hidden="true" />}
        title="We couldn't load your account"
        description={accountError}
        onSignOut={() => void signOut()}
      />
    )
  }

  if (me.approvalStatus === "pending") {
    return (
      <AccountStatusCard
        icon={<Clock3 className="size-6" aria-hidden="true" />}
        title="Waiting for admin approval"
        description="Your account was created successfully. An admin needs to approve it before you can use scouting."
        onSignOut={() => void signOut()}
      />
    )
  }

  if (me.approvalStatus === "rejected") {
    return (
      <AccountStatusCard
        icon={<ShieldX className="size-6" aria-hidden="true" />}
        title="Account not approved"
        description="An admin has not approved this account. Ask a scouting admin if you think this is a mistake."
        onSignOut={() => void signOut()}
      />
    )
  }

  return children
}

function AccountStatusCard({
  icon,
  title,
  description,
  onSignOut,
}: {
  icon: ReactNode
  title: string
  description: string
  onSignOut: () => void
}) {
  return (
    <div className="grid min-h-svh place-items-center bg-background p-4 text-foreground">
      <div className="grid w-full max-w-md gap-4 rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="grid gap-1.5">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
