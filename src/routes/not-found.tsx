import { ArrowLeft, ArrowRight } from "lucide-react"
import { Link, useNavigate } from "react-router"
import { Button, buttonVariants } from "@/components/ui/button"

export function NotFoundRoute() {
  const navigate = useNavigate()

  function goBack() {
    // Direct visits have no previous in-app page to return to.
    if (typeof window.history.state?.idx === "number" && window.history.state.idx > 0) void navigate(-1)
    else void navigate("/teams", { replace: true })
  }

  return (
    <section aria-labelledby="not-found-title" className="mx-auto flex min-h-[60svh] max-w-xl flex-col justify-center py-12">
      <p className="text-8xl font-semibold tracking-tighter text-muted-foreground/40 sm:text-9xl">404</p>
      <h1 id="not-found-title" className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">This page is off the field.</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">We couldn’t find that page. The link may be outdated, or the address may have a typo. Your scouting data is still here.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link to="/teams" className={buttonVariants({ size: "lg" })}>Back to teams<ArrowRight aria-hidden="true" /></Link>
        <Button variant="outline" size="lg" onClick={goBack}><ArrowLeft aria-hidden="true" />Go back</Button>
      </div>
      <nav aria-label="Scouting shortcuts" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t pt-5 text-sm text-muted-foreground">
        <Link to="/matches" className="rounded hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Match scouting</Link>
        <Link to="/pit" className="rounded hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Pit scouting</Link>
        <Link to="/team-mash" className="rounded hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Rank teams</Link>
      </nav>
    </section>
  )
}
