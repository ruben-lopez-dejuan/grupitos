import { describe, expect, it } from "vitest";
import { applyCells, cellValue, dutyLoads, groupTotals, normalizeAssignments, type GeneratedAssignment } from "@/lib/assignments";
import { parseDraft } from "@/lib/draft";
import { validateRound, type RoundRules } from "@/lib/validation";

function person(id: string, group: number, extra: Partial<GeneratedAssignment> = {}): GeneratedAssignment {
  return { id: `333-r1:${id}`, roundId: "333-r1", eventId: "333", personId: id, name: `Persona ${id}`, group, duties: [], seedResult: 1000, ...extra };
}

const options = { stations: 3, fixedStations: false };
const rules: RoundRules = { groups: 2, scramblers: 1, runners: 0, stations: 3, fixedStations: false, checkJudges: false, avoidBeforeOwnGroup: true };

describe("applyCells", () => {
  it("adds, replaces and clears duties", () => {
    let rows = [person("a", 1)];
    rows = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "judge", options).assignments;
    expect(cellValue(rows[0], 2)).toBe("judge");
    rows = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "scrambler", options).assignments;
    expect(rows[0].duties).toEqual([{ group: 2, role: "scrambler" }]);
    rows = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "", options).assignments;
    expect(rows[0].duties).toEqual([]);
  });

  it("refuses a duty on the cell where the person competes", () => {
    const rows = [person("a", 1)];
    const result = applyCells(rows, [{ id: "333-r1:a", group: 1 }], "judge", options);
    expect(result).toMatchObject({ changed: 0, skipped: 1 });
    expect(result.assignments).toBe(rows);
  });

  it("never clears the competing cell", () => {
    const result = applyCells([person("a", 1)], [{ id: "333-r1:a", group: 1 }], "", options);
    expect(result.assignments[0].group).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("moves the competing group and drops a duty in the new group", () => {
    const rows = [person("a", 1, { duties: [{ group: 2, role: "judge" }] })];
    const result = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "competitor", options);
    expect(result.assignments[0]).toMatchObject({ group: 2, duties: [] });
  });

  it("ignores a competitor move with several cells in the same row", () => {
    const result = applyCells([person("a", 1)], [{ id: "333-r1:a", group: 2 }, { id: "333-r1:a", group: 3 }], "competitor", options);
    expect(result).toMatchObject({ changed: 0, skipped: 2 });
  });

  it("gives the first free station when moving with fixed stations", () => {
    const rows = [person("a", 1, { station: 1 }), person("b", 2, { station: 1 }), person("c", 2, { station: 3 })];
    const result = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "competitor", { stations: 3, fixedStations: true });
    expect(result.assignments[0].station).toBe(2);
  });

  it("applies a batch across rows and counts what changed", () => {
    const rows = [person("a", 1), person("b", 1), person("c", 2)];
    const result = applyCells(rows, rows.map(row => ({ id: row.id, group: 2 })), "judge", options);
    expect(result).toMatchObject({ changed: 2, skipped: 1 });
    expect(result.assignments[2]).toBe(rows[2]);
  });
});

describe("totals", () => {
  it("counts competitors and duties per group", () => {
    const rows = [person("a", 1, { duties: [{ group: 2, role: "scrambler" }] }), person("b", 2, { duties: [{ group: 1, role: "judge" }] }), person("c", 2, { duties: [{ group: 1, role: "runner" }] })];
    expect(groupTotals(rows, 2)).toEqual([
      { group: 1, competitors: 1, judges: 1, scramblers: 0, runners: 1 },
      { group: 2, competitors: 2, judges: 0, scramblers: 1, runners: 0 },
    ]);
    expect(dutyLoads([...rows, { ...rows[0], id: "222-r1:a", roundId: "222-r1" }]).get("a")).toBe(2);
  });
});

describe("validateRound", () => {
  const codes = (rows: GeneratedAssignment[], overrides: Partial<RoundRules> = {}) => validateRound("333-r1", rows, { ...rules, ...overrides }).map(issue => issue.code);

  it("accepts a correct round", () => {
    expect(codes([person("a", 1, { duties: [{ group: 2, role: "scrambler" }] }), person("b", 2, { duties: [{ group: 1, role: "scrambler" }] })], { avoidBeforeOwnGroup: false })).toEqual([]);
  });

  it("flags hard-rule breaks as errors", () => {
    const issues = validateRound("333-r1", [person("a", 3, { duties: [{ group: 3, role: "judge" }] })], rules);
    expect(issues.filter(issue => issue.severity === "error").map(issue => issue.code)).toEqual(expect.arrayContaining(["group-out-of-range", "duty-out-of-range", "duty-while-competing"]));
  });

  it("flags duplicate, missing and out-of-range stations", () => {
    const rows = [person("a", 1, { station: 1 }), person("b", 1, { station: 1 }), person("c", 1), person("e", 1, { station: 2 }), person("d", 2, { station: 9 })];
    expect(codes(rows, { fixedStations: true })).toEqual(expect.arrayContaining(["duplicate-station", "duplicate-station", "missing-station", "station-out-of-range", "over-capacity"]));
  });

  it("reports missing staff and empty groups as warnings", () => {
    const issues = validateRound("333-r1", [person("a", 1), person("b", 1)], { ...rules, groups: 3, checkJudges: true, runners: 1 });
    expect(issues.map(issue => [issue.severity, issue.code, issue.group])).toEqual([
      ["warning", "missing-scramblers", 1],
      ["warning", "missing-judges", 1],
      ["warning", "missing-runners", 1],
      ["warning", "empty-group", 2],
      ["warning", "empty-group", 3],
    ]);
  });

  it("reports scramblers without results and work right before competing", () => {
    const rows = [person("a", 2, { seedResult: undefined, duties: [{ group: 1, role: "scrambler" }] }), person("b", 1, { duties: [{ group: 2, role: "scrambler" }] })];
    expect(codes(rows, { groups: 3 })).toEqual(["scrambler-without-result", "empty-group", "works-before-competing"]);
    expect(codes(rows, { groups: 3, avoidBeforeOwnGroup: false })).toEqual(["scrambler-without-result", "empty-group"]);
  });

  it("does not report work right before competing with two groups, where it is unavoidable", () => {
    const rows = [person("a", 2, { duties: [{ group: 1, role: "scrambler" }] }), person("b", 1, { duties: [{ group: 2, role: "scrambler" }] })];
    expect(codes(rows)).toEqual([]);
  });
});

describe("drafts", () => {
  it("migrates the legacy single-duty array format", () => {
    const legacy = [{ ...person("a", 1), duties: undefined, dutyGroup: 2, dutyRole: "judge" }];
    const draft = parseDraft(JSON.stringify(legacy));
    expect(draft?.assignments[0]).toEqual({ ...person("a", 1), duties: [{ group: 2, role: "judge" }] });
  });

  it("treats unreadable drafts as missing", () => {
    expect(parseDraft("{nope")).toBeUndefined();
    expect(parseDraft(JSON.stringify({ version: 99 }))).toBeUndefined();
    expect(parseDraft(null)).toBeUndefined();
  });

  it("normalizes in place without touching current-format rows", () => {
    expect(normalizeAssignments([person("a", 1)])).toEqual([person("a", 1)]);
  });
});
