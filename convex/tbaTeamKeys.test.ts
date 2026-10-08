import { expect, test } from "vitest"
import { eventTeamKeys, eventTeamNumber, eventTeamValue } from "./lib/tbaTeamKeys"

test("offseason stats resolve aliases without borrowing the main team's stats", () => {
  const remapping = { frc9988: "frc5414B" }
  const keys = eventTeamKeys("frc9988", remapping)
  expect(keys).toEqual(["frc5414B", "frc9988"])
  expect(eventTeamValue({ frc5414: 4, frc5414B: 2, frc9988: 1 }, keys)).toBe(2)
  expect(eventTeamValue({ frc9988: 0 }, keys)).toBe(0)
  expect(eventTeamValue({ frc5414: 4 }, keys)).toBeUndefined()
  expect(eventTeamNumber("frc5414B", remapping)).toBe(9988)
  expect(eventTeamNumber("frc9988", remapping)).toBe(9988)
})

test("regular teams stay unchanged and unmapped suffixes fail safely", () => {
  expect(eventTeamKeys("frc118", null)).toEqual(["frc118"])
  expect(eventTeamNumber("frc118", undefined)).toBe(118)
  expect(() => eventTeamNumber("frc118B", undefined)).toThrow("Unmapped event team")
})
