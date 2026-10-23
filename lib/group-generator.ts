/*
 * Group and staff assignment. The competitor split and the staff selection criteria follow
 * Groupifier (https://github.com/jonatanklosko/groupifier, Apache-2.0), src/logic/groups.js,
 * adapted to this app's data model. See THIRD_PARTY_NOTICES.md. In PRO mode, groups have real times
 * (lib/pro/schedule.ts) and nobody gets a task while busy elsewhere.
 */
import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import { sortTasks, type GeneratedAssignment, type PickReason, type Task, type TaskRole, type Why } from "@/lib/assignments";
import { unavailableWindows, type Unavailability } from "@/lib/pro/people";
import { scoreBreakdown, type ScoringConfig, type ScoringFacts } from "@/lib/pro/scoring";
import { solveGroupStaff, type IlpCandidate } from "@/lib/pro/staff-ilp";
import { COMPETING_OVERLAP_TOLERANCE, overlapMinutes, overlaps, slotsOverlap, toMinutes, type GroupSlot, type TimeWindow } from "@/lib/pro/schedule";
import { ageOf, competitionCountry, isNewcomer, nonCompetingStaff, type PeopleSettings } from "@/lib/people";
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

type Row = { person: WcifPerson; key: string; tasks: Task[]; inRound: boolean; station?: number; seedIndex: number; why: Why[] };
type CompetitorPlan = {
  round: GenerationRound;
  competitors: WcifPerson[];
  groups: WcifPerson[][];
  fixed: boolean;
  seedIndex: Map<string, number>;
  preferredGroup: Map<string, number>;
};

type Placement = { plan: CompetitorPlan; planIndex: number; group: number; person: WcifPerson };

/**
 * Repairs the independent Groupifier splits as one global schedule. It swaps or moves people
 * between equally-sized groups until nobody competes in overlapping slots, when such a repair
 * exists; when it does not (a multi-blind attempt in another room during a whole round), it
 * leaves each person in the group that overlaps least. Every step lowers the total overlap, so
 * it ends. This runs before any staff duties are assigned.
 */
