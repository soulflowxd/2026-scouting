import { useAction, useMutation, useQuery } from "convex/react"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Camera, Upload, MapPinned, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Stepper } from "@/components/stepper"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { eventLabel, useActiveEvent } from "@/lib/active-event"
import { PitMap } from "@/components/pit-map"
import { PitPhotos } from "@/components/pit-photos"
import { AutoPath, type PathPoint } from "@/components/auto-path"
import { pitMeasurements, type MeasurementKey } from "@/lib/pit-measurements"
import type { NexusMap } from "../../convex/lib/nexusMap"

type PitFormState = Record<MeasurementKey, string> & {
  canScoreFuelHub: boolean
  canIntakeDepot: boolean
  canIntakeOutpost: boolean
  canIntakeFloor: boolean
  canPreload: boolean
  preloadCount: number
  canClimbLevel1: boolean
  canClimbLevel2: boolean
  canClimbLevel3: boolean
  canAutoClimbLevel1: boolean
  canCrossBump: boolean
  canCrossTrench: boolean
  drivetrain: string
  swerveType: string
  tread: string
  motorBrand: string
  robotArchitecture: string
  electricalQuality: string
  buildQuality: string
  programmingLanguage: string
  autoDescription: string
  autoScore: string
  teleopScore: string
  cyclesPerShift: string
  autoPath: PathPoint[][]
  bps: string
  notes: string
}

const emptyPitForm: PitFormState = {
  fuelCapacity: "", intakeBps: "", framePerimeter: "", frameLength: "", frameWidth: "", weight: "", overallLength: "", overallWidth: "",
  canScoreFuelHub: false,
  canIntakeDepot: false,
  canIntakeOutpost: false,
  canIntakeFloor: false,
  canPreload: false,
  preloadCount: 0,
  canClimbLevel1: false,
  canClimbLevel2: false,
  canClimbLevel3: false,
  canAutoClimbLevel1: false,
  canCrossBump: false,
  canCrossTrench: false,
  drivetrain: "",
  swerveType: "",
  tread: "",
  motorBrand: "",
  robotArchitecture: "",
  electricalQuality: "",
  buildQuality: "",
  programmingLanguage: "",
  autoDescription: "",
  autoScore: "",
  teleopScore: "",
  cyclesPerShift: "",
  autoPath: [],
  bps: "",
  notes: "",
}

