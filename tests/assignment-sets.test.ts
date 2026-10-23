import { describe, expect, it } from "vitest";
import { buildDemoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments, splitWithSets } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { allowedGroups, formatGroupNumbers, parseGroupNumbers, resolveSets, type AssignmentSetConfig } from "@/lib/pro/assignment-sets";
import { groupSlots, targetKey, withScheduledGroups } from "@/lib/pro/schedule";
import { initialRounds, personKey, roundCompetitors } from "@/lib/rounds";

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
