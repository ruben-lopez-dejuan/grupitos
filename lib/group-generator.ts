/*
 * Group and staff assignment. The competitor split and the staff selection criteria follow
 * Groupifier (https://github.com/jonatanklosko/groupifier, Apache-2.0), src/logic/groups.js,
 * adapted to this app's data model. See THIRD_PARTY_NOTICES.md. In PRO mode, groups have real times
 * (lib/pro/schedule.ts) and nobody gets a task while busy elsewhere.
 */
import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import { sortTasks, type GeneratedAssignment, type Task, type TaskRole } from "@/lib/assignments";
import { overlaps, toMinutes, type GroupSlot, type TimeWindow } from "@/lib/pro/schedule";
import { ageOf, competitionCountry, isNewcomer, type PeopleSettings } from "@/lib/people";
import { acceptedPeople, bestAverageAndSingle, judgesNeeded, personKey, roundCompetitors, seedResult, usesFixedStations, type GenerationRound, type SortingRule, type ZoneMode } from "@/lib/rounds";

export type AssignmentOptions = {
  sortingRule: SortingRule;
  /** Soft: working in the group right before one's own is disfavoured, never forbidden. */
  avoidBeforeOwnGroup: boolean;
  assignJudges: boolean;
  noTasksForNewcomers: boolean;
  tasksForOwnEventsOnly: boolean;
  noRunningForForeigners: boolean;
  spreadDelegates: boolean;
  /** Off: delegates, trainees and organizers get no judging, scrambling or running. */
  normalTasksForDelegatesAndOrganizers: boolean;
  assignDelegateDuties: boolean;
  assignDataEntry: boolean;
};

export const DEFAULT_OPTIONS: AssignmentOptions = {
  sortingRule: "scrambler-safe",
  avoidBeforeOwnGroup: true,
  assignJudges: true,
  noTasksForNewcomers: false,
  tasksForOwnEventsOnly: false,
  noRunningForForeigners: false,
  spreadDelegates: true,
  normalTasksForDelegatesAndOrganizers: false,
  assignDelegateDuties: false,
  assignDataEntry: false,
};

/** Events where Groupifier's "balanced" rule keeps the plain ranking order. */
const BALANCED_BY_RANKS = ["333", "222", "333bf", "333oh", "333ft", "pyram", "skewb", "clock", "sq1"];

type Row = { person: WcifPerson; key: string; tasks: Task[]; inRound: boolean; station?: number; seedIndex: number };

