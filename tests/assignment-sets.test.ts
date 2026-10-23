import { describe, expect, it } from "vitest";
import { buildDemoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments, groupTargets, resolveCompetitorOverlaps, splitWithSets } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { allowedGroups, formatGroupNumbers, parseGroupNumbers, resolveSets, type AssignmentSetConfig } from "@/lib/pro/assignment-sets";
import { previewSets } from "@/lib/pro/sets-preview";
import { groupSlots, targetKey, withScheduledGroups } from "@/lib/pro/schedule";
import { initialRounds, personKey, roundCompetitors, type GenerationRound } from "@/lib/rounds";

const competition = buildDemoCompetition({ id: "Sets", name: "Sets", people: 40, events: ["333", "222"], newcomerShare: 0, seed: 11 });
const bestFirst = roundCompetitors(competition, "333-r1").people;
const keys = (people: { registrantId?: number | null; wcaUserId?: number }[]) => people.map(person => personKey(person as never));

describe("splitWithSets", () => {
  it("spreads a set over its groups and keeps every group even", () => {
    const people = bestFirst.slice(0, 20);
    const { groups, featured, allowed } = splitWithSets(people, 4, [{ id: "top", name: "Top", top: 8, groups: [3, 4], featured: true }], "symmetric", "333");
    expect(groups.map(members => members.length)).toEqual([5, 5, 5, 5]);
    const top = keys(people.slice(0, 8));
    expect(keys([...groups[2], ...groups[3]])).toEqual(expect.arrayContaining(top));
    expect([...featured!].sort()).toEqual([...top].sort());
    expect([...allowed!.get(top[0])!]).toEqual([3, 4]);
  });

  it("lets earlier sets win: people placed first are not moved by later sets", () => {
    const people = bestFirst.slice(0, 12);
    const chosen = new Set(keys([people[7], people[9]]));
    const { groups } = splitWithSets(people, 3, [
      { id: "team", name: "Team", members: chosen, groups: [1], featured: false },
      { id: "top", name: "Top", top: 8, groups: [2, 3], featured: false },
    ], "ranks", "333");
    expect(keys(groups[0])).toEqual(expect.arrayContaining([...chosen]));
    // The eighth best was already placed in group 1, so the top set takes the other seven.
    expect(keys([...groups[1], ...groups[2]])).toEqual(expect.arrayContaining(keys(people.slice(0, 7))));
    expect(keys(groups[0])).not.toContain(keys([people[0]])[0]);
    expect(groups.map(members => members.length)).toEqual([4, 4, 4]);
  });

  it("falls back to the plain split when no set places anyone", () => {
    const people = bestFirst.slice(0, 10);
    const result = splitWithSets(people, 2, [{ id: "none", name: "None", members: new Set(), groups: [1], featured: true }], "ranks", "333");
    expect(result.allowed).toBeUndefined();
    expect(result.groups.flat()).toHaveLength(10);
  });
});

describe("set groups", () => {
  const schedule = {
    timeZone: "UTC", days: ["2026-02-21"], activities: [],
    rooms: [{ id: 1, name: "Main", color: "#d93636", stages: [{ id: 1, name: "Red", color: "#d93636" }, { id: 2, name: "Blue", color: "#2563eb" }] }],
    blocks: [
      { id: "r", activityCode: "333-r1", roomId: 1, stageId: 1, start: "2026-02-21T10:00", end: "2026-02-21T11:00", groups: 2 },
      { id: "b", activityCode: "333-r1", roomId: 1, stageId: 2, start: "2026-02-21T10:00", end: "2026-02-21T11:00", groups: 2 },
    ],
  };
  const slots = groupSlots(schedule);
  const roundSlots = slots.get("333-r1")!;
  const red = roundSlots.filter(slot => slot.stageId === 1).map(slot => slot.group).sort();

  it("filters by stage, by room and by the group number people see", () => {
    expect(allowedGroups({ lanes: [targetKey(1, 1)], groups: "any" }, 4, roundSlots)).toEqual(red);
    expect(allowedGroups({ lanes: [targetKey(1)], groups: "any" }, 4, roundSlots)).toEqual([1, 2, 3, 4]);
    const last = allowedGroups({ lanes: [], groups: "last" }, 4, roundSlots);
    expect(last).toHaveLength(2);
    expect(last.every(group => roundSlots.find(slot => slot.group === group)!.number === 2)).toBe(true);
  });

  it("counts the top per allowed group and applies to the chosen rounds", () => {
    const set: AssignmentSetConfig = { id: "s", name: "Stream", top: 4, perGroup: true, rounds: "first", lanes: [targetKey(1, 1)], groups: "any", featured: true };
    const [resolved] = resolveSets([set], { id: "333-r1", eventId: "333", roundNumber: 1, groups: 4 }, roundSlots, () => undefined);
    expect(resolved.top).toBe(8);
    expect(resolveSets([set], { id: "333-r2", eventId: "333", roundNumber: 2, groups: 2 }, undefined, () => undefined)).toEqual([]);
    expect(resolveSets([{ ...set, segment: "gone" }], { id: "333-r1", eventId: "333", roundNumber: 1, groups: 4 }, roundSlots, () => undefined)[0].members?.size).toBe(0);
  });

  it("puts the featured top on the stream stage in the proposal", () => {
    const rounds = withScheduledGroups(initialRounds(competition, 8, "fixed"), slots).filter(round => round.id === "333-r1");
    const set: AssignmentSetConfig = { id: "s", name: "Stream", top: 3, perGroup: true, rounds: "first", lanes: [targetKey(1, 1)], groups: "any", featured: true };
    const assignments = generateAssignments({
      competition, rounds, stations: 8, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots,
      assignmentSets: round => resolveSets([set], round, slots.get(round.id), () => undefined),
    });
    const top = new Set(keys(bestFirst.slice(0, 6)));
    const featured = assignments.filter(item => item.featured);
    expect(new Set(featured.map(item => item.personId))).toEqual(top);
    for (const item of featured) expect(red).toContain(item.tasks.find(task => task.role === "competitor")!.group);
  });
});