export function resolveCompetitorOverlaps(plans: CompetitorPlan[], slots: Map<string, GroupSlot[]>) {
  const placements = () => {
    const byPerson = new Map<string, Placement[]>();
    plans.forEach((plan, planIndex) => plan.groups.forEach((members, groupIndex) => members.forEach(person => {
      const key = personKey(person);
      byPerson.set(key, [...(byPerson.get(key) ?? []), { plan, planIndex, group: groupIndex + 1, person }]);
    })));
    return byPerson;
  };
  const slotOf = (placement: Pick<Placement, "plan" | "group">) => slots.get(placement.plan.round.id)?.find(slot => slot.group === placement.group);
  const clashes = (byPerson: Map<string, Placement[]>) => [...byPerson.values()].flatMap(personPlacements => {
    const result: Array<[Placement, Placement]> = [];
    for (let first = 0; first < personPlacements.length; first += 1) {
      for (let second = first + 1; second < personPlacements.length; second += 1) {
        const a = slotOf(personPlacements[first]);
        const b = slotOf(personPlacements[second]);
        if (a && b && slotsOverlap(a, b)) result.push([personPlacements[first], personPlacements[second]]);
      }
    }
    return result;
  });
  /** Minutes this person would compete twice at once if placed in `group`. */
  const cost = (byPerson: Map<string, Placement[]>, person: WcifPerson, planIndex: number, group: number) => {
    const candidate = slots.get(plans[planIndex].round.id)?.find(slot => slot.group === group);
    if (!candidate) return 0;
    return (byPerson.get(personKey(person)) ?? []).reduce((sum, other) => {
      if (other.planIndex === planIndex) return sum;
      const occupied = slotOf(other);
      if (!occupied) return sum;
      // A short overlap is going from one event to the next: nearly free, but a clean gap still wins.
      const minutes = overlapMinutes(candidate, occupied);
      return sum + (minutes <= COMPETING_OVERLAP_TOLERANCE ? minutes / 1000 : minutes);
    }, 0);
  };
  const flexibility = (byPerson: Map<string, Placement[]>, placement: Placement) => placement.plan.groups.reduce((count, _, index) => count + (cost(byPerson, placement.person, placement.planIndex, index + 1) === 0 ? 1 : 0), 0);
  const moveCost = (plan: CompetitorPlan, person: WcifPerson, group: number) => Math.abs((plan.preferredGroup.get(personKey(person)) ?? group) - group);

  const tryRelocate = (byPerson: Map<string, Placement[]>, placement: Placement) => {
    const { plan, planIndex, group: fromGroup, person } = placement;
    const source = plan.groups[fromGroup - 1];
    const sourceIndex = source.findIndex(candidate => personKey(candidate) === personKey(person));
    const current = cost(byPerson, person, planIndex, fromGroup);
    const costs = new Map(plan.groups.map((_, index) => [index + 1, cost(byPerson, person, planIndex, index + 1)]));
    const targets = plan.groups.map((_, index) => index + 1)
      .filter(group => group !== fromGroup && costs.get(group)! < current)
      .sort((a, b) => costs.get(a)! - costs.get(b)! || moveCost(plan, person, a) - moveCost(plan, person, b) || a - b);
    for (const targetGroup of targets) {
      const target = plan.groups[targetGroup - 1];
      const nextSizes = plan.groups.map((members, index) => members.length + (index === fromGroup - 1 ? -1 : index === targetGroup - 1 ? 1 : 0));
      if (Math.max(...nextSizes) - Math.min(...nextSizes) <= 1) {
        source.splice(sourceIndex, 1);
        target.push(person);
        return true;
      }
      const swappers = [...target].sort((a, b) => {
        const aCost = moveCost(plan, person, targetGroup) + moveCost(plan, a, fromGroup);
        const bCost = moveCost(plan, person, targetGroup) + moveCost(plan, b, fromGroup);
        return aCost - bCost || (plan.seedIndex.get(personKey(a)) ?? 0) - (plan.seedIndex.get(personKey(b)) ?? 0);
      });
      for (const swapper of swappers) {
        // The swapper must not end up worse off, so the total overlap still goes down.
        if (cost(byPerson, swapper, planIndex, fromGroup) > cost(byPerson, swapper, planIndex, targetGroup)) continue;
        const targetIndex = target.findIndex(candidate => personKey(candidate) === personKey(swapper));
        source[sourceIndex] = swapper;
        target[targetIndex] = person;
        return true;
      }
    }
    return false;
  };

  const limit = Math.max(1, plans.reduce((sum, plan) => sum + plan.competitors.length, 0) * 4);
  for (let iteration = 0; iteration < limit; iteration += 1) {
    const byPerson = placements();
    const conflicts = clashes(byPerson);
    if (!conflicts.length) return;
    let repaired = false;
    for (const conflict of conflicts) {
      const choices = [...conflict].sort((a, b) => flexibility(byPerson, b) - flexibility(byPerson, a) || b.plan.groups.length - a.plan.groups.length || a.planIndex - b.planIndex);
      if (choices.some(choice => tryRelocate(byPerson, choice))) { repaired = true; break; }
    }
    if (!repaired) return;
  }
}


