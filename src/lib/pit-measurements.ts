export const pitMeasurements = [
  ["fuelCapacity", "Max fuel capacity (balls)", "1"],
  ["intakeBps", "Intake BPS (balls per second)", "0.1"],
  ["framePerimeter", "Frame perimeter (in)", "0.1"],
  ["frameLength", "Frame length (in)", "0.1"],
  ["frameWidth", "Frame width (in)", "0.1"],
  ["weight", "Robot weight (lb)", "0.1"],
  ["overallLength", "Overall length - bumpers + expanded hopper (in)", "0.1"],
  ["overallWidth", "Overall width - bumpers + expanded hopper (in)", "0.1"],
] as const
export type MeasurementKey = typeof pitMeasurements[number][0]