export function generateAssignments({ competition, rounds, stations, zoneMode, people, options, slots }: {
  competition: StoredCompetition;
  rounds: GenerationRound[];
  stations: number;
  zoneMode: ZoneMode;
  people: PeopleSettings;
  options: AssignmentOptions;
  /** PRO mode: times of every group of every round. */
  slots?: Map<string, GroupSlot[]>;
}): GeneratedAssignment[] {
  const accepted = acceptedPeople(competition);
  const country = competitionCountry(competition);
  const set = (ids?: string[]) => new Set(ids ?? []);
  const delegates = new Set([...set(people.roles.delegate), ...set(people.roles["trainee-delegate"])]);
  const organizers = set(people.roles.organizer);
  const staff = set(people.roles.staff);
  const dataEntry = set(people.roles.dataentry);
  const trusted = set(people.trustedIds);
  const delegateDuty = set(people.delegateDutyIds);
  const globalLoad = new Map<string, number>();
  // Staff do more than everyone else, but not everything: they keep priority while below
  // twice the average load of the other people who can take normal tasks.
  const STAFF_LOAD_FACTOR = 2;
  let othersTotalLoad = 0;
  const eventLoad = new Map<string, number>();
  const output: GeneratedAssignment[] = [];
  /** PRO mode: when each person is already competing or working, across rounds. */
  const busyTimes = new Map<string, TimeWindow[]>();

  const busyRoles = (key: string) => (delegates.has(key) ? 1 : 0) + (organizers.has(key) ? 1 : 0) + (dataEntry.has(key) ? 1 : 0);
  const normalTasksAllowed = (key: string) => !dataEntry.has(key) && (options.normalTasksForDelegatesAndOrganizers || (!delegates.has(key) && !organizers.has(key)));
  const othersCount = Math.max(1, accepted.filter(person => normalTasksAllowed(personKey(person)) && !staff.has(personKey(person))).length);

  for (const round of rounds.filter(item => item.enabled && item.groups > 0)) {
    const { people: competitors, known } = roundCompetitors(competition, round.id);
    if (!known || competitors.length === 0) continue;
    const firstRound = round.roundNumber === 1;
    const fixed = usesFixedStations(round.roundNumber, competitors.length, stations, zoneMode);
    const groups = splitIntoGroups(competitors, round.groups, firstRound ? options.sortingRule : "ranks", round.eventId);
    if (options.spreadDelegates) spreadRole(groups, person => delegates.has(personKey(person)));

    const roundSlots = slots?.get(round.id);
    const windowsOf = (group: number) => roundSlots?.find(slot => slot.group === group)?.windows ?? [];
    const markBusy = (key: string, group: number) => busyTimes.set(key, [...(busyTimes.get(key) ?? []), ...windowsOf(group)]);
    const busyDuring = (key: string, group: number) => windowsOf(group).some(window => busyTimes.get(key)?.some(busy => overlaps(busy, window)));
    const rows = new Map<string, Row>();
    const seedIndex = new Map(competitors.map((person, index) => [personKey(person), index]));
    groups.forEach((members, groupIndex) => {
      [...members].sort((a, b) => seedIndex.get(personKey(a))! - seedIndex.get(personKey(b))!).forEach((person, index) => {
        const key = personKey(person);
        rows.set(key, { person, key, inRound: true, seedIndex: seedIndex.get(key)!, tasks: [{ group: groupIndex + 1, role: "competitor" }], station: fixed && index < stations ? index + 1 : undefined });
        markBusy(key, groupIndex + 1);
      });
    });
    const rowFor = (person: WcifPerson) => {
      const key = personKey(person);
      if (!rows.has(key)) rows.set(key, { person, key, inRound: false, seedIndex: Number.MAX_SAFE_INTEGER, tasks: [] });
      return rows.get(key)!;
    };
    const ownGroup = (key: string) => rows.get(key)?.tasks.find(task => task.role === "competitor")?.group;
    const freeIn = (key: string, group: number) => !rows.get(key)?.tasks.some(task => task.group === group) && !busyDuring(key, group);
    const roundLoad = (key: string) => rows.get(key)?.tasks.filter(task => task.role !== "competitor").length ?? 0;
    const load = (key: string) => globalLoad.get(key) ?? 0;
    const loadInEvent = (key: string) => eventLoad.get(`${key}|${round.eventId}`) ?? 0;
    // With times, "right before" means the own group starts within ten minutes of this one ending.
    const rightBefore = (own: number, group: number) => {
      const [ownStart, end] = [windowsOf(own)[0]?.start, windowsOf(group)[0]?.end];
      if (!roundSlots) return own === group + 1;
      return !!ownStart && !!end && toMinutes(ownStart) >= toMinutes(end) && toMinutes(ownStart) - toMinutes(end) <= 10;
    };
    const beforeOwn = (key: string, group: number) => {
      const own = ownGroup(key);
      return options.avoidBeforeOwnGroup && own !== undefined && rightBefore(own, group) ? 1 : 0;
    };
    const registeredForEvent = (person: WcifPerson) => !!person.registration?.eventIds?.includes(round.eventId);
    const hasResult = (person: WcifPerson) => seedResult(person, round.eventId) !== undefined;
    const youngerThan10 = (person: WcifPerson) => (ageOf(person) ?? 99) < 10 ? 1 : 0;
    const suitability = (person: WcifPerson) => (hasResult(person) ? 2 : 0) + (registeredForEvent(person) ? 1 : 0);

    const assign = (person: WcifPerson, group: number, role: TaskRole) => {
      const row = rowFor(person);
      row.tasks = sortTasks([...row.tasks, { group, role }]);
      markBusy(row.key, group);
      globalLoad.set(row.key, load(row.key) + 1);
      if (!staff.has(row.key) && (role === "judge" || role === "scrambler" || role === "runner")) othersTotalLoad += 1;
      eventLoad.set(`${row.key}|${round.eventId}`, loadInEvent(row.key) + 1);
    };

    const fill = (role: TaskRole, need: (group: number, size: number) => number, candidates: WcifPerson[], sortKey: (person: WcifPerson, group: number) => number[]) => {
      const sizes = groups.map(members => members.length);
      const needs = sizes.map((size, index) => size === 0 ? 0 : need(index + 1, size));
      // Round-robin across groups so the best candidates are not all used by G1.
      for (let slot = 0; slot < Math.max(0, ...needs); slot += 1) {
        for (let group = 1; group <= groups.length; group += 1) {
          if (slot >= needs[group - 1]) continue;
          const pick = best(candidates.filter(person => freeIn(personKey(person), group)), person => sortKey(person, group));
          if (pick) assign(pick, group, role);
        }
      }
    };

    const strictScramblers = options.sortingRule === "scrambler-safe";
    const inRoundKeys = new Set(competitors.map(personKey));
    // Strict: trusted people, or people with a result in the faster half of the round
    // (never fewer than the slots to fill), so scrambling is spread among good people.
    const fastEnough = Math.max(Math.ceil(competitors.length / 2), round.scramblers * groups.length);
    const scramblerPool = accepted.filter(person => {
      const key = personKey(person);
      if (!normalTasksAllowed(key)) return false;
      if (!inRoundKeys.has(key) && !staff.has(key) && !trusted.has(key)) return false;
      return !strictScramblers || trusted.has(key) || (hasResult(person) && (seedIndex.get(key) ?? Number.MAX_SAFE_INTEGER) < fastEnough);
    });
    fill("scrambler", () => round.scramblers, scramblerPool, (person, group) => {
      const key = personKey(person);
      // Strict: everyone in the pool scrambles once before anyone repeats; then lighter loads, then speed.
      if (strictScramblers) return [roundLoad(key), loadInEvent(key) >= 3 ? 1 : 0, Math.floor(load(key) / 4), trusted.has(key) ? 0 : 1, beforeOwn(key, group), ...bestAverageAndSingle(person, round.eventId)];
      // Groupifier's criteria. Staff are generic here (not scrambling specialists), so they only
      // win among equally suitable people, like trusted people do.
      return [
        options.noTasksForNewcomers && isNewcomer(person) ? 1 : 0,
        youngerThan10(person),
        -suitability(person),
        trusted.has(key) ? 0 : 1,
        staff.has(key) ? 0 : 1,
        busyRoles(key),
        loadInEvent(key) >= 2 ? 1 : 0,
        inRoundKeys.has(key) ? 0 : 1,
        Math.floor(load(key) / 6),
        beforeOwn(key, group),
        ...bestAverageAndSingle(person, round.eventId)];
    });

    if (options.assignDelegateDuties) {
      fill("delegate", () => 1, accepted.filter(person => delegateDuty.has(personKey(person))), (person, group) => {
        const key = personKey(person);
        return [roundLoad(key), beforeOwn(key, group), load(key)];
      });
    }

    if (options.assignDataEntry) {
      fill("dataentry", () => 1, accepted.filter(person => dataEntry.has(personKey(person))), person => [roundLoad(personKey(person)), load(personKey(person))]);
    }

    if (options.assignJudges) {
      const normalPool = accepted.filter(person => normalTasksAllowed(personKey(person)));
      const staffPreferred = (key: string) => staff.has(key) && load(key) < STAFF_LOAD_FACTOR * (othersTotalLoad / othersCount) + 2;
      const othersKey = (role: "runner" | "judge") => (person: WcifPerson, group: number) => {
        const key = personKey(person);
        if (staffPreferred(key)) return [0, load(key), beforeOwn(key, group)];
        return [1,
          role === "runner" && options.noRunningForForeigners && country && person.countryIso2 && person.countryIso2 !== country ? 1 : 0,
          options.noTasksForNewcomers && isNewcomer(person) ? 1 : 0,
          options.tasksForOwnEventsOnly && !registeredForEvent(person) ? 1 : 0,
          youngerThan10(person),
          busyRoles(key),
          loadInEvent(key) >= 2 ? 1 : 0,
          // Coarse load first, so people in many events do not end up with most of the work.
          Math.floor(load(key) / 4),
          inRoundKeys.has(key) ? 0 : 1,
          load(key),
          beforeOwn(key, group),
          role === "judge" ? person.registration?.eventIds?.length ?? 0 : 0];
      };
      fill("runner", () => round.runners, normalPool, othersKey("runner"));
      fill("judge", (_, size) => judgesNeeded(size, stations), normalPool, othersKey("judge"));
    }

    const ordered = [...rows.values()].sort((a, b) => a.seedIndex - b.seedIndex || a.person.name.localeCompare(b.person.name));
    for (const row of ordered) {
      output.push({
        id: `${round.id}:${row.key}`,
        roundId: round.id,
        eventId: round.eventId,
        personId: row.key,
        name: row.person.name,
        wcaId: row.person.wcaId,
        birthdate: row.person.birthdate,
        seedResult: seedResult(row.person, round.eventId),
        inRound: row.inRound,
        station: row.station,
        tasks: row.tasks,
      });
    }
  }

  return output;
}

