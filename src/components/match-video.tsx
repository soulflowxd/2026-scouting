import { ExternalLink, Video } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

export function MatchVideoLink({ videoUrl, matchNumber, label = "Watch video" }: { videoUrl: string; matchNumber: number; label?: string }) {
  return <a href={videoUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-11 max-w-full whitespace-normal text-left sm:min-h-8" })} aria-label={`Watch QM${matchNumber} video on Google Drive (opens in a new tab)`}>
    <Video aria-hidden="true" />{label}<ExternalLink className="size-3" aria-hidden="true" />
  </a>
}
