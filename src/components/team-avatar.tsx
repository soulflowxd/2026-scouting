import { Bot } from "lucide-react"
import { useState } from "react"

export function TeamAvatar({ teamNumber, year = new Date().getFullYear(), avatar }: { teamNumber: number; year?: number; avatar?: string }) {
  const [failed, setFailed] = useState<string>()
  const source = avatar ?? `https://www.thebluealliance.com/avatar/${year}/frc${teamNumber}.png`
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted">
    {failed !== source ? <img src={source} alt={`Team ${teamNumber} logo`} width={40} height={40} loading="lazy" className="size-10 rounded-md object-contain" onError={() => setFailed(source)} /> : <Bot className="size-5 text-muted-foreground" aria-label={`Team ${teamNumber}`} />}
  </span>
}
