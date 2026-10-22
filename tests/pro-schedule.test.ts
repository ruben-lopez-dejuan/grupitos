import { describe, expect, it } from "vitest";
import stagedFixture from "@/tests/fixtures/schedule-with-rooms-and-stages.json";
import type { GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import { buildDemoCompetition, demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, importSchedule, isoToLocal, scheduleProblems, splitBlock, withScheduledGroups, type ProSchedule } from "@/lib/pro/schedule";
import { initialRounds } from "@/lib/rounds";
import { validateTimes } from "@/lib/validation";

const stages = [{ id: 1, name: "Rojo", color: "#d93636" }, { id: 2, name: "Verde", color: "#2f9e44" }];
const rooms = [{ id: 1, name: "Pabellón", color: "#2563eb", stages }, { id: 3, name: "Sala Blind", color: "#fc00df", stages: [] }];
const schedule = (blocks: ProSchedule["blocks"]): ProSchedule => ({ timeZone: "Europe/Madrid", days: ["2026-02-21"], rooms, blocks, activities: [] });
const block = (id: string, activityCode: string, laneId: number, start: string, end: string, groups: number) => ({ id, activityCode, roomId: laneId === 3 ? 3 : 1, stageId: laneId === 3 ? undefined : laneId, start: `2026-02-21T${start}`, end: `2026-02-21T${end}`, groups });

describe("times", () => {
  it("reads WCIF timestamps as wall-clock time in the venue's zone", () => {
    expect(isoToLocal("2026-02-21T09:00:00Z", "Europe/Madrid")).toBe("2026-02-21T10:00");
    expect(isoToLocal("2026-07-04T09:00:00Z", "Europe/Madrid")).toBe("2026-07-04T11:00");
    expect(isoToLocal("2026-07-04T23:30:00Z", "America/New_York")).toBe("2026-07-04T19:30");
  });

  it("splits a block into equal groups, like CompScript's CreateGroups", () => {
    expect(splitBlock({ start: "2026-02-21T10:00", end: "2026-02-21T11:30", groups: 4 }).map(window => `${window.start.slice(11)}-${window.end.slice(11)}`))
      .toEqual(["10:00-10:23", "10:23-10:45", "10:45-11:08", "11:08-11:30"]);
  });
});

describe("importSchedule", () => {
  it("keeps WCIF rooms separate from their natshelper stages", () => {
    const competition = demoCompetition("large");
    const imported = importSchedule(competition, () => 9);
    expect(imported.timeZone).toBe("Europe/Madrid");
    expect(imported.days).toEqual(["2026-11-14", "2026-11-15"]);
    expect(imported.rooms.map(room => room.name)).toEqual(["Pabellón", "Sala auxiliar"]);
    expect(imported.rooms[0].stages.map(stage => stage.name)).toEqual(["Rojo", "Verde"]);
    // First rounds are expanded over both stages; final child activities already carry their stage.
    expect(imported.blocks.filter(item => item.activityCode === "333-r1").map(item => item.groups)).toEqual([5, 5]);
    expect(imported.blocks.filter(item => item.activityCode === "333-r2").map(item => [item.roomId, item.stageId, item.groups])).toEqual([[1, 0, 2], [1, 1, 2]]);
    expect(imported.blocks[0]).toMatchObject({ start: "2026-11-14T10:00" });
    expect(imported.activities.map(item => item.kind)).toEqual(["checkin", "lunch", "checkin", "lunch", "setup", "awards"]);
  });

  it("reads exact repeated group codes per stage and a room without stages", () => {
    const imported = importSchedule(stagedFixture as StoredCompetition, () => 8);
    expect(imported.rooms).toMatchObject([
      { id: 10, name: "Main hall", stages: [{ id: 0, name: "North", groupNamePrefix: "N" }, { id: 1, name: "South" }] },
      { id: 20, name: "Side room", stages: [] },
    ]);
    expect(imported.blocks.filter(item => item.activityCode === "333-r1").map(item => [item.stageId, item.groups])).toEqual([[0, 2], [1, 2]]);
    expect(imported.blocks.find(item => item.stageId === 0)?.groupWindows).toEqual([
      { start: "2026-12-05T09:00", end: "2026-12-05T09:25" },
      { start: "2026-12-05T09:25", end: "2026-12-05T10:00" },
    ]);
    expect(imported.blocks.find(item => item.activityCode === "444bf-r1")).toMatchObject({ roomId: 20, stageId: undefined, groups: 2 });
    expect(imported.activities.map(item => item.kind)).toEqual(["multi", "setup"]);
  });

  it("keeps the groups already in the WCIF and reads multi-blind attempts", () => {
    const activity = (id: number, activityCode: string, start: string, end: string, groups = 0) => ({ id, name: activityCode, activityCode, startTime: `2026-02-21T${start}:00Z`, endTime: `2026-02-21T${end}:00Z`, childActivities: Array.from({ length: groups }, (_, index) => ({ id: id * 10 + index, name: "", activityCode: `${activityCode}-g${index + 1}`, startTime: "", endTime: "" })) });
    const competition: StoredCompetition = {
      id: "X", name: "X",
      schedule: { startDate: "2026-02-21", numberOfDays: 1, venues: [{ timezone: "UTC", rooms: [{ id: 7, name: "Sala", activities: [activity(1, "444-r1", "10:00", "11:00", 3), activity(2, "333mbf-r1-a1", "12:00", "13:00"), activity(3, "333mbf-r1-a2", "15:00", "16:00"), activity(4, "other-lunch", "13:00", "14:00")] }] }] },
    };
    const imported = importSchedule(competition, () => 1);
    expect(imported.blocks.map(item => [item.activityCode, item.groups])).toEqual([["444-r1", 3], ["333mbf-r1-a1", 1], ["333mbf-r1-a2", 1]]);
    const mbf = groupSlots(imported).get("333mbf-r1")!;
    expect(mbf).toHaveLength(1);
    expect(mbf[0].windows).toEqual([{ start: "2026-02-21T12:00", end: "2026-02-21T13:00" }, { start: "2026-02-21T15:00", end: "2026-02-21T16:00" }]);
  });
});

describe("groupSlots", () => {
  it("numbers parallel groups in time order, then stage order", () => {
    const slots = groupSlots(schedule([block("a", "444-r1", 2, "10:00", "11:20", 4), block("b", "444-r1", 1, "10:00", "11:20", 4)])).get("444-r1")!;
    expect(slots.map(slot => `G${slot.group} ${stages.find(stage => stage.id === slot.stageId)!.name} ${slot.number} ${slot.windows[0].start.slice(11)}`))
      .toEqual(["G1 Rojo 1 10:00", "G2 Verde 1 10:00", "G3 Rojo 2 10:20", "G4 Verde 2 10:20", "G5 Rojo 3 10:40", "G6 Verde 3 10:40", "G7 Rojo 4 11:00", "G8 Verde 4 11:00"]);
  });

  it("continues a stage's numbering across blocks of the same round", () => {
    const slots = groupSlots(schedule([block("a", "333-r1", 1, "10:00", "11:00", 2), block("b", "333-r1", 1, "15:00", "15:30", 1)])).get("333-r1")!;
    expect(slots.map(slot => [slot.group, slot.number, slot.windows[0].start.slice(11)])).toEqual([[1, 1, "10:00"], [2, 2, "10:30"], [3, 3, "15:00"]]);
  });

  it("gives scheduled rounds their group count", () => {
    const slots = groupSlots(schedule([block("a", "444-r1", 1, "10:00", "11:00", 3), block("b", "444-r1", 2, "10:00", "11:00", 3)]));
    expect(withScheduledGroups([{ id: "444-r1", groups: 2 }, { id: "222-r1", groups: 4 }], slots)).toEqual([{ id: "444-r1", groups: 6 }, { id: "222-r1", groups: 4 }]);
  });
});

describe("scheduleProblems", () => {
  it("reports unscheduled rounds, wrong times, shared stages and rounds out of order", () => {
    const problems = scheduleProblems(schedule([
      block("a", "333-r1", 1, "10:00", "11:00", 2),
      block("b", "333-r2", 1, "10:30", "11:30", 1),
      block("c", "444bf-r1", 3, "10:00", "11:00", 1),
      block("d", "555bf-r1", 3, "10:30", "11:30", 1),
      block("e", "222-r1", 2, "12:00", "11:00", 1),
    ]), ["333-r1", "333-r2", "444bf-r1", "555bf-r1", "222-r1", "sq1-r1"]);
    expect(problems.map(problem => [problem.code, problem.roundId])).toEqual([
      ["bad-times", "222-r1"],
      ["unscheduled", "sq1-r1"],
      ["stage-overlap", "333-r2"],
      ["stage-overlap", "555bf-r1"],
      ["before-previous-round", "333-r2"],
    ]);
  });
});

describe("validateTimes", () => {
  const row = (roundId: string, personId: string, tasks: GeneratedAssignment["tasks"]): GeneratedAssignment => ({ id: `${roundId}:${personId}`, roundId, eventId: roundId.split("-")[0], personId, name: personId, inRound: true, tasks });
  const slots = groupSlots(schedule([block("a", "444-r1", 1, "10:00", "11:00", 2), block("b", "444-r1", 2, "10:00", "11:00", 2), block("c", "444bf-r1", 3, "10:15", "10:45", 1)]));

  it("flags a task in a parallel group or another room at the same time, on both sides", () => {
    const issues = validateTimes([row("444-r1", "ana", [{ group: 1, role: "competitor" }, { group: 2, role: "judge" }]), row("444bf-r1", "ana", [{ group: 1, role: "competitor" }])], slots);
    expect(issues.map(issue => [issue.roundId, issue.group, issue.params.otherRound])).toEqual([["444-r1", 1, "444bf-r1"], ["444-r1", 2, "444-r1"], ["444bf-r1", 1, "444-r1"]]);
    expect(issues.map(issue => issue.code)).toEqual(["unavoidable-time-overlap", "time-overlap", "unavoidable-time-overlap"]);
  });

  it("accepts tasks one after the other", () => {
    expect(validateTimes([row("444-r1", "ana", [{ group: 1, role: "competitor" }, { group: 3, role: "judge" }])], slots)).toEqual([]);
  });

  it("distinguishes a schedule with no possible non-overlapping groups", () => {
    const impossible = groupSlots(schedule([
      block("a", "333-r1", 1, "10:00", "11:00", 1), block("b", "333-r1", 2, "10:00", "11:00", 1),
      block("c", "555-r1", 1, "10:00", "11:00", 1), block("d", "555-r1", 2, "10:00", "11:00", 1),
    ]));
    const issues = validateTimes([row("333-r1", "ana", [{ group: 1, role: "competitor" }]), row("555-r1", "ana", [{ group: 2, role: "competitor" }])], impossible);
    expect(issues.map(issue => issue.code)).toEqual(["unavoidable-time-overlap", "unavoidable-time-overlap"]);
  });
});

describe("generator with a schedule", () => {
  it("globally swaps competitor groups to avoid cross-event clashes", () => {
    const source = buildDemoCompetition({ id: "Global", name: "Global", people: 12, events: ["333", "555"], newcomerShare: 0, seed: 4 });
    const competition: StoredCompetition = { ...source, persons: source.persons?.map(person => ({ ...person, registration: { ...person.registration, eventIds: ["333", "555"] } })) };
    const slots = groupSlots(schedule([block("a", "333-r1", 1, "10:00", "12:00", 2), block("b", "555-r1", 2, "10:00", "12:00", 2)]));
    const rounds = withScheduledGroups(initialRounds(competition, 6, "fixed"), slots).map(round => ({ ...round, scramblers: 0, runners: 0 }));
    const assignments = generateAssignments({ competition, rounds, stations: 6, zoneMode: "fixed", people: peopleFromWcif(competition), options: { ...DEFAULT_OPTIONS, assignJudges: false }, slots });
    expect(validateTimes(assignments, slots)).toEqual([]);
    const groupsByPerson = new Map<string, number[]>();
    for (const assignment of assignments.filter(item => item.inRound)) groupsByPerson.set(assignment.personId, [...(groupsByPerson.get(assignment.personId) ?? []), assignment.tasks.find(task => task.role === "competitor")!.group]);
    expect([...groupsByPerson.values()].every(groups => groups.length === 2 && groups[0] !== groups[1])).toBe(true);
  });

  it("never gives anyone two things at once", () => {
    const competition = demoCompetition("large");
    const imported = importSchedule(competition, () => 8);
    const slots = groupSlots(imported);
    const rounds = withScheduledGroups(initialRounds(competition, 14, "fixed"), slots);
    const assignments = generateAssignments({ competition, rounds, stations: 14, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots });
    expect(assignments.length).toBeGreaterThan(0);
    expect(validateTimes(assignments, slots)).toEqual([]);
    // Parallel stages still get their judges: every group has someone working.
    const judged = new Set(assignments.flatMap(item => item.tasks.filter(task => task.role === "judge").map(task => `${item.roundId}:${task.group}`)));
    for (const round of rounds.filter(item => item.competitorsKnown)) for (let group = 1; group <= round.groups; group += 1) expect(judged.has(`${round.id}:${group}`)).toBe(true);
  });
});
