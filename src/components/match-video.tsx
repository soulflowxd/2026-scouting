import { ExternalLink, Video } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

export function MatchVideoLink({ videoUrl, matchNumber, label = "Watch video", compact = false, title }: { videoUrl: string; matchNumber: number; label?: string; compact?: boolean; title?: string }) {
  return <a href={videoUrl} target="_blank" rel="noopener noreferrer" title={title} className={compact
    ? "inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-6"
    : buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 max-w-full whitespace-normal text-left sm:min-h-8" })} aria-label={`Watch QM${matchNumber} video on Google Drive (opens in a new tab)`}>
    <Video className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />{label}{!compact && <ExternalLink className="size-3" aria-hidden="true" />}
  </a>
}
