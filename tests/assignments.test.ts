import { describe, expect, it } from "vitest";
import { applyCells, cellValue, competingGroup, dutyLoads, groupTotals, normalizeAssignments, setStation, type GeneratedAssignment, type Task } from "@/lib/assignments";
import { parseDraft } from "@/lib/draft";
import { validateRound, type RoundRules } from "@/lib/validation";

function person(id: string, group: number | null, extra: Partial<GeneratedAssignment> & { duties?: Task[] } = {}): GeneratedAssignment {
  const { duties = [], ...rest } = extra;
  return { id: `333-r1:${id}`, roundId: "333-r1", eventId: "333", personId: id, name: `Persona ${id}`, inRound: true, seedResult: 1000, tasks: [...(group ? [{ group, role: "competitor" as const }] : []), ...duties], ...rest };
}

const options = { stations: 3, fixedStations: false };
const rules: RoundRules = { groups: 2, scramblers: 1, runners: 0, stations: 3, fixedStations: false, checkJudges: false, checkDelegates: false, checkDataEntry: false, noNormalTasks: new Set() };

describe("applyCells", () => {
  it("adds, replaces and clears any task", () => {
    let rows = [person("a", 1)];
    rows = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "judge", options).assignments;
    expect(cellValue(rows[0], 2)).toBe("judge");
    rows = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "delegate", options).assignments;
    expect(cellValue(rows[0], 2)).toBe("delegate");
    rows = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "", options).assignments;
    expect(rows[0].tasks).toEqual([{ group: 1, role: "competitor" }]);
  });

  it("lets you remove the competitor task", () => {
    const result = applyCells([person("a", 1)], [{ id: "333-r1:a", group: 1 }], "", options);
    expect(result.changed).toBe(1);
    expect(result.assignments[0].tasks).toEqual([]);
  });

  it("lets you turn the competing cell into a duty", () => {
    const result = applyCells([person("a", 1)], [{ id: "333-r1:a", group: 1 }], "judge", options);
    expect(result.assignments[0].tasks).toEqual([{ group: 1, role: "judge" }]);
  });

  it("moves the competitor when a single cell of the row gets C", () => {
    const result = applyCells([person("a", 1, { duties: [{ group: 3, role: "judge" }] })], [{ id: "333-r1:a", group: 2 }], "competitor", options);
    expect(result.assignments[0].tasks).toEqual([{ group: 2, role: "competitor" }, { group: 3, role: "judge" }]);
  });

  it("allows competing in several groups when several cells of the row are chosen (reported by the validator)", () => {
    const result = applyCells([person("a", null)], [{ id: "333-r1:a", group: 1 }, { id: "333-r1:a", group: 2 }], "competitor", options);
    expect(result.assignments[0].tasks.filter(task => task.role === "competitor")).toHaveLength(2);
  });

  it("keeps the station when moving, if it is free in the new group", () => {
    const rows = [person("a", 1, { station: 2 }), person("b", 2, { station: 1 })];
    const fixed = { stations: 3, fixedStations: true };
    let result = applyCells(rows, [{ id: "333-r1:a", group: 2 }], "competitor", fixed).assignments;
    expect(result[0].station).toBe(2);
    result = applyCells(result, [{ id: "333-r1:a", group: 1 }], "", fixed).assignments;
    expect(result[0].station).toBe(2);
  });

  it("keeps the station while the person has no group, and takes the first free one if it is taken", () => {
    const rows = [person("a", 1, { station: 1 }), person("b", 2, { station: 1 }), person("c", 2, { station: 3 })];
    const fixed = { stations: 3, fixedStations: true };
    let result = applyCells(rows, [{ id: "333-r1:a", group: 1 }], "", fixed).assignments;
    expect(result[0].station).toBe(1);
    result = applyCells(result, [{ id: "333-r1:a", group: 2 }], "competitor", fixed).assignments;
    expect(result[0].station).toBe(2);
  });

  it("sets stations by hand", () => {
    const rows = [person("a", 1, { station: 1 })];
    expect(setStation(rows, "333-r1:a", 7)[0].station).toBe(7);
    expect(setStation(rows, "333-r1:a", undefined)[0].station).toBeUndefined();
    expect(setStation(rows, "333-r1:a", 1)).toBe(rows);
  });

  it("returns the same array when nothing changes", () => {
    const rows = [person("a", 1)];
    expect(applyCells(rows, [{ id: "333-r1:a", group: 1 }], "competitor", options).assignments).toBe(rows);
  });
});

describe("totals", () => {
  it("counts every task per group and duties per person", () => {
    const rows = [person("a", 1, { duties: [{ group: 2, role: "scrambler" }] }), person("b", 2, { duties: [{ group: 1, role: "dataentry" }] })];
    const [g1, g2] = groupTotals(rows, 2);
    expect([g1.counts.competitor, g1.counts.dataentry, g2.counts.competitor, g2.counts.scrambler]).toEqual([1, 1, 1, 1]);
    expect(dutyLoads([...rows, { ...rows[0], id: "222-r1:a", roundId: "222-r1" }]).get("a")).toBe(2);
  });
});

