import { describe, expect, it } from "vitest"
import { endActivityAt, matchPhase, matchShift } from "./match-activity"

describe("match activity timing", () => {
  it("shows the three second gap between auto and teleop", () => {
    expect(matchPhase(19_999)).toBe("Auto")
    expect(matchPhase(20_000)).toBe("3-second gap")
    expect(matchPhase(22_999)).toBe("3-second gap")
    expect(matchPhase(23_000)).toBe("Teleop")
    expect(matchPhase(133_000)).toBe("Endgame")
    expect(matchPhase(169_999)).toBe("Endgame")
    expect(matchPhase(170_000)).toBe("Match complete")
  })

  it("stops an auto action at the gap rather than carrying it into teleop", () => {
    expect(endActivityAt({ action: "Scoring", startMs: 1_000, endMs: 1_000 }, 25_000)).toBe(20_000)
    expect(endActivityAt({ action: "Scoring", startMs: 23_000, endMs: 23_000 }, 25_000)).toBe(25_000)
  })

  it("counts the transition and four shifts from the auto winner", () => {
    expect(matchShift(23_000, "red")).toMatchObject({ label: "Transition shift", endsAtMs: 33_000, inactiveHub: null })
    expect(matchShift(33_000, "red")).toMatchObject({ label: "Shift 1", endsAtMs: 58_000, inactiveHub: "red" })
    expect(matchShift(58_000, "red")).toMatchObject({ label: "Shift 2", inactiveHub: "blue" })
    expect(matchShift(83_000, "red")).toMatchObject({ label: "Shift 3", inactiveHub: "red" })
    expect(matchShift(108_000, "red")).toMatchObject({ label: "Shift 4", inactiveHub: "blue" })
    expect(matchShift(133_000, "red")).toMatchObject({ label: "Endgame", inactiveHub: null })
    expect(matchShift(33_000, null)).toMatchObject({ label: "Shift 1", inactiveHub: null })
  })
})