describe("group numbers", () => {
  it("reads and writes lists with ranges", () => {
    expect(parseGroupNumbers("3-4, 1 x 7")).toEqual([1, 3, 4, 7]);
    expect(formatGroupNumbers([1, 3, 4, 5, 7])).toBe("1, 3-5, 7");
  });
});

describe("top per group of the whole round", () => {
  it("counts every group of the round, as the Spanish Championship 2026 scripts do", () => {
    const set: AssignmentSetConfig = { id: "s", name: "Featured", top: 1, perGroup: "round", rounds: "first", lanes: ["1:1"], groups: "any", featured: true };
    expect(resolveSets([set], { id: "333-r1", eventId: "333", roundNumber: 1, groups: 12 }, undefined, () => undefined)[0].top).toBe(12);
  });
});

describe("sets never overfill a group", () => {
  it("place what fits and leave the rest to later sets, with stats", () => {
    const people = bestFirst.slice(0, 24);
    // Four groups of six; the "top" set asks for 20 people in two groups (12 seats).
    const { groups, stats } = splitWithSets(people, 4, [
      { id: "top", name: "Top", top: 20, groups: [1, 2], featured: false },
      { id: "rest", name: "Rest", groups: [3, 4], featured: false },
    ], "symmetric", "333");
    expect(groups.map(members => members.length)).toEqual([6, 6, 6, 6]);
    expect(stats).toEqual([{ id: "top", name: "Top", wanted: 20, seats: 12, placed: 12 }, { id: "rest", name: "Rest", wanted: 12, seats: 12, placed: 12 }]);
    // The best twelve made it; the other eight went with the rest.
    expect(keys([...groups[0], ...groups[1]]).sort()).toEqual(keys(people.slice(0, 12)).sort());
  });

  it("take a number per event", () => {
    const set: AssignmentSetConfig = { id: "t", name: "Top", top: 4, topByEvent: { "555": 2 }, perGroup: true, rounds: "first", lanes: [], groups: "any" };
    expect(resolveSets([set], { id: "333-r1", eventId: "333", roundNumber: 1, groups: 3 }, undefined, () => undefined)[0].top).toBe(12);
    expect(resolveSets([set], { id: "555-r1", eventId: "555", roundNumber: 1, groups: 3 }, undefined, () => undefined)[0].top).toBe(6);
  });

  it("are previewed with the people registered now", () => {
    const rounds = initialRounds(competition, 8, "fixed").filter(round => round.id === "333-r1").map(round => ({ ...round, groups: 4 }));
    const preview = previewSets({ competition, rounds, membersOf: () => undefined, sets: [{ id: "big", name: "Big", top: 30, perGroup: false, rounds: "first", lanes: [], groups: [1] }] });
    // 40 people in four groups: group 1 has ten seats.
    expect(preview.get("big")).toEqual([{ roundId: "333-r1", wanted: 30, seats: 10, placed: 10 }]);
  });
});

