import { describe, expect, it } from "vitest";
import { groupTotals } from "@/lib/assignments";
import { buildDemoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments, normalizeTaskOrder, TASK_ORDER_ITEMS, type TaskOrderItem } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, withScheduledGroups } from "@/lib/pro/schedule";
import { PROFILE_WEIGHTS } from "@/lib/pro/scoring";
import { initialRounds } from "@/lib/rounds";

describe("task order", () => {
  it("keeps a complete order of the five tasks, whatever was saved", () => {
    expect(normalizeTaskOrder(undefined)).toEqual([...TASK_ORDER_ITEMS]);
    expect(normalizeTaskOrder(["judge", "judge", "nonsense", "runner"])).toEqual(["judge", "runner", "delegate", "scrambler", "dataentry"]);
  });

  // Twelve people in two groups of six, with six stations: six free people for ten seats per group.
  const competition = buildDemoCompetition({ id: "Short", name: "Short", people: 12, events: ["333"], newcomerShare: 0, seed: 6 });
  // No delegates or organizers, so all six people of the other group are free for tasks.
  const people = { ...peopleFromWcif(competition), roles: {}, delegateDutyIds: [] };
  const schedule = { timeZone: "UTC", days: ["2026-02-21"], rooms: [{ id: 1, name: "Sala", color: "#2563eb", stages: [] }], activities: [], blocks: [{ id: "a", activityCode: "333-r1", roomId: 1, start: "2026-02-21T10:00", end: "2026-02-21T11:00", groups: 2 }] };
  const slots = groupSlots(schedule);
  const rounds = withScheduledGroups(initialRounds(competition, 6, "fixed"), slots).map(round => ({ ...round, groups: 2, scramblers: 2, runners: 2 }));
  const totals = (taskOrder: TaskOrderItem[], scoring: boolean) => {
    const assignments = generateAssignments({ competition, rounds, stations: 6, zoneMode: "fixed", people, options: { ...DEFAULT_OPTIONS, sortingRule: "symmetric", taskOrder }, slots, scoring: scoring ? { enabled: true, weights: PROFILE_WEIGHTS.balanced } : undefined });
    return groupTotals(assignments.filter(item => item.roundId === "333-r1"), 2).map(({ counts }) => [counts.scrambler, counts.runner, counts.judge]);
  };

  it.each([false, true])("fills the first tasks first when people run short (scoring: %s)", scoring => {
    const scramblersFirst = totals(["delegate", "scrambler", "dataentry", "runner", "judge"], scoring);
    const judgesFirst = totals(["judge", "runner", "delegate", "scrambler", "dataentry"], scoring);
    for (const [scramblers, runners, judges] of scramblersFirst) expect([scramblers, runners, judges]).toEqual([2, 2, 2]);
    for (const [scramblers, runners, judges] of judgesFirst) expect([scramblers, runners, judges]).toEqual([0, 0, 6]);
  });
});

describe("delegate duty later in the order", () => {
  it("still gives every group a delegate when one is free", () => {
    const competition = buildDemoCompetition({ id: "Late", name: "Late", people: 60, events: ["333", "222"], newcomerShare: 0, seed: 3 });
    const people = peopleFromWcif(competition);
    const rounds = initialRounds(competition, 8, "fixed");
    const assignments = generateAssignments({ competition, rounds, stations: 8, zoneMode: "fixed", people, options: { ...DEFAULT_OPTIONS, assignDelegateDuties: true, taskOrder: ["scrambler", "runner", "judge", "dataentry", "delegate"] } });
    for (const round of rounds.filter(item => item.competitorsKnown)) {
      for (const { counts } of groupTotals(assignments.filter(item => item.roundId === round.id), round.groups)) if (counts.competitor) expect(counts.delegate).toBe(1);
    }
  });
});
