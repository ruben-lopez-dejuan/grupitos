/*
 * Assignment sets: CompScript's AssignmentSet (groups/assign.js), the ordered list that decides
 * who is placed first and where. Each set takes its people (a cluster, the top of the round, or
 * both) and spreads them over the groups it allows; people placed by an earlier set are not moved
 * by later ones, and whoever is left is split by the sorting rule. "Featured" marks the people on
 * their scorecard (Groupifier's star), as in the Amore Open and US Nationals scripts.
 */
import { targetKey, type GroupSlot } from "@/lib/pro/schedule";

/** First rounds, every round, or the chosen round ids. */
export type SetRounds = "first" | "all" | string[];
/** Group numbers as people see them; "first" and "last" are the round's first and last number. */
export type SetGroups = "any" | "first" | "last" | number[];

export type AssignmentSetConfig = {
  id: string;
  name: string;
  /** Cluster the people come from; absent: anyone. */
  segment?: string;
  /** Only the best `top` of the round (psych sheet in first rounds, previous round after). */
  top?: number;
  /** `top` counts per allowed group (Amore: 4 per group of the main stage). */
  perGroup?: boolean;
  rounds: SetRounds;
  /** Rooms or stages (lane keys); empty: any. A room's key includes its stages. */
  lanes: string[];
  groups: SetGroups;
  featured?: boolean;
  off?: boolean;
};

/** A set as it applies to one round. */
export type ResolvedSet = { id: string; name: string; members?: Set<string>; top?: number; groups: number[]; featured: boolean };

export const SET_TEMPLATES = ["featured", "organizers", "delegating", "cluster"] as const;
export type SetTemplate = typeof SET_TEMPLATES[number];

export function newSetId(sets: AssignmentSetConfig[]) {
  let index = sets.length + 1;
  while (sets.some(set => set.id === `set-${index}`)) index += 1;
  return `set-${index}`;
}

export function appliesToRound(set: AssignmentSetConfig, round: { id: string; roundNumber: number }) {
  if (set.off) return false;
  if (set.rounds === "all") return true;
  if (set.rounds === "first") return round.roundNumber === 1;
  return set.rounds.includes(round.id);
}

/** Matrix columns of the round that the set allows. Without times, columns are the group numbers. */
export function allowedGroups(set: Pick<AssignmentSetConfig, "lanes" | "groups">, groupCount: number, slots?: GroupSlot[]) {
  const columns = Array.from({ length: groupCount }, (_, index) => index + 1);
  const slotOf = (group: number) => slots?.find(slot => slot.group === group);
  const numberOf = (group: number) => slotOf(group)?.number ?? group;
  const inLane = (group: number) => {
    if (!set.lanes.length) return true;
    const slot = slotOf(group);
    return !slot || set.lanes.includes(targetKey(slot.roomId, slot.stageId)) || set.lanes.includes(targetKey(slot.roomId));
  };
  const numbers = columns.map(numberOf);
  const [first, last] = [Math.min(...numbers), Math.max(...numbers)];
  const inNumbers = (group: number) => {
    const number = numberOf(group);
    if (set.groups === "any") return true;
    if (set.groups === "first") return number === first;
    if (set.groups === "last") return number === last;
    return set.groups.includes(number);
  };
  return columns.filter(group => inLane(group) && inNumbers(group));
}

/** The sets of one round, in order, with their people and groups. */
export function resolveSets(sets: AssignmentSetConfig[] | undefined, round: { id: string; eventId: string; roundNumber: number; groups: number }, slots: GroupSlot[] | undefined, membersOf: (segmentId: string, eventId: string) => Set<string> | undefined): ResolvedSet[] {
  return (sets ?? []).filter(set => appliesToRound(set, round)).map(set => {
    const groups = allowedGroups(set, round.groups, slots);
    // A cluster that no longer exists takes nobody rather than everyone.
    const members = set.segment ? membersOf(set.segment, round.eventId) ?? new Set<string>() : undefined;
    const top = set.top === undefined ? undefined : set.perGroup ? set.top * groups.length : set.top;
    return { id: set.id, name: set.name, members, top, groups, featured: !!set.featured };
  });
}

/** "1, 3-4" → [1, 3, 4]; empty or unreadable text gives an empty list. */
export function parseGroupNumbers(text: string) {
  const numbers = new Set<number>();
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
      for (let number = from; number <= Math.min(to, from + 100); number += 1) numbers.add(number);
    } else if (/^\d+$/.test(part)) numbers.add(Number(part));
  }
  return [...numbers].filter(number => number > 0).sort((a, b) => a - b);
}

export function formatGroupNumbers(numbers: number[]) {
  const parts: string[] = [];
  for (let index = 0; index < numbers.length; index += 1) {
    let end = index;
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end += 1;
    parts.push(end > index ? `${numbers[index]}-${numbers[end]}` : String(numbers[index]));
    index = end;
  }
  return parts.join(", ");
}
