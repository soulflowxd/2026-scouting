import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type StepperProps = {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

export function Stepper({
  id,
  label,
  value,
  min = 0,
  max = 999,
  onChange,
}: StepperProps) {
  const setValue = (next: number) => onChange(Math.max(min, Math.min(max, next)))

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="grid grid-cols-[44px_1fr_44px] gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={() => setValue(value - 1)}
        >
          <Minus aria-hidden="true" />
          <span className="sr-only">Decrease {label}</span>
        </Button>
        <Input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(Number(event.target.value) || 0)}
          className="h-11 text-center text-lg font-semibold"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={() => setValue(value + 1)}
        >
          <Plus aria-hidden="true" />
          <span className="sr-only">Increase {label}</span>
        </Button>
      </div>
    </div>
  )
}
