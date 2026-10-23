/*
 * Station rules: CompScript's StationAssignmentRule (groups/assign.js, assignStations). In the
 * groups a rule covers, competitors take stations 1, 2, 3… in the order of a key (seed, registrant
 * id, name or a numeric property), ascending or descending, and exclusion rules keep a cluster away
 * from some stations (the US Nationals keep stations 1–2, the stream, for North Americans). As in
 * CompScript it is an assignment problem, solved with javascript-lp-solver when exclusions apply.
 */
import solver from "javascript-lp-solver";
import { allowedGroups, appliesToRound, type SetGroups, type SetRounds } from "@/lib/pro/assignment-sets";
import type { GroupSlot } from "@/lib/pro/schedule";

export const STATION_SORTS = ["seed", "registrant", "name", "property"] as const;
export type StationSort = typeof STATION_SORTS[number];

export type StationExclusion = { segment?: string; stations: number[] };

export type StationRuleConfig = {
  id: string;
  rounds: SetRounds;
  lanes: string[];
  groups: SetGroups;
  mode: "ascending" | "descending";
  sortBy: StationSort;
  /** Numeric property for `sortBy: "property"`; people without it go last. */
  property?: string;
  exclusions: StationExclusion[];
  off?: boolean;
};

export type ResolvedStationRule = Pick<StationRuleConfig, "mode" | "sortBy" | "property"> & { exclusions: Array<{ members: Set<string>; stations: number[] }> };

export function newStationRuleId(rules: StationRuleConfig[]) {
  let index = rules.length + 1;
  while (rules.some(rule => rule.id === `station-${index}`)) index += 1;
  return `station-${index}`;
}

/** The rule of each group of a round: the first one in the list that covers it. */
export function resolveStationRules(rules: StationRuleConfig[] | undefined, round: { id: string; eventId: string; roundNumber: number; groups: number }, slots: GroupSlot[] | undefined, membersOf: (segmentId: string, eventId: string) => Set<string> | undefined) {
  const byGroup = new Map<number, ResolvedStationRule>();
  for (const rule of rules ?? []) {
    if (!appliesToRound(rule, round)) continue;
    // An exclusion without a cluster, or with a deleted one, keeps nobody away.
    const resolved: ResolvedStationRule = { mode: rule.mode, sortBy: rule.sortBy, property: rule.property, exclusions: rule.exclusions.filter(item => item.segment && item.stations.length).map(item => ({ members: membersOf(item.segment!, round.eventId) ?? new Set(), stations: item.stations })) };
    for (const group of allowedGroups(rule, round.groups, slots)) if (!byGroup.has(group)) byGroup.set(group, resolved);
  }
  return byGroup;
}

export type StationPerson = { key: string; seed: number; registrantId?: number | null; name: string; property?: string };

/** Station of each person (key → station); people beyond `stations` get none. */
export function assignStations(people: StationPerson[], stations: number, rule: ResolvedStationRule): Map<string, number> {
  const value = (person: StationPerson): number | string => {
    if (rule.sortBy === "registrant") return person.registrantId ?? Number.MAX_SAFE_INTEGER;
    if (rule.sortBy === "name") return person.name;
    if (rule.sortBy === "property") {
      const number = Number(person.property?.replace(",", "."));
      return person.property !== undefined && person.property.trim() !== "" && Number.isFinite(number) ? number : Number.NaN;
    }
    return person.seed;
  };
  const direction = rule.mode === "ascending" ? 1 : -1;
  const ordered = [...people].sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    // Missing property values go last whatever the direction.
    if (typeof x === "number" && typeof y === "number" && Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1;
    const order = typeof x === "string" ? x.localeCompare(String(y)) : (Number.isNaN(x) ? 0 : x - (y as number));
    return direction * order || a.seed - b.seed;
  });
  const count = Math.min(stations, ordered.length);
  const excluded = (person: StationPerson, station: number) => rule.exclusions.some(item => item.members.has(person.key) && item.stations.includes(station));
  if (!ordered.some(person => rule.exclusions.some(item => item.members.has(person.key)))) return new Map(ordered.slice(0, count).map((person, index) => [person.key, index + 1]));

  // Each station seats one person; the further from their place in the order, the worse.
  // Seating someone is worth far more, so every station that can be filled is filled.
  const SEAT = 1000000;
  const model: solver.Model = { optimize: "value", opType: "max", constraints: {}, variables: {}, ints: {} };
  ordered.forEach((person, rank) => {
    model.constraints[`p:${rank}`] = { max: 1 };
    for (let station = 1; station <= count; station += 1) {
      if (excluded(person, station)) continue;
      const variable = `x:${rank}:${station}`;
      model.variables[variable] = { value: SEAT - (rank + 1 - station) ** 2, [`p:${rank}`]: 1, [`s:${station}`]: 1 };
      model.ints![variable] = 1;
    }
  });
  for (let station = 1; station <= count; station += 1) model.constraints[`s:${station}`] = { max: 1 };
  const solution = solver.Solve(model);
  const result = new Map<string, number>();
  for (const [variable, chosen] of Object.entries(solution)) {
    if (!variable.startsWith("x:") || typeof chosen !== "number" || chosen < 0.5) continue;
    const [, rank, station] = variable.split(":").map(Number);
    result.set(ordered[rank].key, station);
  }
  return result;
}
