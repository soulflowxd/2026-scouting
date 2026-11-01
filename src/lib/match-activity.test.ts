import { describe, expect, it } from "vitest"
import { endActivityAt, matchPhase } from "./match-activity"

describe("match activity timing", () => {
  it("shows the three second gap between auto and teleop", () => {
    expect(matchPhase(19_999)).toBe("Auto")
    expect(matchPhase(20_000)).toBe("3-second gap")
    expect(matchPhase(22_999)).toBe("3-second gap")
    expect(matchPhase(23_000)).toBe("Teleop")
    expect(matchPhase(133_000)).toBe("Endgame")
    expect(matchPhase(163_000)).toBe("Match complete")
  })

  it("stops an auto action at the gap rather than carrying it into teleop", () => {
    expect(endActivityAt({ action: "Scoring", startMs: 1_000, endMs: 1_000 }, 25_000)).toBe(20_000)
    expect(endActivityAt({ action: "Scoring", startMs: 23_000, endMs: 23_000 }, 25_000)).toBe(25_000)
  })
})
