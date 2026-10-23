import { describe, expect, it } from "vitest";
import { decodeMultiResult, formatResult } from "@/lib/results";

describe("results", () => {
  it("decode multi-blind like the WCA", () => {
    expect(decodeMultiResult(650343301)).toEqual({ solved: 35, attempted: 36, seconds: 3433 });
    expect(formatResult(650343301, "333mbf")).toBe("35/36 57:13");
    // 2/2 in 1:23, and the old format 1SSAATTTTT (97 → 2 solved of 3 in 10:00).
    expect(formatResult(970008300, "333mbf")).toBe("2/2 1:23");
    expect(formatResult(1970300600, "333mbf")).toBe("2/3 10:00");
    expect(formatResult(-1, "333mbf")).toBe("—");
  });

  it("format times and FMC", () => {
    expect(formatResult(742, "333")).toBe("7.42");
    expect(formatResult(6543, "333")).toBe("1:05.43");
    expect(formatResult(2533, "333fm")).toBe("25.33");
    expect(formatResult(24, "333fm")).toBe("24");
  });
});