function best<T>(items: T[], key: (item: T) => number[]) {
  let winner: T | undefined;
  let winnerKey: number[] = [];
  for (const item of items) {
    const itemKey = key(item);
    if (!winner || compareKeys(itemKey, winnerKey) < 0) {
      winner = item;
      winnerKey = itemKey;
    }
  }
  return winner;
}

function compareKeys(a: number[], b: number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Group sizes as even as possible, larger groups first (Groupifier with equal capacities). */
export function groupSizes(competitors: number, groupCount: number) {
  const sizes: number[] = [];
  let remaining = competitors;
  for (let index = 0; index < groupCount; index += 1) {
    const size = Math.round(remaining / (groupCount - index));
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
}

/**
 * Splits competitors (best first) into groups, following Groupifier: the list is ordered
 * worst to best, rearranged by the rule, and then cut into consecutive groups. With "ranks"
 * the best compete in the last group; symmetric rules deal them out one per group.
 */
export function splitIntoGroups(bestFirst: WcifPerson[], groupCount: number, rule: SortingRule, eventId: string): WcifPerson[][] {
  const worstFirst = [...bestFirst].reverse();
  const count = worstFirst.length;
  let ordered = worstFirst;
  const symmetric = rule === "symmetric" || rule === "scrambler-safe" || (rule === "balanced" && !BALANCED_BY_RANKS.includes(eventId));
  if (symmetric) {
    ordered = worstFirst
      .map((person, index) => ({ person, index, key: groupCount - ((count - index - 1) % groupCount) }))
      .sort((a, b) => a.key - b.key || a.index - b.index)
      .map(item => item.person);
  } else if (rule === "name-optimised") {
    ordered = separateSameFirstNames(worstFirst);
  }
  const sizes = groupSizes(count, groupCount);
  const groups: WcifPerson[][] = [];
  let start = 0;
  for (const size of sizes) {
    groups.push(ordered.slice(start, start + size));
    start += size;
  }
  return groups;
}

/** Spreads people sharing a first name as far apart as possible in the list, keeping everyone. */
function separateSameFirstNames(people: WcifPerson[]) {
  const byName = new Map<string, WcifPerson[]>();
  for (const person of people) {
    const name = person.name.split(" ")[0];
    byName.set(name, [...(byName.get(name) ?? []), person]);
  }
  const sets = [...byName.values()].sort((a, b) => a.length - b.length);
  let result: WcifPerson[] = [];
  for (const same of sets) {
    if (!result.length) { result = [...same]; continue; }
    const spaced = [...result];
    const length = result.length;
    // Insert from the back so earlier positions stay valid.
    for (let index = same.length - 1; index >= 0; index -= 1) spaced.splice(Math.floor(((index + 1) * length) / same.length), 0, same[index]);
    result = spaced;
  }
  return result;
}

/** Moves people matching `hasRole` into groups that have none of them, swapping with someone of close seed. */
export function spreadRole(groups: WcifPerson[][], hasRole: (person: WcifPerson) => boolean) {
  for (let guard = 0; guard < groups.length * 4; guard += 1) {
    const counts = groups.map(members => members.filter(hasRole).length);
    const crowded = counts.findIndex(count => count >= 2);
    const empty = counts.findIndex(count => count === 0);
    if (crowded < 0 || empty < 0) return;
    const mover = groups[crowded].find(hasRole)!;
    const position = groups[crowded].indexOf(mover);
    const swapIndex = groups[empty].reduce((closest, person, index) => !hasRole(person) && (closest < 0 || Math.abs(index - position) < Math.abs(closest - position)) ? index : closest, -1);
    if (swapIndex < 0) return;
    const other = groups[empty][swapIndex];
    groups[crowded][position] = other;
    groups[empty][swapIndex] = mover;
  }
}