describe("validateRound", () => {
  const codes = (rows: GeneratedAssignment[], overrides: Partial<RoundRules> = {}) => validateRound("333-r1", rows, { ...rules, ...overrides }).map(issue => issue.code);
  const ok = () => [person("a", 1, { duties: [{ group: 2, role: "scrambler" }] }), person("b", 2, { duties: [{ group: 1, role: "scrambler" }] })];

  it("accepts a correct round, including work right before competing", () => {
    expect(codes(ok())).toEqual([]);
  });

  it("warns once for the round when the stages' maximums leave no seat for everyone", () => {
    const rows = [person("a", 1), person("b", 1), person("c", 2)];
    expect(codes(rows, { groups: 2, byGroup: { 1: { maxPerGroup: 1 }, 2: { maxPerGroup: 1 } } })).toContain("round-over-limit");
    expect(codes(rows, { groups: 2, byGroup: { 1: { maxPerGroup: 1 }, 2: { maxPerGroup: 1 } } })).not.toContain("over-group-limit");
    expect(codes(rows, { groups: 2, byGroup: { 1: { maxPerGroup: 1 }, 2: { maxPerGroup: 2 } } })).toEqual(expect.arrayContaining(["over-group-limit"]));
  });

  it("reports someone in the round without a group as an error", () => {
    const issues = validateRound("333-r1", [...ok(), person("c", null)], rules);
    expect(issues.map(issue => [issue.severity, issue.code])).toEqual([["error", "no-group"]]);
  });

  it("does not expect a group from people who only work", () => {
    expect(codes([...ok(), person("c", null, { inRound: false, duties: [{ group: 1, role: "judge" }] })])).toEqual([]);
  });

  it("reports competing in several groups and out-of-range groups", () => {
    const rows = [...ok(), person("c", 1, { duties: [{ group: 3, role: "competitor" }] })];
    expect(codes(rows)).toEqual(expect.arrayContaining(["several-groups", "group-out-of-range"]));
  });

  it("flags duplicate, missing and out-of-range stations", () => {
    const rows = [person("a", 1, { station: 1 }), person("b", 1, { station: 1 }), person("c", 1), person("e", 1, { station: 2 }), person("d", 2, { station: 9 })];
    expect(codes(rows, { fixedStations: true })).toEqual(expect.arrayContaining(["duplicate-station", "missing-station", "station-out-of-range", "over-capacity"]));
  });

  it("reports missing staff, delegates and data entry as warnings", () => {
    const issues = validateRound("333-r1", [person("a", 1), person("b", 1)], { ...rules, groups: 2, checkJudges: true, runners: 1, checkDelegates: true, checkDataEntry: true });
    expect(issues.map(issue => [issue.severity, issue.code, issue.group])).toEqual([
      ["warning", "missing-scramblers", 1],
      ["warning", "missing-judges", 1],
      ["warning", "missing-runners", 1],
      ["warning", "missing-delegate", 1],
      ["warning", "missing-dataentry", 1],
      ["warning", "empty-group", 2],
    ]);
  });

  it("warns when someone with a busy role gets a normal task", () => {
    expect(codes(ok(), { noNormalTasks: new Set(["a"]) })).toEqual(["role-with-normal-task"]);
  });
});

describe("drafts", () => {
  it("migrates the single-duty array format", () => {
    const legacy = [{ id: "333-r1:a", roundId: "333-r1", eventId: "333", personId: "a", name: "A", group: 1, dutyGroup: 2, dutyRole: "judge" }];
    expect(parseDraft(JSON.stringify(legacy))?.assignments[0]).toMatchObject({ inRound: true, tasks: [{ group: 1, role: "competitor" }, { group: 2, role: "judge" }] });
  });

  it("migrates version 2 drafts and drops their settings", () => {
    const v2 = { version: 2, settings: { stations: 9 }, assignments: [{ id: "333-r1:a", roundId: "333-r1", eventId: "333", personId: "a", name: "A", group: 2, duties: [{ group: 1, role: "scrambler" }] }] };
    const draft = parseDraft(JSON.stringify(v2));
    expect(draft?.settings).toBeUndefined();
    expect(competingGroup(draft!.assignments[0])).toBe(2);
  });

  it("treats unreadable drafts as missing", () => {
    expect(parseDraft("{nope")).toBeUndefined();
    expect(parseDraft(JSON.stringify({ version: 99 }))).toBeUndefined();
    expect(parseDraft(null)).toBeUndefined();
  });

  it("leaves current-format rows untouched", () => {
    expect(normalizeAssignments([person("a", 1)])).toEqual([person("a", 1)]);
  });
});

describe("drafts with the old team-to-room choice", () => {
  it("drop the copied room team and keep the team's room in its setup", () => {
    const schedule = { timeZone: "UTC", days: [], rooms: [], activities: [], blocks: [] };
    const draft = {
      version: 3,
      assignments: [],
      settings: {
        pro: {
          enabled: true,
          schedule,
          people: { propertyKeys: ["team"], properties: {}, volunteers: [], unavailable: [], teamRoles: { property: "team", map: { "Side room": "lane:2:room" } } },
          segments: [{ id: "s1", name: "Equipo: Side room", match: "all", rules: [{ kind: "property", key: "team", op: "eq", value: "Side room" }] }, { id: "s2", name: "Jueces", match: "all", rules: [] }],
          staffing: { "2:room": { team: "s1", stations: 6 }, "1:1": { team: "s2" } },
        },
      },
    };
    const pro = parseDraft(JSON.stringify(draft))!.settings!.pro!;
    expect(pro.staffing).toEqual({ "2:room": { stations: 6 }, "1:1": { team: "s2" } });
    expect(pro.people?.teams?.setup["Side room"]).toEqual({ kind: "volunteer", lane: "2:room", laneOnly: true });
  });
});