describe("a maximum per group on some stages", () => {
  it("gives capped groups at most their maximum and the rest to the others", () => {
    expect(groupTargets(30, [undefined, 5, undefined])).toEqual([13, 5, 12]);
    expect(groupTargets(12, [undefined, undefined])).toEqual([6, 6]);
    // Nothing fits: the emptiest groups take the rest and the review warns.
    expect(groupTargets(10, [2, 2])).toEqual([5, 5]);
  });

  it("keeps the middle stage small in the proposal, with or without sets", () => {
    const schedule = {
      timeZone: "UTC", days: ["2026-02-21"], activities: [],
      rooms: [{ id: 1, name: "Main", color: "#d93636", stages: [{ id: 1, name: "Left", color: "#d93636" }, { id: 2, name: "Middle", color: "#2563eb" }, { id: 3, name: "Right", color: "#2f9e44" }] }],
      blocks: [1, 2, 3].map(stageId => ({ id: `b${stageId}`, activityCode: "333-r1", roomId: 1, stageId, start: "2026-02-21T10:00", end: "2026-02-21T11:00", groups: 1 })),
    };
    const slots = groupSlots(schedule);
    const rounds = withScheduledGroups(initialRounds(competition, 20, "waiting"), slots).filter(round => round.id === "333-r1");
    const middle = slots.get("333-r1")!.find(slot => slot.stageId === 2)!.group;
    const staffing = (_roundId: string, group: number) => group === middle ? { maxPerGroup: 6 } : undefined;
    for (const assignmentSets of [undefined, (round: GenerationRound) => resolveSets([{ id: "top", name: "Top", top: 10, rounds: "first", lanes: [targetKey(1, 1)], groups: "any" }], round, slots.get(round.id), () => undefined)]) {
      const assignments = generateAssignments({ competition, rounds, stations: 20, zoneMode: "waiting", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots, staffing, assignmentSets });
      const sizes = [1, 2, 3].map(group => assignments.filter(item => item.tasks.some(task => task.role === "competitor" && task.group === group)).length);
      expect(sizes[middle - 1]).toBe(6);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(bestFirst.length);
      expect(Math.abs(sizes.filter((_, index) => index !== middle - 1)[0] - sizes.filter((_, index) => index !== middle - 1)[1])).toBeLessThanOrEqual(1);
    }
  });
});

describe("the overlap repair and assignment sets", () => {
  const [a, b, c, d, e] = bestFirst;
  const window = (start: string, end: string) => ({ start: `2026-02-21T${start}`, end: `2026-02-21T${end}` });
  const slots = new Map([
    ["333-r1", [{ group: 1, roomId: 1, number: 1, windows: [window("10:00", "10:30")] }, { group: 2, roomId: 1, number: 2, windows: [window("10:30", "11:00")] }]],
    ["222-r1", [{ group: 1, roomId: 1, number: 1, windows: [window("10:00", "10:30")] }]],
  ]);
  const plan = (roundId: string, groups: typeof bestFirst[], setOf?: Map<string, string>) => ({
    round: { id: roundId, eventId: roundId.split("-")[0], roundNumber: 1, groups: groups.length, scramblers: 0, runners: 0, enabled: true },
    competitors: groups.flat(), groups, fixed: false, seedIndex: new Map(groups.flat().map((person, index) => [personKey(person), index])), preferredGroup: new Map(), setOf,
    allowed: setOf && new Map([...setOf.keys()].map(key => [key, new Set([1, 2])])),
  });

  it("swaps within the same set when it can, so the set keeps its count per group", () => {
    // a and b are featured in G1; G2 has c (top) and e (featured); a also competes in 222 G1 at 10:00.
    const setOf = new Map([[personKey(a), "featured"], [personKey(b), "featured"], [personKey(c), "top"], [personKey(e), "featured"]]);
    const plans = [plan("333-r1", [[a, b], [c, e]], setOf), plan("222-r1", [[a]])];
    resolveCompetitorOverlaps(plans as never, slots);
    expect(keys(plans[0].groups[0]).sort()).toEqual(keys([e, b]).sort());
  });

  it("fixes a real clash across sets when nothing else can", () => {
    // Only people of another set (c, d) can take a's place: the clash wins over the set's count.
    const setOf = new Map([[personKey(a), "featured"], [personKey(b), "featured"], [personKey(c), "top"], [personKey(d), "top"]]);
    const plans = [plan("333-r1", [[a, b], [c, d]], setOf), plan("222-r1", [[a]])];
    resolveCompetitorOverlaps(plans as never, slots);
    expect(keys(plans[0].groups[1])).toContain(keys([a])[0]);
  });
});