export function PitScoutingRoute() {
  const { activeEvent } = useActiveEvent()
  const teams = useQuery(
    api.teams.list,
    activeEvent ? { eventId: activeEvent._id } : "skip",
  )
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const fetchPitMap = useAction(api.nexus.fetchPitMap)
  const [pitMap, setPitMap] = useState<{
    eventKey: string
    pits: { teamNumber: number; location: string }[]
    layout: NexusMap | null
    message?: string
  } | null>(null)
  const [pitMapError, setPitMapError] = useState<string | null>(null)
  const [pitMapLoading, setPitMapLoading] = useState(false)

  const pitByTeam = useMemo(
    () => new Map((pitMap?.pits ?? []).map((pit) => [pit.teamNumber, pit.location])),
    [pitMap],
  )

  const loadPitMap = useCallback(async (eventId: Id<"events">) => {
    setPitMapLoading(true)
    setPitMapError(null)
    try {
      const result = await fetchPitMap({ eventId })
      setPitMap(result)
    } catch (error) {
      setPitMap(null)
      setPitMapError(error instanceof Error ? error.message : "Could not load Nexus pit map")
    } finally {
      setPitMapLoading(false)
    }
  }, [fetchPitMap])

  useEffect(() => {
    if (activeEvent) {
      void loadPitMap(activeEvent._id)
    }
  }, [activeEvent, loadPitMap])

  if (!activeEvent) {
    return <EmptyEvent />
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Pit Scouting</h1>
        <p className="text-sm text-muted-foreground">
          {eventLabel(activeEvent)}. Pick a team, scout with taps, avoid long typing.
        </p>
      </div>
      {selectedTeam === null ? (
        <>
          <div className="grid min-w-0 gap-3 border-y py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <MapPinned className="size-5 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold">Nexus pit map</h2>
                  <p className="text-sm text-muted-foreground">
                    {pitMapLoading
                      ? "Loading from FRC Nexus..."
                      : pitMap?.layout
                        ? eventLabel(activeEvent)
                        : pitMapError ?? pitMap?.message ?? "No pit map loaded yet."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadPitMap(activeEvent._id)}
                disabled={pitMapLoading}
              >
                <RefreshCw className={pitMapLoading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                Refresh
              </Button>
            </div>
            {pitMap?.layout && pitMap.eventKey === activeEvent.eventKey ? (
              <PitMap layout={pitMap.layout} teams={teams ?? []} onSelect={setSelectedTeam} />
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(teams ?? []).map((team) => {
              const pitLocation = pitByTeam.get(team.teamNumber)
              return (
                <button
                  key={team._id}
                  type="button"
                  onClick={() => setSelectedTeam(team.teamNumber)}
                  className="grid gap-2 rounded-xl border bg-card p-4 text-left shadow-sm"
                >
                  <p className="text-xl font-semibold">{team.eventTeamAlias ?? team.teamNumber}</p>
                  <p className="text-sm text-muted-foreground">{team.nickname}</p>
                  {pitLocation ? (
                    <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-sm font-medium text-primary">
                      Pit {pitLocation}
                    </span>
                  ) : null}
                  <span className={team.pitScouted ? "text-sm text-primary" : "text-sm text-muted-foreground"}>
                    {team.pitScouted ? "Scouted" : "Not scouted"}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <PitForm
          eventId={activeEvent._id}
          teamNumber={selectedTeam}
          onBack={() => setSelectedTeam(null)}
        />
      )}
    </section>
  )
}

function PitForm({
  eventId,
  teamNumber,
  onBack,
}: {
  eventId: Id<"events">
  teamNumber: number
  onBack: () => void
}) {
  const reports = useQuery(api.pit.getForTeam, { eventId, teamNumber })
  const scoutingClosed = useQuery(api.events.list)?.find(event => event._id === eventId)?.scoutingEnabled === false
  const save = useMutation(api.pit.save)
  const generateUploadUrl = useMutation(api.pit.generateUploadUrl)
  const [photoIds, setPhotoIds] = useState<Id<"_storage">[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<PitFormState>(emptyPitForm)

  useEffect(() => {
    const latest = reports?.[0]
    setPhotoIds(latest?.photoIds ?? [])
    if (latest) {
      setForm({
        fuelCapacity: latest.fuelCapacity?.toString() ?? "",
        intakeBps: latest.intakeBps?.toString() ?? "",
        framePerimeter: latest.framePerimeter?.toString() ?? "",
        frameLength: latest.frameLength?.toString() ?? "",
        frameWidth: latest.frameWidth?.toString() ?? "",
        weight: latest.weight?.toString() ?? "",
        overallLength: latest.overallLength?.toString() ?? "",
        overallWidth: latest.overallWidth?.toString() ?? "",
        canScoreFuelHub: latest.canScoreFuelHub,
        canIntakeDepot: latest.canIntakeDepot,
        canIntakeOutpost: latest.canIntakeOutpost ?? false,
        canIntakeFloor: latest.canIntakeFloor,
        canPreload: latest.canPreload,
        preloadCount: latest.preloadCount,
        canClimbLevel1: latest.canClimbLevel1,
        canClimbLevel2: latest.canClimbLevel2,
        canClimbLevel3: latest.canClimbLevel3,
        canAutoClimbLevel1: latest.canAutoClimbLevel1,
        canCrossBump: latest.canCrossBump,
        canCrossTrench: latest.canCrossTrench,
        drivetrain: latest.drivetrain,
        swerveType: latest.swerveType ?? "",
        tread: latest.tread ?? "",
        motorBrand: latest.motorBrand ?? "",
        robotArchitecture: latest.robotArchitecture ?? "",
        electricalQuality: latest.electricalQuality?.toString() ?? "",
        buildQuality: latest.buildQuality?.toString() ?? "",
        programmingLanguage: latest.programmingLanguage ?? "",
        autoDescription: latest.autoDescription ?? "",
        autoScore: latest.autoScore === undefined ? "" : String(latest.autoScore),
        teleopScore: latest.teleopScore === undefined ? "" : String(latest.teleopScore),
        cyclesPerShift: latest.cyclesPerShift === undefined ? "" : String(latest.cyclesPerShift),
        autoPath: latest.autoPath ?? [],
        bps: latest.bps === undefined ? "" : String(latest.bps),
        notes: latest.notes,
      })
    } else {
      setForm(emptyPitForm)
    }
  }, [reports])

  const setBool = (key: keyof PitFormState, value: boolean) =>
    setForm((current) => ({ ...current, [key]: value }))

  async function uploadPhotos(files: File[]) {
    if (!files.length || uploading || saving) return
    if (photoIds.length + files.length > 6) { toast.error("Maximum 6 robot photos"); return }
    if (files.some(file => !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 10 * 1024 * 1024)) { toast.error("Choose JPG, PNG, WebP or GIF images under 10 MB"); return }
    setUploading(true)
    try {
      for (const file of files) {
        const url = await generateUploadUrl({})
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file })
        if (!response.ok) throw new Error("Photo upload failed. Try again.")
        const { storageId } = await response.json() as { storageId: Id<"_storage"> }
        setPhotoIds(current => [...current, storageId])
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Photo upload failed") }
    finally { setUploading(false) }
  }

  async function onSubmit() {
    if (uploading || saving) return
    if (!photoIds.length) { toast.error("Upload at least one robot photo before submitting"); return }
    setSaving(true)
    try {
      const bps = form.bps.trim() === "" ? undefined : Number(form.bps)
      if (bps !== undefined && (!Number.isFinite(bps) || bps < 0)) {
        toast.error("BPS must be a non-negative number")
        return
      }
      const scoring = {
        autoScore: form.autoScore.trim() ? Number(form.autoScore) : undefined,
        teleopScore: form.teleopScore.trim() ? Number(form.teleopScore) : undefined,
        cyclesPerShift: form.cyclesPerShift.trim() ? Number(form.cyclesPerShift) : undefined,
      }
      if (Object.values(scoring).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
        toast.error("Scoring and cycle counts must be non-negative numbers")
        return
      }
      const measurements = Object.fromEntries(pitMeasurements.map(([key]) => [key, form[key].trim() ? Number(form[key]) : undefined])) as Record<MeasurementKey, number | undefined>
      if (Object.values(measurements).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
        toast.error("Robot measurements must be non-negative numbers")
        return
      }
      if (measurements.fuelCapacity !== undefined && !Number.isInteger(measurements.fuelCapacity)) {
        toast.error("Fuel capacity must be a whole number")
        return
      }
      const electricalQuality = Number(form.electricalQuality)
      const buildQuality = Number(form.buildQuality)
      if ([electricalQuality, buildQuality].some(value => !Number.isInteger(value) || value < 1 || value > 10)) {
        toast.error("Rate electrical and build quality from 1 to 10")
        return
      }
      if (!form.programmingLanguage.trim()) { toast.error("Ask which programming language they use, or enter Unknown"); return }
      await save({ eventId, teamNumber, ...form, ...scoring, ...measurements, electricalQuality, buildQuality, programmingLanguage: form.programmingLanguage.trim(), bps, photoIds })
      toast.success(`Saved pit report for ${teamNumber}`)
      onBack()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    } finally { setSaving(false) }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Team {teamNumber}</h2>
          <p className="text-sm text-muted-foreground">Pit scouting form</p>
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
      <FormSection title="Robot photos">
        <p className="text-sm text-muted-foreground">{photoIds.length}/6 photos · At least 1 required</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={uploading || saving || reports === undefined || photoIds.length >= 6} onClick={() => cameraInput.current?.click()}><Camera />Take photo</Button>
          <Button type="button" variant="outline" disabled={uploading || saving || reports === undefined || photoIds.length >= 6} onClick={() => uploadInput.current?.click()}><Upload />Upload photos</Button>
        </div>
        <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" className="hidden" aria-label="Take robot photo" onChange={event => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          void uploadPhotos(files)
        }} />
        <input ref={uploadInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" aria-label="Upload robot photos" onChange={event => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          void uploadPhotos(files)
        }} />
        {uploading && <p role="status" className="text-sm text-muted-foreground">Uploading photos...</p>}
        <PitPhotos photoIds={photoIds} onRemove={uploading || saving ? undefined : id => setPhotoIds(current => current.filter(photo => photo !== id))} />
      </FormSection>
      <FormSection title="Fuel">
        <CheckRow label="Scores Fuel in Hub" checked={form.canScoreFuelHub} onChange={(value) => setBool("canScoreFuelHub", value)} />
        <CheckRow label="Intakes from Depot" checked={form.canIntakeDepot} onChange={(value) => setBool("canIntakeDepot", value)} />
        <CheckRow label="Intakes from Outpost" checked={form.canIntakeOutpost} onChange={(value) => setBool("canIntakeOutpost", value)} />
        <CheckRow label="Intakes floor/Neutral Zone" checked={form.canIntakeFloor} onChange={(value) => setBool("canIntakeFloor", value)} />
        <CheckRow label="Can preload Fuel" checked={form.canPreload} onChange={(value) => setBool("canPreload", value)} />
        <Stepper
          id="preloadCount"
          label="Preload count"
          value={form.preloadCount}
          max={8}
          onChange={(preloadCount) => setForm((current) => ({ ...current, preloadCount }))}
        />
      </FormSection>
      <FormSection title="Tower">
        <CheckRow label="Climb Level 1" checked={form.canClimbLevel1} onChange={(value) => setBool("canClimbLevel1", value)} />
        <CheckRow label="Climb Level 2" checked={form.canClimbLevel2} onChange={(value) => setBool("canClimbLevel2", value)} />
        <CheckRow label="Climb Level 3" checked={form.canClimbLevel3} onChange={(value) => setBool("canClimbLevel3", value)} />
        <CheckRow label="Auto climb Level 1" checked={form.canAutoClimbLevel1} onChange={(value) => setBool("canAutoClimbLevel1", value)} />
      </FormSection>
      <FormSection title="Mobility">
        <CheckRow label="Crosses Bump" checked={form.canCrossBump} onChange={(value) => setBool("canCrossBump", value)} />
        <CheckRow label="Crosses Trench" checked={form.canCrossTrench} onChange={(value) => setBool("canCrossTrench", value)} />
      </FormSection>
      <FormSection title="Robot configuration">
        <div className="grid gap-2">
          <Label htmlFor="drivetrain">Drivetrain</Label>
          <select
            id="drivetrain"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={form.drivetrain}
            onChange={(event) =>
              setForm((current) => ({ ...current, drivetrain: event.target.value }))
            }
          >
            <option value="">Select drivetrain</option>
            {["Swerve", "Tank", "West Coast", "Mecanum", "H-drive", "Other"].map((value) => <option key={value} value={value}>{value}</option>)}
            {form.drivetrain && !["Swerve", "Tank", "West Coast", "Mecanum", "H-drive", "Other"].includes(form.drivetrain) && <option value={form.drivetrain}>{form.drivetrain}</option>}
          </select>
        </div>
        {form.drivetrain.toLowerCase().includes("swerve") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="swerveType">Swerve type / modules</Label>
              <Input id="swerveType" value={form.swerveType} onChange={(event) => setForm((current) => ({ ...current, swerveType: event.target.value }))} placeholder="SDS MK4i, REV MAXSwerve, custom..." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tread">Swerve wheel tread</Label>
              <Input id="tread" value={form.tread} onChange={(event) => setForm((current) => ({ ...current, tread: event.target.value }))} placeholder="Brand, material, compound" />
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="motorBrand">Motor brand / models</Label>
            <Input id="motorBrand" value={form.motorBrand} onChange={(event) => setForm((current) => ({ ...current, motorBrand: event.target.value }))} placeholder="Drive, steering, shooter motors" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="robotArchitecture">Robot architecture type</Label>
            <Input id="robotArchitecture" value={form.robotArchitecture} onChange={(event) => setForm((current) => ({ ...current, robotArchitecture: event.target.value }))} placeholder="Dumper, turret, fixed shooter..." />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bps">BPS (balls per second)</Label>
            <Input id="bps" type="number" min="0" step="0.1" inputMode="decimal" value={form.bps} onChange={(event) => setForm((current) => ({ ...current, bps: event.target.value }))} />
          </div>
        </div>
      </FormSection>
      <FormSection title="Build, electrical and programming">
        <p className="text-xs text-muted-foreground">Rate quality from 1 (poor) to 10 (excellent). Check wiring, connections, mounting and overall construction.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["electricalQuality", "Electrical quality"], ["buildQuality", "Build quality"]] as const).map(([key, label]) => (
            <div key={key} className="grid gap-2">
              <Label htmlFor={key}>{label} (1–10)</Label>
              <select id={key} required value={form[key]} className="h-9 rounded-md border bg-background px-3 text-sm" onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}>
                <option value="" disabled>Choose rating</option>
                {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="programmingLanguage">What programming language do they use?</Label>
          <Input id="programmingLanguage" required maxLength={100} value={form.programmingLanguage} onChange={event => setForm(current => ({ ...current, programmingLanguage: event.target.value }))} placeholder="Java, C++, Python, LabVIEW, or Unknown" />
        </div>
      </FormSection>
      <FormSection title="Capacity and dimensions">
        <div className="grid gap-3 sm:grid-cols-2">
          {pitMeasurements.map(([key, label, step]) => <div key={key} className="grid gap-2">
            <Label htmlFor={key}>{label}</Label>
            <Input id={key} type="number" min="0" step={step} inputMode={key === "fuelCapacity" ? "numeric" : "decimal"} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
          </div>)}
        </div>
      </FormSection>
      <FormSection title="Notes">
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["autoScore", "Auto scoring (fuel)"],
            ["teleopScore", "Teleop scoring (fuel)"],
            ["cyclesPerShift", "Cycles per shift"],
          ] as const).map(([key, label]) => <div key={key} className="grid gap-2">
            <Label htmlFor={key}>{label}</Label>
            <Input id={key} type="number" min="0" step="any" inputMode="decimal" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
          </div>)}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="autoDescription">Describe their auto</Label>
          <Textarea id="autoDescription" value={form.autoDescription} onChange={(event) => setForm((current) => ({ ...current, autoDescription: event.target.value }))} placeholder="Starting positions, paths, fuel scored, intake, climb, and consistency..." rows={3} />
        </div>
        <div className="grid min-w-0 gap-2">
          <h3 className="text-sm font-medium">Auto path</h3>
          <AutoPath value={form.autoPath} onChange={(autoPath) => setForm((current) => ({ ...current, autoPath }))} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pitNotes">Robot notes</Label>
          <Textarea
            id="pitNotes"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            rows={3}
          />
        </div>
      </FormSection>
      <Button type="button" size="lg" disabled={scoutingClosed || uploading || saving || !photoIds.length || reports === undefined} onClick={() => void onSubmit()}>
        {saving ? "Saving..." : "Submit pit report"}
      </Button>
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <h3 className="font-medium">{title}</h3>
      {children}
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-lg bg-muted px-3">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span className="text-sm font-medium">{label}</span>
    </label>
  )
}

function EmptyEvent() {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h1 className="text-xl font-semibold">No event yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask an admin to import an event first.
      </p>
    </section>
  )
}
