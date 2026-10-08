import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { PasswordForm } from "@/components/password-form"

export function AccountRoute() {
  const me = useQuery(api.members.me)
  return <section className="grid gap-6">
    <h1 className="text-2xl font-semibold">Account</h1>
    <dl className="grid gap-3 border-y py-4 text-sm sm:grid-cols-3">
      <div><dt className="text-muted-foreground">Name</dt><dd>{me?.name || me?.member?.name || "Not set"}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">Email</dt><dd className="break-words">{me?.email ?? "..."}</dd></div>
      <div><dt className="text-muted-foreground">Role</dt><dd>{me?.isSuperAdmin ? "Super admin" : me?.role === "admin" ? "Admin" : "Scout"}</dd></div>
    </dl>
    <div className="grid gap-4"><h2 className="text-lg font-semibold">Change password</h2><PasswordForm /></div>
  </section>
}
