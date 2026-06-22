import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react"
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { useMutation } from "convex/react"
import { Loader2 } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type AuthGateProps = {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn } = useAuthActions()
  const ensureMe = useMutation(api.members.ensureMe)
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      void ensureMe()
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
              Convex Auth password login
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Working..." : mode === "signIn" ? "Sign in" : "Create account"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
          >
            {mode === "signIn" ? "Need an account?" : "Have an account?"}
          </Button>
        </form>
      </div>
    )
  }

  return children
}