export function generateAssignments({ competition, rounds, stations, zoneMode, people, options, slots, eventWindows, extraPeople = [], unavailable = [], eligible = {}, staffing, scoring, personProperties = {} }: {
  competition: StoredCompetition;
  rounds: GenerationRound[];
  stations: number;
  zoneMode: ZoneMode;
  people: PeopleSettings;
  options: AssignmentOptions;
  /** PRO mode: times of every group of every round. */
  slots?: Map<string, GroupSlot[]>;
  /** PRO mode: extra times when an event's competitors are busy (multi-blind cube submission). */
  eventWindows?: Map<string, TimeWindow[]>;
  /** PRO mode: volunteers who do not compete; they can take staff tasks. */
  extraPeople?: WcifPerson[];
  /** PRO mode: times when people cannot be given tasks (needs `slots`). */
  unavailable?: Unavailability[];
  /** PRO mode: who (keys) may judge, scramble or run, per event; absent means the usual rules. */
  eligible?: Partial<Record<"judge" | "scrambler" | "runner", Map<string, Set<string>>>>;
  /** PRO mode: stations and staff per group where a room or stage overrides the round's values. */
  staffing?: (roundId: string, group: number) => { stations?: number; scramblers?: number; runners?: number } | undefined;
  /** PRO mode: weighted criteria; scramblers, runners and judges are then chosen per group by an integer program. */
  scoring?: ScoringConfig;
  /** PRO mode: person properties, for preference weights (`weight-judge`…). */
  personProperties?: Record<string, Record<string, string>>;
}): GeneratedAssignment[] {
  const accepted = [...acceptedPeople(competition), ...nonCompetingStaff(competition), ...extraPeople];
  const country = competitionCountry(competition);
  const set = (ids?: string[]) => new Set(ids ?? []);
  const delegates = new Set([...set(people.roles.delegate), ...set(people.roles["trainee-delegate"])]);
  const organizers = set(people.roles.organizer);
  // Volunteers who do not compete come to work: they count as staff.
  const staff = new Set([...set(people.roles.staff), ...extraPeople.map(personKey)]);
  const dataEntry = set(people.roles.dataentry);
  const noTasks = set(people.roles.notasks);
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
  const weighted = !!(scoring?.enabled && slots);
  /** Weighted engine: staff tasks given so far, in minutes since 1970 (for streaks and hours per day). */
  const staffLog = new Map<string, Array<{ start: number; end: number; role: TaskRole }>>();
  /** Start minutes of the groups each person competes in. */
  const competingStarts = new Map<string, number[]>();

  const busyRoles = (key: string) => (delegates.has(key) ? 1 : 0) + (organizers.has(key) ? 1 : 0) + (dataEntry.has(key) ? 1 : 0);
  const normalTasksAllowed = (key: string) => !dataEntry.has(key) && !noTasks.has(key) && (options.normalTasksForDelegatesAndOrganizers || (!delegates.has(key) && !organizers.has(key)));
  const othersCount = Math.max(1, accepted.filter(person => normalTasksAllowed(personKey(person)) && !staff.has(personKey(person))).length);

  // Build every competitor split first. In PRO mode they are then repaired together, so the
  // order in which rounds happen to appear in the WCIF cannot create avoidable clashes.
  const plans: CompetitorPlan[] = rounds.filter(item => item.enabled && item.groups > 0).flatMap(round => {
    const { people: competitors, known } = roundCompetitors(competition, round.id);
    if (!known || competitors.length === 0) return [];
    const firstRound = round.roundNumber === 1;
    const fixed = usesFixedStations(round.roundNumber, competitors.length, stations, zoneMode);
    const groups = splitIntoGroups(competitors, round.groups, firstRound ? options.sortingRule : "ranks", round.eventId);
    if (options.spreadDelegates) spreadRole(groups, person => delegates.has(personKey(person)));
    const seedIndex = new Map(competitors.map((person, index) => [personKey(person), index]));
    const preferredGroup = new Map<string, number>();
    groups.forEach((members, groupIndex) => members.forEach(person => preferredGroup.set(personKey(person), groupIndex + 1)));
    return [{ round, competitors, groups, fixed, seedIndex, preferredGroup }];
  });
  if (slots) resolveCompetitorOverlaps(plans, slots);

  // Every competition slot is occupied before staff allocation starts. Staff selection therefore
  // sees future rounds as well as earlier ones and cannot hide a competitor clash through ordering.
  if (slots) {
    for (const plan of plans) plan.groups.forEach((members, groupIndex) => {
      const windows = [...(slots.get(plan.round.id)?.find(slot => slot.group === groupIndex + 1)?.windows ?? []), ...(eventWindows?.get(plan.round.eventId) ?? [])];
      for (const person of members) {
        const key = personKey(person);
        busyTimes.set(key, [...(busyTimes.get(key) ?? []), ...windows]);
      }
    });
    // Unavailable people get no tasks then; "while X competes" follows X's groups as placed.
    const competing = new Map<string, TimeWindow[]>();
    for (const plan of plans) plan.groups.forEach((members, groupIndex) => {
      const windows = slots.get(plan.round.id)?.find(slot => slot.group === groupIndex + 1)?.windows ?? [];
      for (const person of members) competing.set(personKey(person), [...(competing.get(personKey(person)) ?? []), ...windows]);
    });
    for (const [key, windows] of competing) competingStarts.set(key, windows.map(window => toMinutes(window.start)));
    for (const [key, windows] of unavailableWindows(unavailable, other => competing.get(other) ?? [])) busyTimes.set(key, [...(busyTimes.get(key) ?? []), ...windows]);
  }

  // The weighted engine counts hours and streaks, so it staffs rounds in time order; the output
  // keeps the rounds' order.
  const firstStart = (plan: CompetitorPlan) => Math.min(...(slots?.get(plan.round.id) ?? []).flatMap(slot => slot.windows.map(window => toMinutes(window.start))), Number.MAX_SAFE_INTEGER);
  const staffingOrder = weighted ? [...plans].sort((a, b) => firstStart(a) - firstStart(b)) : plans;
  const outputByRound = new Map<string, GeneratedAssignment[]>();

  for (const plan of staffingOrder) {
    const { round, competitors, groups, fixed, seedIndex } = plan;
    const roundOutput: GeneratedAssignment[] = [];
    outputByRound.set(round.id, roundOutput);

    const roundSlots = slots?.get(round.id);
    const windowsOf = (group: number) => roundSlots?.find(slot => slot.group === group)?.windows ?? [];
    const markBusy = (key: string, group: number) => busyTimes.set(key, [...(busyTimes.get(key) ?? []), ...windowsOf(group)]);
    const busyDuring = (key: string, group: number) => windowsOf(group).some(window => busyTimes.get(key)?.some(busy => overlaps(busy, window)));
    const rows = new Map<string, Row>();
    const stationsIn = (group: number) => staffing?.(round.id, group)?.stations ?? stations;
    groups.forEach((members, groupIndex) => {
      [...members].sort((a, b) => seedIndex.get(personKey(a))! - seedIndex.get(personKey(b))!).forEach((person, index) => {
        const key = personKey(person);
        rows.set(key, { person, key, inRound: true, seedIndex: seedIndex.get(key)!, tasks: [{ group: groupIndex + 1, role: "competitor" }], station: fixed && index < stationsIn(groupIndex + 1) ? index + 1 : undefined, why: [] });
      });
    });
    const rowFor = (person: WcifPerson) => {
      const key = personKey(person);
      if (!rows.has(key)) rows.set(key, { person, key, inRound: false, seedIndex: Number.MAX_SAFE_INTEGER, tasks: [], why: [] });
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
      const window = windowsOf(group)[0];
      if (window) staffLog.set(row.key, [...(staffLog.get(row.key) ?? []), { start: toMinutes(window.start), end: toMinutes(window.end), role }]);
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
          const available = candidates.filter(person => freeIn(personKey(person), group));
          const pick = best(available, person => sortKey(person, group));
          if (!pick) continue;
          const key = personKey(pick);
          const why: Why = { group, role, candidates: available.length, load: load(key), reasons: reasonsFor(role, key, group) };
          assign(pick, group, role);
          rowFor(pick).why.push(why);
        }
      }
    };

    const allowed = (role: "judge" | "scrambler" | "runner") => eligible[role]?.get(round.eventId);
    const volunteers = new Set(extraPeople.map(personKey));
    const reasonsFor = (role: TaskRole, key: string, group: number): PickReason[] => {
      const reasons: PickReason[] = [];
      if (role === "delegate") reasons.push("delegateDuty");
      if (role === "dataentry") reasons.push("dataEntry");
      if (volunteers.has(key)) reasons.push("volunteer");
      else if (staff.has(key) && role !== "delegate" && role !== "dataentry") reasons.push("staff");
      if (trusted.has(key) && role === "scrambler") reasons.push("trusted");
      if ((role === "judge" || role === "scrambler" || role === "runner") && allowed(role)) reasons.push("segment");
      else if (role === "scrambler" && strictScramblers && !trusted.has(key)) reasons.push("fastHalf");
      if (!inRoundKeys.has(key)) reasons.push("notInRound");
      if (beforeOwn(key, group)) reasons.push("beforeOwn");
      return reasons;
    };
    const strictScramblers = options.sortingRule === "scrambler-safe";
    const inRoundKeys = new Set(competitors.map(personKey));
    // Strict: trusted people, or people with a result in the faster half of the round
    // (never fewer than the slots to fill), so scrambling is spread among good people.
    const fastEnough = Math.max(Math.ceil(competitors.length / 2), round.scramblers * groups.length);
    const scramblerPool = accepted.filter(person => {
      const key = personKey(person);
      if (!normalTasksAllowed(key)) return false;
      // A scrambler segment (PRO) replaces the built-in speed rule.
      if (allowed("scrambler")) return allowed("scrambler")!.has(key);
      if (!inRoundKeys.has(key) && !staff.has(key) && !trusted.has(key)) return false;
      return !strictScramblers || trusted.has(key) || (hasResult(person) && (seedIndex.get(key) ?? Number.MAX_SAFE_INTEGER) < fastEnough);
    });
    const scramblersNeeded = (group: number) => staffing?.(round.id, group)?.scramblers ?? round.scramblers;
    const runnersNeeded = (group: number) => staffing?.(round.id, group)?.runners ?? round.runners;
    if (!weighted) fill("scrambler", scramblersNeeded, scramblerPool, (person, group) => {
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

    const normalPool = accepted.filter(person => normalTasksAllowed(personKey(person)));
    const poolFor = (role: "runner" | "judge") => allowed(role) ? normalPool.filter(person => allowed(role)!.has(personKey(person))) : normalPool;

    if (weighted) {
      // Weighted engine: every group of the round, in time order, gets its scramblers, runners and
      // judges together from an integer program over the people free and allowed for each job.
      const scramblerKeys = new Set(scramblerPool.map(personKey));
      const startOf = (group: number) => toMinutes(windowsOf(group)[0]?.start ?? "1970-01-01T00:00");
      const endOf = (group: number) => toMinutes(windowsOf(group)[0]?.end ?? "1970-01-01T00:00");
      const streak = (key: string, start: number, sameRole?: TaskRole) => {
        const log = staffLog.get(key) ?? [];
        let minutes = 0;
        let cursor = start;
        for (;;) {
          const previous = log.find(entry => Math.abs(entry.end - cursor) <= 1 && (!sameRole || entry.role === sameRole));
          if (!previous) return minutes;
          minutes += previous.end - previous.start;
          cursor = previous.start;
        }
      };
      const factsFor = (person: WcifPerson, group: number, job: TaskRole): ScoringFacts => {
        const key = personKey(person);
        const [start, end] = [startOf(group), endOf(group)];
        const day = Math.floor(start / 1440);
        const preference = Number(personProperties[key]?.[`weight-${job}`]);
        return {
          load: load(key),
          hoursToday: (staffLog.get(key) ?? []).filter(entry => Math.floor(entry.start / 1440) === day && entry.end <= start).reduce((sum, entry) => sum + (entry.end - entry.start) / 60, 0),
          sameJobStreak: streak(key, start, job),
          staffStreak: streak(key, start) + (end - start),
          competesRightAfter: (competingStarts.get(key) ?? []).some(other => other >= end && other - end <= 10),
          competesInEvent: registeredForEvent(person) && !delegates.has(key),
          canScramble: scramblerKeys.has(key),
          isStaff: staff.has(key),
          isTrusted: trusted.has(key),
          speed: hasResult(person) && seedIndex.has(key) ? 1 - seedIndex.get(key)! / Math.max(1, competitors.length) : 0,
          preference: Number.isFinite(preference) ? preference : 0,
          youngerThan10: !!youngerThan10(person),
        };
      };
      // The usual options stay as near-hard rules.
      const penalty = (person: WcifPerson, job: TaskRole) => {
        const key = personKey(person);
        let value = -20 * busyRoles(key);
        if (options.noTasksForNewcomers && isNewcomer(person)) value -= 5000;
        if (options.tasksForOwnEventsOnly && !registeredForEvent(person)) value -= 5000;
        if (job === "runner" && options.noRunningForForeigners && country && person.countryIso2 && person.countryIso2 !== country) value -= 5000;
        return value;
      };
      const groupOrder = groups.map((_, index) => index + 1).sort((a, b) => startOf(a) - startOf(b) || a - b);
      for (const group of groupOrder) {
        const size = groups[group - 1].length;
        if (!size) continue;
        const needs: Partial<Record<TaskRole, number>> = { scrambler: scramblersNeeded(group), ...(options.assignJudges ? { runner: runnersNeeded(group), judge: judgesNeeded(size, stationsIn(group)) } : {}) };
        const candidates: Array<IlpCandidate & { person: WcifPerson; breakdown: Partial<Record<string, number>> }> = [];
        const counts: Partial<Record<TaskRole, number>> = {};
        for (const [job, need] of Object.entries(needs) as Array<[TaskRole, number]>) {
          if (!need) continue;
          const pool = (job === "scrambler" ? scramblerPool : poolFor(job as "runner" | "judge")).filter(person => freeIn(personKey(person), group));
          counts[job] = pool.length;
          const scored = pool.map(person => {
            const breakdown = scoreBreakdown(factsFor(person, group, job), job, scoring!.weights);
            const score = Object.values(breakdown).reduce((sum, value) => sum + (value ?? 0), 0) + penalty(person, job);
            return { key: personKey(person), job, score, person, breakdown };
          }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
          // The best few per seat keep the program small without changing its answer in practice.
          candidates.push(...scored.slice(0, Math.max(need * 6, 40)));
        }
        for (const [key, job] of solveGroupStaff(needs, candidates)) {
          const chosen = candidates.find(candidate => candidate.key === key && candidate.job === job)!;
          const why: Why = { group, role: job, candidates: counts[job] ?? 0, load: load(key), reasons: reasonsFor(job, key, group), score: Math.round(chosen.score * 10) / 10, breakdown: chosen.breakdown };
          assign(chosen.person, group, job);
          rowFor(chosen.person).why.push(why);
        }
      }
    }

    if (options.assignJudges && !weighted) {
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
      fill("runner", runnersNeeded, poolFor("runner"), othersKey("runner"));
      fill("judge", (group, size) => judgesNeeded(size, stationsIn(group)), poolFor("judge"), othersKey("judge"));
    }

    const ordered = [...rows.values()].sort((a, b) => a.seedIndex - b.seedIndex || a.person.name.localeCompare(b.person.name));
    for (const row of ordered) {
      roundOutput.push({
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
        ...(row.why.length ? { why: row.why } : {}),
      });
    }
  }

  for (const plan of plans) output.push(...(outputByRound.get(plan.round.id) ?? []));
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
