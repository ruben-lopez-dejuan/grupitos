import { describe, expect, it } from "vitest";
import stagedFixture from "@/tests/fixtures/schedule-with-rooms-and-stages.json";
import { competingGroup, groupTotals, type GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import { buildDemoCompetition, demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { eventBusyWindows, groupSlots, importSchedule, isoToLocal, minScheduledGroups, setRoundGroups, scheduleProblems, splitBlock, staffingOf, targetKey, withScheduledGroups, type ProSchedule } from "@/lib/pro/schedule";
import { initialRounds, personKey } from "@/lib/rounds";
import { volunteerPerson } from "@/lib/pro/people";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import { roundScorecards } from "@/lib/scorecards/scorecards";
import { groupLimits, validateRound, validateTimes } from "@/lib/validation";

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
    // One column per attempt; the second repeats the first's group number and people.
    expect(mbf.map(slot => [slot.group, slot.number, slot.attempt, slot.linkedTo, slot.windows])).toEqual([
      [1, 1, undefined, undefined, [{ start: "2026-02-21T12:00", end: "2026-02-21T13:00" }]],
      [2, 1, 2, 1, [{ start: "2026-02-21T15:00", end: "2026-02-21T16:00" }]],
    ]);
  });

  it("reads multi-blind groups named per attempt (333mbf-r1-g1-a1) and cube submission", () => {
    const attempt = (id: number, number: number, start: string, end: string) => ({ id, name: `MBLD A${number}`, activityCode: `333mbf-r1-a${number}`, startTime: `2026-02-21T${start}:00Z`, endTime: `2026-02-21T${end}:00Z`, childActivities: [{ id: id * 10, name: "", activityCode: `333mbf-r1-g1-a${number}`, startTime: `2026-02-21T${start}:00Z`, endTime: `2026-02-21T${end}:00Z` }] });
    const competition: StoredCompetition = {
      id: "X", name: "X",
      schedule: { startDate: "2026-02-21", numberOfDays: 1, venues: [{ timezone: "UTC", rooms: [{ id: 1, name: "Side", activities: [attempt(1, 1, "14:15", "15:25"), attempt(2, 2, "16:00", "17:10"), { id: 3, name: "Submission", activityCode: "other-multi", startTime: "2026-02-21T12:15:00Z", endTime: "2026-02-21T12:35:00Z" }] }] }] },
    };
    // The suggestion (3 groups) must not replace the single group already in the WCIF.
    const imported = importSchedule(competition, () => 3);
    expect(imported.blocks.map(item => [item.activityCode, item.groups])).toEqual([["333mbf-r1-a1", 1], ["333mbf-r1-a2", 1]]);
    expect(groupSlots(imported).get("333mbf-r1")!.map(slot => slot.attempt ?? 1)).toEqual([1, 2]);
    expect(eventBusyWindows(imported).get("333mbf")).toEqual([{ start: "2026-02-21T12:15", end: "2026-02-21T12:35" }]);
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

  it("gives groups that start together the same number, and each new start time the next one", () => {
    // Rojo runs the round 10:00-11:00 in three groups; Verde runs two later groups.
    const slots = groupSlots(schedule([block("a", "333-r1", 1, "10:00", "11:00", 3), block("b", "333-r1", 2, "10:00", "10:20", 1), block("c", "333-r1", 2, "11:00", "11:40", 2)])).get("333-r1")!;
    expect(slots.map(slot => `G${slot.group}=${stages.find(stage => stage.id === slot.stageId)!.name} ${slot.number} ${slot.windows[0].start.slice(11)}`))
      .toEqual(["G1=Rojo 1 10:00", "G2=Verde 1 10:00", "G3=Rojo 2 10:20", "G4=Rojo 3 10:40", "G5=Verde 4 11:00", "G6=Verde 5 11:20"]);
  });

  it("spreads a round's total over its blocks by length, at least one each", () => {
    const base = schedule([block("a", "444-r1", 1, "10:00", "11:00", 2), block("b", "444-r1", 2, "10:00", "10:30", 2), block("c", "222-r1", 1, "11:00", "12:00", 3)]);
    const imported = { ...base, blocks: base.blocks.map(item => item.id === "a" ? { ...item, groupWindows: [{ start: "2026-02-21T10:00", end: "2026-02-21T10:40" }, { start: "2026-02-21T10:40", end: "2026-02-21T11:00" }] } : item) };
    const nine = setRoundGroups(imported, "444-r1", 9);
    expect(Object.fromEntries(nine.blocks.map(item => [item.id, item.groups]))).toEqual({ a: 6, b: 3, c: 3 });
    // Changed blocks drop their imported uneven windows; other rounds are untouched.
    expect(nine.blocks.find(item => item.id === "a")!.groupWindows).toBeUndefined();
    expect(Object.fromEntries(setRoundGroups(imported, "444-r1", 1).blocks.map(item => [item.id, item.groups]))).toEqual({ a: 1, b: 1, c: 3 });
    expect(minScheduledGroups(imported, "444-r1")).toBe(2);
    expect(groupSlots(nine).get("444-r1")).toHaveLength(9);
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

  it("puts multi-blind competitors in the group that overlaps least when none is free", () => {
    const source = buildDemoCompetition({ id: "Multi", name: "Multi", people: 12, events: ["555", "333mbf"], newcomerShare: 0, seed: 5 });
    const competition: StoredCompetition = { ...source, persons: source.persons?.map((person, index) => ({ ...person, registration: { ...person.registration, eventIds: index < 6 ? ["555", "333mbf"] : ["555"] } })) };
    // 555 G1 overlaps the attempt by 15 minutes, G2 by 30.
    const slots = groupSlots(schedule([block("a", "555-r1", 1, "10:00", "11:00", 2), block("b", "333mbf-r1-a1", 3, "10:15", "11:30", 1)]));
    const rounds = withScheduledGroups(initialRounds(competition, 6, "fixed"), slots).map(round => ({ ...round, scramblers: 0, runners: 0 }));
    const assignments = generateAssignments({ competition, rounds, stations: 6, zoneMode: "fixed", people: peopleFromWcif(competition), options: { ...DEFAULT_OPTIONS, assignJudges: false }, slots });
    const multi = new Set(assignments.filter(item => item.roundId === "333mbf-r1" && item.inRound).map(item => item.personId));
    expect(multi.size).toBe(6);
    const groupsOfMulti = assignments.filter(item => item.roundId === "555-r1" && multi.has(item.personId)).map(item => item.tasks.find(task => task.role === "competitor")!.group);
    expect(groupsOfMulti).toEqual([1, 1, 1, 1, 1, 1]);
    // Only the schedule can remove the remaining overlap, so it is a warning.
    expect(new Set(validateTimes(assignments, slots).map(issue => `${issue.code}:${issue.severity}`))).toEqual(new Set(["unavoidable-time-overlap:warning"]));
  });

  it("chains two events that overlap only a few minutes (5x5 G1, then multi-blind) without a warning", () => {
    const source = buildDemoCompetition({ id: "Chain", name: "Chain", people: 12, events: ["555", "333mbf"], newcomerShare: 0, seed: 5 });
    const competition: StoredCompetition = { ...source, persons: source.persons?.map((person, index) => ({ ...person, registration: { ...person.registration, eventIds: index < 6 ? ["555", "333mbf"] : ["555"] } })) };
    // 555 G1 10:00-10:30, G2 10:30-11:00; the attempt starts at 10:23 (7 minutes into G1's end).
    const slots = groupSlots(schedule([block("a", "555-r1", 1, "10:00", "11:00", 2), block("b", "333mbf-r1-a1", 3, "10:23", "11:30", 1)]));
    const rounds = withScheduledGroups(initialRounds(competition, 6, "fixed"), slots).map(round => ({ ...round, scramblers: 0, runners: 0 }));
    const assignments = generateAssignments({ competition, rounds, stations: 6, zoneMode: "fixed", people: peopleFromWcif(competition), options: { ...DEFAULT_OPTIONS, assignJudges: false }, slots });
    const multi = new Set(assignments.filter(item => item.roundId === "333mbf-r1" && item.inRound).map(item => item.personId));
    expect(assignments.filter(item => item.roundId === "555-r1" && multi.has(item.personId)).map(item => item.tasks.find(task => task.role === "competitor")!.group)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(validateTimes(assignments, slots)).toEqual([]);
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

describe("scorecards with a schedule", () => {
  it("prints only the chosen stage, with the shared number and the stage name", () => {
    const competition = demoCompetition("small");
    const proSchedule = schedule([block("a", "333-r1", 1, "10:00", "11:00", 2), block("b", "333-r1", 2, "10:00", "11:00", 2)]);
    const slots = groupSlots(proSchedule);
    const rounds = withScheduledGroups(initialRounds(competition, 12, "waiting"), slots);
    const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "waiting", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots });
    const verde = new Set(slots.get("333-r1")!.filter(slot => slot.stageId === 2).map(slot => slot.group));
    const inVerde = assignments.filter(item => item.roundId === "333-r1" && item.tasks.some(task => task.role === "competitor" && verde.has(task.group))).length;
    const cards = roundScorecards({ competition, assignments, rounds, stations: 12, zoneMode: "waiting", printing: DEFAULT_PRINTING, schedule: proSchedule, slots }, ["333-r1"], (_, group) => verde.has(group)).filter(Array.isArray);
    expect(cards).toHaveLength(inVerde);
    const texts = cards.map(card => JSON.stringify(card));
    expect(texts.every(text => text.includes("\"Verde\"") && !text.includes("\"Rojo\""))).toBe(true);
    // Verde's groups are G2 and G4 as columns, but people know them as groups 1 and 2.
    expect(new Set(texts.map(text => text.match(/"stack":\[\{"text":(\d+)\}/)?.[1]))).toEqual(new Set(["1", "2"]));
  });
});

describe("staffing per room and stage", () => {
  it("uses each stage's stations and staff for its groups", () => {
    const competition = demoCompetition("small");
    const proSchedule = schedule([block("a", "333-r1", 1, "10:00", "11:00", 2), block("b", "333-r1", 2, "10:00", "11:00", 2)]);
    const slots = groupSlots(proSchedule);
    const rounds = withScheduledGroups(initialRounds(competition, 12, "fixed"), slots);
    const staffing = staffingOf(slots, { [targetKey(1, 2)]: { stations: 3, scramblers: 0, runners: 0 } });
    const verde = slots.get("333-r1")!.filter(slot => slot.stageId === 2).map(slot => slot.group);
    expect(staffing("333-r1", verde[0])).toEqual({ stations: 3, scramblers: 0, runners: 0 });
    expect(staffing("333-r1", slots.get("333-r1")!.find(slot => slot.stageId === 1)!.group)).toBeUndefined();
    const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots, staffing });
    const inGroup = (group: number, role: string) => assignments.filter(item => item.roundId === "333-r1" && item.tasks.some(task => task.group === group && task.role === role)).length;
    for (const group of verde) {
      expect(inGroup(group, "judge")).toBeLessThanOrEqual(3);
      expect(inGroup(group, "scrambler")).toBe(0);
    }
    const round = rounds.find(item => item.id === "333-r1")!;
    const rules = { groups: round.groups, scramblers: round.scramblers, runners: round.runners, stations: 12, fixedStations: false, checkJudges: true, checkDelegates: false, checkDataEntry: false, noNormalTasks: new Set<string>(), byGroup: Object.fromEntries(verde.map(group => [group, staffing("333-r1", group)!])) };
    expect(groupLimits(rules, verde[0])).toEqual({ stations: 3, scramblers: 0, runners: 0 });
    const issues = validateRound("333-r1", assignments.filter(item => item.roundId === "333-r1"), rules);
    expect(issues.some(issue => issue.code === "missing-scramblers" && verde.includes(issue.group!))).toBe(false);
  });
});

describe("side room staffing", () => {
  // A single-group blindfolded round in the side room after the main-stage rounds: everyone in it
  // competes, so its staff must come from outside the round.
  const source = buildDemoCompetition({ id: "Side", name: "Side", people: 40, events: ["333", "444", "444bf"], newcomerShare: 0, seed: 8 });
  const competition: StoredCompetition = { ...source, persons: source.persons?.map((person, index) => ({ ...person, roles: index < 6 ? ["delegate"] : [], registration: { ...person.registration, eventIds: index % 3 === 0 ? ["333", "444", "444bf"] : ["333", "444"] } })) };
  const slots = groupSlots(schedule([block("a", "333-r1", 1, "10:00", "11:00", 2), block("b", "333-r1", 2, "10:00", "11:00", 2), block("d", "444-r1", 1, "11:00", "12:00", 2), block("c", "444bf-r1", 3, "12:00", "13:00", 1)]));
  const rounds = withScheduledGroups(initialRounds(competition, 6, "fixed"), slots).map(round => ({ ...round, enabled: round.competitorsKnown }));
  const people = peopleFromWcif(competition);
  const options = { ...DEFAULT_OPTIONS, assignDelegateDuties: true };

  it("covers the side room with reserve scramblers (4x4 results) and a delegate", () => {
    const assignments = generateAssignments({ competition, rounds, stations: 6, zoneMode: "fixed", people, options, slots });
    const side = assignments.filter(item => item.roundId === "444bf-r1");
    const counts = groupTotals(side, 1)[0].counts;
    expect(counts.scrambler).toBe(rounds.find(round => round.id === "444bf-r1")!.scramblers);
    expect(counts.delegate).toBe(1);
    expect(side.filter(item => item.tasks.some(task => task.role === "scrambler")).every(item => item.why?.some(why => why.reasons.includes("reserve")))).toBe(true);
    expect(validateTimes(assignments, slots)).toEqual([]);
  });

  it("keeps a room's team in its room, first in line there", () => {
    const team = new Set(competition.persons!.filter((_, index) => index >= 6 && index % 3 !== 0).slice(0, 4).map(personKey));
    const laneTeams = { forGroup: (roundId: string, group: number) => slots.get(roundId)?.find(slot => slot.group === group)?.roomId === 3 ? team : undefined, members: team };
    const assignments = generateAssignments({ competition, rounds, stations: 6, zoneMode: "fixed", people, options, slots, laneTeams });
    const elsewhere = assignments.filter(item => team.has(item.personId) && item.roundId !== "444bf-r1" && item.tasks.some(task => task.role !== "competitor"));
    expect(elsewhere).toEqual([]);
    const sideStaff = new Set(assignments.filter(item => item.roundId === "444bf-r1" && item.tasks.some(task => task.role !== "competitor")).map(item => item.personId));
    // The team does not compete in 4BLD, so all of it is free and works there.
    for (const key of team) expect(sideStaff.has(key)).toBe(true);
  });
});

describe("data entry per time slot", () => {
  it("gives one data entry person per time, in the first stage found, and does not ask for more", () => {
    const competition = demoCompetition("small");
    const slots = groupSlots(schedule([block("a", "333-r1", 1, "10:00", "11:00", 2), block("b", "333-r1", 2, "10:00", "11:00", 2)]));
    const rounds = withScheduledGroups(initialRounds(competition, 12, "fixed"), slots);
    const people = peopleFromWcif(competition);
    // Two typists who do not compete, so both time slots can be covered.
    const volunteers = [volunteerPerson({ key: "vol-1", name: "Typist 1" }), volunteerPerson({ key: "vol-2", name: "Typist 2" })];
    const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: { ...people, roles: { ...people.roles, dataentry: ["vol-1", "vol-2"] } }, options: { ...DEFAULT_OPTIONS, assignDataEntry: true }, slots, extraPeople: volunteers });
    const typing = assignments.filter(item => item.roundId === "333-r1").flatMap(item => item.tasks.filter(task => task.role === "dataentry").map(task => slots.get("333-r1")!.find(slot => slot.group === task.group)!));
    // Two time slots (10:00 and 10:30), each covered once, in Rojo.
    expect(typing.map(slot => [slot.number, slot.stageId]).sort()).toEqual([[1, 1], [2, 1]]);
    const covered = new Set(slots.get("333-r1")!.filter(slot => typing.some(other => other.windows[0].start === slot.windows[0].start)).map(slot => slot.group));
    const round = rounds.find(item => item.id === "333-r1")!;
    const rules = { groups: round.groups, scramblers: round.scramblers, runners: round.runners, stations: 12, fixedStations: false, checkJudges: false, checkDelegates: false, checkDataEntry: true, dataEntryCovered: covered, noNormalTasks: new Set<string>() };
    expect(validateRound("333-r1", assignments.filter(item => item.roundId === "333-r1"), rules).filter(issue => issue.code === "missing-dataentry")).toEqual([]);
  });
});

describe("multi-blind attempts", () => {
  it("put every competitor in every attempt, each attempt with its own staff", () => {
    const competition = buildDemoCompetition({ id: "Mbf", name: "Mbf", people: 24, events: ["333", "333mbf"], newcomerShare: 0, seed: 8 });
    const schedule: ProSchedule = {
      timeZone: "UTC", days: ["2026-02-21", "2026-02-22"], activities: [],
      rooms: [{ id: 1, name: "Sala", color: "#2563eb", stages: [] }],
      blocks: [
        { id: "a", activityCode: "333-r1", roomId: 1, start: "2026-02-21T10:00", end: "2026-02-21T11:00", groups: 2 },
        { id: "m1", activityCode: "333mbf-r1-a1", roomId: 1, start: "2026-02-21T12:00", end: "2026-02-21T13:00", groups: 1 },
        { id: "m2", activityCode: "333mbf-r1-a2", roomId: 1, start: "2026-02-22T12:00", end: "2026-02-22T13:00", groups: 1 },
      ],
    };
    const slots = groupSlots(schedule);
    const rounds = withScheduledGroups(initialRounds(competition, 12, "fixed"), slots);
    expect(rounds.find(round => round.id === "333mbf-r1")!.groups).toBe(2);
    const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots });
    const mbf = assignments.filter(item => item.roundId === "333mbf-r1" && item.inRound);
    expect(mbf.length).toBeGreaterThan(0);
    for (const item of mbf) {
      expect(item.tasks.filter(task => task.role === "competitor")).toEqual([{ group: 1, role: "competitor" }, { group: 2, role: "competitor", attempt: 2 }]);
      expect(competingGroup(item)).toBe(1);
    }
    const totals = groupTotals(assignments.filter(item => item.roundId === "333mbf-r1"), 2);
    expect(totals[0].counts.competitor).toBe(totals[1].counts.competitor);
    expect(totals[1].counts.judge).toBeGreaterThan(0);
    expect(validateTimes(assignments, slots).filter(issue => issue.severity === "error")).toEqual([]);
    // One scorecard per person, from attempt 1.
    const cards = roundScorecards({ competition, assignments, rounds, stations: 12, zoneMode: "fixed", printing: { ...DEFAULT_PRINTING, order: "natural" }, schedule, slots }, ["333mbf-r1"]);
    const printed = JSON.stringify(cards);
    for (const item of mbf) expect(printed.split(JSON.stringify(item.name)).length - 1).toBe(1);
  });
});
