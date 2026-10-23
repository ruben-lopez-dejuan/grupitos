import { describe, expect, it } from "vitest";
import { buildDemoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, targetKey } from "@/lib/pro/schedule";
import { assignStations, resolveStationRules, type ResolvedStationRule, type StationPerson, type StationRuleConfig } from "@/lib/pro/station-rules";
import { initialRounds } from "@/lib/rounds";

const people: StationPerson[] = [
  { key: "a", seed: 0, registrantId: 30, name: "Zoe", property: "2" },
  { key: "b", seed: 1, registrantId: 10, name: "Ana", property: "" },
  { key: "c", seed: 2, registrantId: 20, name: "Marta", property: "1" },
  { key: "d", seed: 3, registrantId: 40, name: "Bea", property: "3" },
];
const rule = (change: Partial<ResolvedStationRule> = {}): ResolvedStationRule => ({ mode: "ascending", sortBy: "seed", exclusions: [], ...change });
const order = (stations: Map<string, number>) => [...stations].sort((x, y) => x[1] - y[1]).map(([key]) => key).join("");

describe("assignStations", () => {
  it("follows the key in either direction", () => {
    expect(order(assignStations(people, 4, rule()))).toBe("abcd");
    expect(order(assignStations(people, 4, rule({ mode: "descending" })))).toBe("dcba");
    expect(order(assignStations(people, 4, rule({ sortBy: "registrant" })))).toBe("bcad");
    expect(order(assignStations(people, 4, rule({ sortBy: "name" })))).toBe("bdca");
  });

  it("puts people without the property last, whatever the direction", () => {
    expect(order(assignStations(people, 4, rule({ sortBy: "property", property: "x" })))).toBe("cadb");
    expect(order(assignStations(people, 4, rule({ sortBy: "property", property: "x", mode: "descending" })))).toBe("dacb");
  });

  it("gives stations only up to the number of stations", () => {
    const stations = assignStations(people, 3, rule());
    expect(stations.size).toBe(3);
    expect(stations.has("d")).toBe(false);
  });

  it("keeps a cluster away from some stations and moves the rest as little as possible", () => {
    const stations = assignStations(people, 4, rule({ exclusions: [{ members: new Set(["a"]), stations: [1, 2] }] }));
    expect(stations.get("a")).toBe(3);
    expect(order(stations)).toBe("bcad");
  });

  it("leaves a station empty when nobody may take it", () => {
    const stations = assignStations(people.slice(0, 2), 2, rule({ exclusions: [{ members: new Set(["a", "b"]), stations: [1] }] }));
    expect([...stations.values()]).toEqual([2]);
  });
});

describe("station rules in the proposal", () => {
  const competition = buildDemoCompetition({ id: "Stations", name: "Stations", people: 24, events: ["333"], newcomerShare: 0, seed: 4 });
  const schedule = {
    timeZone: "UTC", days: ["2026-02-21"], activities: [],
    rooms: [{ id: 1, name: "Main", color: "#d93636", stages: [{ id: 1, name: "Red", color: "#d93636" }, { id: 2, name: "Blue", color: "#2563eb" }] }],
    blocks: [1, 2].map(stageId => ({ id: `b${stageId}`, activityCode: "333-r1", roomId: 1, stageId, start: "2026-02-21T10:00", end: "2026-02-21T11:00", groups: 2 })),
  };
  const slots = groupSlots(schedule);
  const rounds = initialRounds(competition, 12, "fixed").map(round => ({ ...round, groups: 4 }));
  const config: StationRuleConfig[] = [
    { id: "r", rounds: "all", lanes: [targetKey(1, 1)], groups: "any", mode: "descending", sortBy: "seed", exclusions: [] },
    { id: "all", rounds: "all", lanes: [], groups: "any", mode: "ascending", sortBy: "registrant", exclusions: [] },
  ];

  it("uses the first rule that covers each group", () => {
    const byGroup = resolveStationRules(config, { id: "333-r1", eventId: "333", roundNumber: 1, groups: 4 }, slots.get("333-r1"), () => undefined);
    const red = slots.get("333-r1")!.filter(slot => slot.stageId === 1).map(slot => slot.group);
    for (const group of [1, 2, 3, 4]) expect(byGroup.get(group)!.mode).toBe(red.includes(group) ? "descending" : "ascending");
  });

  it("numbers stations by the rule in fixed-station rounds", () => {
    const assignments = generateAssignments({
      competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots,
      stationRules: round => resolveStationRules(config, round, slots.get(round.id), () => undefined),
    });
    const red = new Set(slots.get("333-r1")!.filter(slot => slot.stageId === 1).map(slot => slot.group));
    for (const group of [1, 2, 3, 4]) {
      const members = assignments.filter(item => item.tasks.some(task => task.role === "competitor" && task.group === group));
      const stations = members.map(item => item.station);
      expect(new Set(stations).size).toBe(members.length);
      const byStation = [...members].sort((a, b) => a.station! - b.station!);
      if (red.has(group)) expect(byStation.map(item => item.seedResult ?? Infinity)).toEqual([...byStation.map(item => item.seedResult ?? Infinity)].sort((a, b) => b - a));
      else expect(byStation.map(item => Number(item.personId))).toEqual(byStation.map(item => Number(item.personId)).sort((a, b) => a - b));
    }
  });
});
