/*
 * Group and staff assignment. The competitor split and the staff selection criteria follow
 * Groupifier (https://github.com/jonatanklosko/groupifier, Apache-2.0), src/logic/groups.js,
 * adapted to this app's data model. See THIRD_PARTY_NOTICES.md. In PRO mode, groups have real times
 * (lib/pro/schedule.ts) and nobody gets a task while busy elsewhere.
 */
import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import { sortTasks, type GeneratedAssignment, type PickReason, type Task, type TaskRole, type Why } from "@/lib/assignments";
import type { ResolvedSet } from "@/lib/pro/assignment-sets";
import { assignStations, type ResolvedStationRule } from "@/lib/pro/station-rules";
import { unavailableWindows, type Unavailability } from "@/lib/pro/people";
import { scoreBreakdown, type ScoringConfig, type ScoringFacts } from "@/lib/pro/scoring";
import { solveGroupStaff, type IlpCandidate } from "@/lib/pro/staff-ilp";
import { COMPETING_OVERLAP_TOLERANCE, overlapMinutes, overlaps, slotsOverlap, toMinutes, windowsForTask, type GroupSlot, type TimeWindow } from "@/lib/pro/schedule";
import { ageOf, competitionCountry, hasWcaJob, isNewcomer, nonCompetingStaff, type PeopleSettings } from "@/lib/people";
import { acceptedPeople, bestAverageAndSingle, SCRAMBLE_EVENT, judgesNeeded, personKey, roundCompetitors, seedResult, usesFixedStations, type GenerationRound, type SortingRule, type ZoneMode } from "@/lib/rounds";

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
  /** Which task chooses first among the free people (rules), or is filled first when people run short (scoring). */
  taskOrder: TaskOrderItem[];
};

export const TASK_ORDER_ITEMS = ["delegate", "scrambler", "dataentry", "runner", "judge"] as const;
export type TaskOrderItem = typeof TASK_ORDER_ITEMS[number];

/** A complete order of the five tasks, whatever was saved. */
export function normalizeTaskOrder(order: unknown): TaskOrderItem[] {
  const known = Array.isArray(order) ? order.filter((item, index): item is TaskOrderItem => (TASK_ORDER_ITEMS as readonly string[]).includes(item) && order.indexOf(item) === index) : [];
  return [...known, ...TASK_ORDER_ITEMS.filter(item => !known.includes(item))];
}

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
  taskOrder: [...TASK_ORDER_ITEMS],
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
  /** People placed by an assignment set may only move among that set's groups. */
  allowed?: Map<string, Set<number>>;
  /** The assignment set that placed each person: moves swap people of the same set only. */
  setOf?: Map<string, string>;
  /** People marked as featured on their scorecard. */
  featured?: Set<string>;
  /** Group sizes to keep when some stages have a maximum per group (otherwise groups stay even). */
  targets?: number[];
};

const allowedIn = (plan: Pick<CompetitorPlan, "allowed">, person: WcifPerson, group: number) => plan.allowed?.get(personKey(person))?.has(group) ?? true;
/** Swapping two people keeps every set's count per group (4 featured per group stay 4). */
const sameSet = (plan: Pick<CompetitorPlan, "setOf">, a: WcifPerson, b: WcifPerson) => plan.setOf?.get(personKey(a)) === plan.setOf?.get(personKey(b));

type Placement = { plan: CompetitorPlan; planIndex: number; group: number; person: WcifPerson };

/**
 * Repairs the independent Groupifier splits as one global schedule. It swaps or moves people
 * between equally-sized groups until nobody competes in overlapping slots, when such a repair
 * exists; when it does not (a multi-blind attempt in another room during a whole round), it
 * leaves each person in the group that overlaps least. Every step lowers the total overlap, so
 * it ends. This runs before any staff duties are assigned.
 */
/**
 * Times to keep a person free when placing competitors: a room team's work (weight 0.1), or tasks
 * already fixed and times the person is unavailable (weight 1; `competing` ones allow the short walk
 * from one event to the next).
 */
type Reserved = Map<string, Array<{ roundId: string; window: TimeWindow; weight?: number; competing?: boolean }>>;

export function resolveCompetitorOverlaps(plans: CompetitorPlan[], slots: Map<string, GroupSlot[]>, reserved?: Reserved) {
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
    }, 0) + (reserved?.get(personKey(person)) ?? []).reduce((sum, { roundId, window, weight = 0.1, competing }) => {
      // A room team's working times weigh less than competing twice, and never in the room's own rounds.
      if (roundId === plans[planIndex].round.id) return sum;
      const minutes = overlapMinutes(candidate, { windows: [window] });
      return sum + (competing && minutes <= COMPETING_OVERLAP_TOLERANCE ? minutes / 1000 : minutes * weight);
    }, 0);
  };
  const flexibility = (byPerson: Map<string, Placement[]>, placement: Placement) => placement.plan.groups.reduce((count, _, index) => count + (cost(byPerson, placement.person, placement.planIndex, index + 1) === 0 ? 1 : 0), 0);
  const moveCost = (plan: CompetitorPlan, person: WcifPerson, group: number) => Math.abs((plan.preferredGroup.get(personKey(person)) ?? group) - group);

  /**
   * Moves someone to a group with less overlap. `strict`: people placed by a set only swap with
   * someone of the same set, so every set keeps its count per group; when that cannot fix a real
   * clash, the clash wins and any swap that lowers the overlap is allowed.
   */
  const tryRelocate = (byPerson: Map<string, Placement[]>, placement: Placement, strict: boolean) => {
    const { plan, planIndex, group: fromGroup, person } = placement;
    const source = plan.groups[fromGroup - 1];
    const sourceIndex = source.findIndex(candidate => personKey(candidate) === personKey(person));
    const current = cost(byPerson, person, planIndex, fromGroup);
    const costs = new Map(plan.groups.map((_, index) => [index + 1, cost(byPerson, person, planIndex, index + 1)]));
    const targets = plan.groups.map((_, index) => index + 1)
      .filter(group => group !== fromGroup && costs.get(group)! < current && allowedIn(plan, person, group))
      .sort((a, b) => costs.get(a)! - costs.get(b)! || moveCost(plan, person, a) - moveCost(plan, person, b) || a - b);
    for (const targetGroup of targets) {
      const target = plan.groups[targetGroup - 1];
      const nextSizes = plan.groups.map((members, index) => members.length + (index === fromGroup - 1 ? -1 : index === targetGroup - 1 ? 1 : 0));
      // A move keeps groups even, or within their target sizes when stages have a maximum.
      const fits = plan.targets ? nextSizes[targetGroup - 1] <= plan.targets[targetGroup - 1] : Math.max(...nextSizes) - Math.min(...nextSizes) <= 1;
      if (fits && (!strict || !plan.setOf?.has(personKey(person)))) {
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
        if (!allowedIn(plan, swapper, fromGroup) || (strict && !sameSet(plan, person, swapper))) continue;
        const targetIndex = target.findIndex(candidate => personKey(candidate) === personKey(swapper));
        source[sourceIndex] = swapper;
        target[targetIndex] = person;
        return true;
      }
    }
    return false;
  };

  /** Placements of room-team members that overlap their room's working times (outside its own rounds). */
  const reservedClashes = (byPerson: Map<string, Placement[]>) => [...(reserved?.keys() ?? [])].flatMap(key => (byPerson.get(key) ?? []).flatMap(placement => {
    const slot = slotOf(placement);
    const hits = slot ? reserved!.get(key)!.filter(({ roundId, window, competing }) => roundId !== placement.plan.round.id && overlapMinutes(slot, { windows: [window] }) > (competing ? COMPETING_OVERLAP_TOLERANCE : 0)) : [];
    // Fixed tasks (weight 1) are real clashes; a room team's time is only a preference.
    return hits.length ? [{ choices: [placement], hard: hits.some(hit => (hit.weight ?? 0.1) >= 1) }] : [];
  }));

  const limit = Math.max(1, plans.reduce((sum, plan) => sum + plan.competitors.length, 0) * 4);
  for (let iteration = 0; iteration < limit; iteration += 1) {
    const byPerson = placements();
    const conflicts = clashes(byPerson);
    // Competing twice first; then keeping room teams free, when a move makes nobody worse off.
    const candidates = [...conflicts.map(conflict => ({ choices: conflict as Placement[], hard: true })), ...reservedClashes(byPerson)];
    if (!candidates.length) return;
    let repaired = false;
    // First within each set; then, for real clashes only, across sets: a working schedule comes first.
    for (const strict of [true, false]) {
      for (const { choices, hard } of candidates) {
        if (!strict && !hard) continue;
        const ordered = [...choices].sort((a, b) => flexibility(byPerson, b) - flexibility(byPerson, a) || b.plan.groups.length - a.plan.groups.length || a.planIndex - b.planIndex);
        if (ordered.some(choice => tryRelocate(byPerson, choice, strict))) { repaired = true; break; }
      }
      if (repaired) break;
    }
    if (!repaired) return;
  }
}


export function generateAssignments({ competition, rounds, stations, zoneMode, people, options, slots, eventWindows, extraPeople = [], unavailable = [], eligible = {}, staffing, scoring, personProperties = {}, laneTeams, assignmentSets, stationRules, fixedAssignments = [] }: {
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
  staffing?: (roundId: string, group: number) => { stations?: number; scramblers?: number; runners?: number; maxPerGroup?: number } | undefined;
  /** PRO mode: weighted criteria; scramblers, runners and judges are then chosen per group by an integer program. */
  scoring?: ScoringConfig;
  /** PRO mode: person properties, for preference weights (`weight-judge`…). */
  personProperties?: Record<string, Record<string, string>>;
  /**
   * PRO mode: teams dedicated to a room or stage (a side room team). Members come first for that
   * room's tasks and get no tasks anywhere else.
   */
  laneTeams?: { forGroup: (roundId: string, group: number) => Set<string> | undefined; members: Set<string> };
  /** PRO mode: ordered assignment sets of each round (CompScript's AssignmentSet). */
  assignmentSets?: (round: GenerationRound) => ResolvedSet[];
  /** PRO mode: station rule of each group of a round (CompScript's StationAssignmentRule), for fixed stations. */
  stationRules?: (round: GenerationRound) => Map<number, ResolvedStationRule>;
  /**
   * Mid-competition: assignments of rounds already done or kept, which are not generated again.
   * Their competing and staff times, loads and streaks count for the new rounds.
   */
  fixedAssignments?: GeneratedAssignment[];
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
  const avoid = set(people.roles.avoid);
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

  // People with another job: tasks only when nobody else can (Groupifier's busy roles and staff-other).
  const busyRoles = (key: string) => (delegates.has(key) ? 1 : 0) + (organizers.has(key) ? 1 : 0) + (dataEntry.has(key) ? 1 : 0) + (avoid.has(key) ? 1 : 0);
  const normalTasksAllowed = (key: string) => !dataEntry.has(key) && !noTasks.has(key) && (options.normalTasksForDelegatesAndOrganizers || (!delegates.has(key) && !organizers.has(key)));
  const othersCount = Math.max(1, accepted.filter(person => normalTasksAllowed(personKey(person)) && !staff.has(personKey(person))).length);

  // Build every competitor split first. In PRO mode they are then repaired together, so the
  // order in which rounds happen to appear in the WCIF cannot create avoidable clashes.
  // Multi-blind: later attempts are columns of their own that repeat their attempt-1 column's
  // competitors. People are split over the attempt-1 columns, which hold every attempt's times.
  const linkedColumns = (roundId: string) => slots?.get(roundId)?.filter(slot => slot.linkedTo) ?? [];
  const competingSlots = slots && new Map([...slots].map(([roundId, list]) => [roundId, list.filter(slot => !slot.linkedTo).map(slot => ({ ...slot, windows: [...slot.windows, ...list.filter(other => other.linkedTo === slot.group).flatMap(other => other.windows)] }))]));
  const plans: CompetitorPlan[] = rounds.filter(item => item.enabled && item.groups > 0).flatMap(round => {
    const { people: competitors, known } = roundCompetitors(competition, round.id);
    if (!known || competitors.length === 0) return [];
    const firstRound = round.roundNumber === 1;
    const fixed = usesFixedStations(round.roundNumber, competitors.length, stations, zoneMode);
    const rule = firstRound ? options.sortingRule : "ranks";
    const primary = Math.max(1, round.groups - linkedColumns(round.id).length);
    // Stages with a maximum per group keep to it; the other groups take the rest.
    const caps = Array.from({ length: primary }, (_, index) => staffing?.(round.id, index + 1)?.maxPerGroup);
    const targets = caps.some(cap => cap !== undefined) ? groupTargets(competitors.length, caps) : undefined;
    const sets = assignmentSets?.({ ...round, groups: primary }) ?? [];
    const { groups, allowed, featured, setOf } = sets.length ? splitWithSets(competitors, primary, sets, rule, round.eventId, targets)
      : { groups: targets ? fillByRule(competitors, targets, rule, round.eventId) : splitIntoGroups(competitors, primary, rule, round.eventId), allowed: undefined, featured: undefined, setOf: undefined };
    if (options.spreadDelegates) spreadRole(groups, person => delegates.has(personKey(person)), (person, group) => allowedIn({ allowed }, person, group), (a, b) => sameSet({ setOf }, a, b));
    const seedIndex = new Map(competitors.map((person, index) => [personKey(person), index]));
    const preferredGroup = new Map<string, number>();
    groups.forEach((members, groupIndex) => members.forEach(person => preferredGroup.set(personKey(person), groupIndex + 1)));
    return [{ round, competitors, groups, fixed, seedIndex, preferredGroup, allowed, featured, targets, setOf }];
  });
  // Room teams (the side room team) are kept free to work in their room when that is possible.
  const reserved: Reserved = new Map();
  /** Windows of each fixed task, from the schedule. */
  const fixedTasks = fixedAssignments.flatMap(item => item.tasks.map(task => {
    const slot = slots?.get(item.roundId)?.find(candidate => candidate.group === task.group);
    return { item, task, windows: slot ? windowsForTask(slot, task.role) : [] };
  }));
  // New rounds' competitors keep away from the groups they already compete or work in.
  for (const { item, task, windows } of fixedTasks) {
    for (const window of windows) reserved.set(item.personId, [...(reserved.get(item.personId) ?? []), { roundId: item.roundId, window, weight: 1, competing: task.role === "competitor" }]);
  }
  // Busy times (a team's or a person's, with a start and an end) count as clashes: they compete in
  // another group when one is free. "While X competes" follows X's groups, which are not placed yet.
  for (const item of unavailable) {
    if (item.whileCompeting !== undefined || !item.start || !item.end || item.end <= item.start) continue;
    reserved.set(item.personKey, [...(reserved.get(item.personKey) ?? []), { roundId: "", window: { start: item.start, end: item.end }, weight: 1 }]);
  }
  if (slots && laneTeams) for (const plan of plans) plan.groups.forEach((members, index) => {
    if (!members.length) return;
    const windows = competingSlots!.get(plan.round.id)?.find(slot => slot.group === index + 1)?.windows ?? [];
    for (const key of laneTeams.forGroup(plan.round.id, index + 1) ?? []) reserved.set(key, [...(reserved.get(key) ?? []), ...windows.map(window => ({ roundId: plan.round.id, window }))]);
  });
  if (competingSlots) resolveCompetitorOverlaps(plans, competingSlots, reserved.size ? reserved : undefined);
  // Then every attempt column takes its attempt-1 column's competitors.
  for (const plan of plans) {
    for (const linked of linkedColumns(plan.round.id)) plan.groups[linked.group - 1] = [...(plan.groups[linked.linkedTo! - 1] ?? [])];
    for (let index = 0; index < plan.groups.length; index += 1) plan.groups[index] ??= [];
  }

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
    for (const { item, windows } of fixedTasks) busyTimes.set(item.personId, [...(busyTimes.get(item.personId) ?? []), ...windows]);
    // Unavailable people get no tasks then; "while X competes" follows X's groups as placed.
    const competing = new Map<string, TimeWindow[]>();
    for (const { item, task, windows } of fixedTasks) if (task.role === "competitor") competing.set(item.personId, [...(competing.get(item.personId) ?? []), ...windows]);
    for (const plan of plans) plan.groups.forEach((members, groupIndex) => {
      const windows = slots.get(plan.round.id)?.find(slot => slot.group === groupIndex + 1)?.windows ?? [];
      for (const person of members) competing.set(personKey(person), [...(competing.get(personKey(person)) ?? []), ...windows]);
    });
    for (const [key, windows] of competing) competingStarts.set(key, windows.map(window => toMinutes(window.start)));
    for (const [key, windows] of unavailableWindows(unavailable, other => competing.get(other) ?? [])) busyTimes.set(key, [...(busyTimes.get(key) ?? []), ...windows]);
  }

  const teamHere = (roundId: string, group: number, key: string) => !!laneTeams?.forGroup(roundId, group)?.has(key);
  /** Members of a room's team work only in that room. */
  const blockedHere = (roundId: string, group: number, key: string) => !!laneTeams?.members.has(key) && !teamHere(roundId, group, key);

  // Delegate duty is planned for the whole competition first, scarcest group first: groups in a
  // side room, or at times when most delegates compete, are served before the busy main stages
  // take every delegate.
  const taskOrder = normalizeTaskOrder(options.taskOrder);
  // First in the order: delegates' duty times are reserved before any other task is given.
  const delegateFirst = taskOrder[0] === "delegate";
  const delegatePlan = new Map<string, { key: string; candidates: number }>();
  if (options.assignDelegateDuties) {
    const candidates = accepted.filter(person => delegateDuty.has(personKey(person)));
    const windowsFor = (roundId: string, group: number) => slots?.get(roundId)?.find(slot => slot.group === group)?.windows ?? [];
    const duties = new Map<string, number>();
    const taken = new Set<string>();
    const pending = plans.flatMap(plan => plan.groups.flatMap((members, index) => members.length ? [{ plan, group: index + 1 }] : []));
    /** Planned duty times when they are not reserved, so the plan itself stays consistent. */
    const planBusy = new Map<string, TimeWindow[]>();
    const free = (seat: typeof pending[number], key: string) => {
      if (seat.plan.groups[seat.group - 1].some(person => personKey(person) === key)) return false;
      if (blockedHere(seat.plan.round.id, seat.group, key)) return false;
      if (taken.has(`${seat.plan.round.id}:${seat.group}:${key}`)) return false;
      return !windowsFor(seat.plan.round.id, seat.group).some(window => [...(busyTimes.get(key) ?? []), ...(planBusy.get(key) ?? [])].some(busy => overlaps(busy, window)));
    };
    while (pending.length) {
      let index = 0;
      let available: WcifPerson[] = [];
      pending.forEach((seat, position) => {
        const here = candidates.filter(person => free(seat, personKey(person)));
        if (position === 0 || here.length < available.length) { index = position; available = here; }
      });
      const [seat] = pending.splice(index, 1);
      const own = (key: string) => seat.plan.groups.findIndex(members => members.some(person => personKey(person) === key)) + 1;
      const pick = best(available, person => {
        const key = personKey(person);
        return [teamHere(seat.plan.round.id, seat.group, key) ? 0 : 1, duties.get(key) ?? 0, own(key) === seat.group + 1 ? 1 : 0];
      });
      if (!pick) continue;
      const key = personKey(pick);
      delegatePlan.set(`${seat.plan.round.id}:${seat.group}`, { key, candidates: available.length });
      duties.set(key, (duties.get(key) ?? 0) + 1);
      taken.add(`${seat.plan.round.id}:${seat.group}:${key}`);
      const windows = windowsFor(seat.plan.round.id, seat.group);
      // Later in the order, the plan is a preference and other tasks may take the time first.
      const reserving = delegateFirst ? busyTimes : planBusy;
      if (windows.length) reserving.set(key, [...(reserving.get(key) ?? []), ...windows]);
    }
  }

  // The weighted engine counts hours and streaks, so it staffs rounds in time order; the output
  // keeps the rounds' order.
  const firstStart = (plan: CompetitorPlan) => Math.min(...(slots?.get(plan.round.id) ?? []).flatMap(slot => slot.windows.map(window => toMinutes(window.start))), Number.MAX_SAFE_INTEGER);
  const staffingOrder = weighted ? [...plans].sort((a, b) => firstStart(a) - firstStart(b)) : plans;
  const outputByRound = new Map<string, GeneratedAssignment[]>();
  /** Times already covered by a data entry person, across rounds and rooms. */
  const dataEntryTimes: TimeWindow[] = [];
  for (const { item, task, windows } of fixedTasks) {
    if (task.role === "competitor") continue;
    globalLoad.set(item.personId, (globalLoad.get(item.personId) ?? 0) + 1);
    eventLoad.set(`${item.personId}|${item.eventId}`, (eventLoad.get(`${item.personId}|${item.eventId}`) ?? 0) + 1);
    if (!staff.has(item.personId) && (task.role === "judge" || task.role === "scrambler" || task.role === "runner")) othersTotalLoad += 1;
    const window = windows[0];
    if (window) staffLog.set(item.personId, [...(staffLog.get(item.personId) ?? []), { start: toMinutes(window.start), end: toMinutes(window.end), role: task.role }]);
    if (task.role === "dataentry") dataEntryTimes.push(...windows);
  }

  for (const plan of staffingOrder) {
    const { round, competitors, groups, fixed, seedIndex, featured } = plan;
    const roundOutput: GeneratedAssignment[] = [];
    outputByRound.set(round.id, roundOutput);

    const roundSlots = slots?.get(round.id);
    const windowsOf = (group: number) => roundSlots?.find(slot => slot.group === group)?.windows ?? [];
    /** When a task in the group happens (multi-blind scramblers: their scrambling time). */
    const taskWindows = (group: number, role?: TaskRole) => {
      const slot = roundSlots?.find(item => item.group === group);
      return slot ? role ? windowsForTask(slot, role) : slot.windows : [];
    };
    const markBusy = (key: string, group: number, role?: TaskRole) => busyTimes.set(key, [...(busyTimes.get(key) ?? []), ...taskWindows(group, role)]);
    const busyDuring = (key: string, group: number, role?: TaskRole) => taskWindows(group, role).some(window => busyTimes.get(key)?.some(busy => overlaps(busy, window)));
    const rows = new Map<string, Row>();
    const stationsIn = (group: number) => staffing?.(round.id, group)?.stations ?? stations;
    const attemptOfColumn = new Map(linkedColumns(round.id).map(slot => [slot.group, slot.attempt!]));
    const stationRule = fixed ? stationRules?.(round) : undefined;
    groups.forEach((members, groupIndex) => {
      const rule = stationRule?.get(groupIndex + 1);
      const ruled = rule && assignStations(members.map(person => ({ key: personKey(person), seed: seedIndex.get(personKey(person))!, registrantId: person.registrantId, name: person.name, property: rule.property ? personProperties[personKey(person)]?.[rule.property] : undefined })), stationsIn(groupIndex + 1), rule);
      [...members].sort((a, b) => seedIndex.get(personKey(a))! - seedIndex.get(personKey(b))!).forEach((person, index) => {
        const key = personKey(person);
        const attempt = attemptOfColumn.get(groupIndex + 1);
        const task: Task = { group: groupIndex + 1, role: "competitor", ...(attempt ? { attempt } : {}) };
        const existing = rows.get(key);
        if (existing) { existing.tasks = sortTasks([...existing.tasks, task]); return; }
        const station = ruled ? ruled.get(key) : fixed && index < stationsIn(groupIndex + 1) ? index + 1 : undefined;
        rows.set(key, { person, key, inRound: true, seedIndex: seedIndex.get(key)!, tasks: [task], station, why: [] });
      });
    });
    const rowFor = (person: WcifPerson) => {
      const key = personKey(person);
      if (!rows.has(key)) rows.set(key, { person, key, inRound: false, seedIndex: Number.MAX_SAFE_INTEGER, tasks: [], why: [] });
      return rows.get(key)!;
    };
    const ownGroup = (key: string) => rows.get(key)?.tasks.find(task => task.role === "competitor")?.group;
    // While their room is running, a room team works there (the side room is staffed first, as in
    // the Spanish Championship scripts), not on the other stages.
    const neededInOwnRoom = (key: string, group: number) => !teamHere(round.id, group, key) && windowsOf(group).some(window => reserved.get(key)?.some(item => overlaps(item.window, window)));
    const freeIn = (key: string, group: number, role?: TaskRole) => !rows.get(key)?.tasks.some(task => task.group === group) && !busyDuring(key, group, role) && !blockedHere(round.id, group, key) && !neededInOwnRoom(key, group);
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
      markBusy(row.key, group, role);
      const window = taskWindows(group, role)[0];
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
          const available = candidates.filter(person => freeIn(personKey(person), group, role));
          // A room's own team comes first for its tasks.
          const pick = best(available, person => [teamHere(round.id, group, personKey(person)) ? 0 : 1, ...sortKey(person, group)]);
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
      const person = accepted.find(candidate => personKey(candidate) === key);
      if (person && hasWcaJob(person, role)) reasons.push("wcaJob");
      if (avoid.has(key)) reasons.push("avoided");
      if (trusted.has(key) && role === "scrambler") reasons.push("trusted");
      if ((role === "judge" || role === "scrambler" || role === "runner") && allowed(role)) reasons.push("segment");
      else if (role === "scrambler" && strictScramblers && !trusted.has(key)) reasons.push("fastHalf");
      if (role === "scrambler" && reserveKeys.has(key)) reasons.push("reserve");
      if (teamHere(round.id, group, key)) reasons.push("laneTeam");
      if (!inRoundKeys.has(key)) reasons.push("notInRound");
      if (beforeOwn(key, group)) reasons.push("beforeOwn");
      return reasons;
    };
    const strictScramblers = options.sortingRule === "scrambler-safe";
    const inRoundKeys = new Set(competitors.map(personKey));
    // Strict: trusted people, or people with a result in the faster half of the round
    // (never fewer than the slots to fill), so scrambling is spread among good people.
    // Blindfolded and one-handed rounds rank by the event scrambled (4x4 for 4BLD).
    const scrambleEvent = SCRAMBLE_EVENT[round.eventId] ?? round.eventId;
    const scrambleRank = scrambleEvent === round.eventId ? seedIndex : new Map(competitors
      .filter(person => seedResult(person, scrambleEvent) !== undefined)
      .sort((a, b) => seedResult(a, scrambleEvent)! - seedResult(b, scrambleEvent)!)
      .map((person, index) => [personKey(person), index]));
    const canScrambleHere = (person: WcifPerson) => seedResult(person, scrambleEvent) !== undefined;
    const fastEnough = Math.max(Math.ceil(competitors.length / 2), round.scramblers * groups.length);
    const scramblerPool = accepted.filter(person => {
      const key = personKey(person);
      if (!normalTasksAllowed(key)) return false;
      // A scrambler segment (PRO) replaces the built-in speed rule.
      if (allowed("scrambler")) return allowed("scrambler")!.has(key);
      if (!inRoundKeys.has(key) && !staff.has(key) && !trusted.has(key) && !hasWcaJob(person, "scrambler")) return false;
      return !strictScramblers || trusted.has(key) || (canScrambleHere(person) && (scrambleRank.get(key) ?? Number.MAX_SAFE_INTEGER) < fastEnough);
    });
    // Reserve: people outside the pool with a result in the event scrambled for this one (4BLD
    // scrambles are 4x4…), for groups the pool cannot cover (single-group side-room rounds).
    const poolKeys = new Set(scramblerPool.map(personKey));
    const reserve = allowed("scrambler") ? [] : accepted.filter(person => {
      const key = personKey(person);
      return !poolKeys.has(key) && normalTasksAllowed(key) && Number.isFinite(bestAverageAndSingle(person, scrambleEvent)[0]);
    });
    const reserveKeys = new Set(reserve.map(personKey));
    const scramblersNeeded = (group: number) => staffing?.(round.id, group)?.scramblers ?? round.scramblers;
    const runnersNeeded = (group: number) => staffing?.(round.id, group)?.runners ?? round.runners;
    const scramblerStep = () => {
    fill("scrambler", scramblersNeeded, scramblerPool, (person, group) => {
      const key = personKey(person);
      // Strict: everyone in the pool scrambles once before anyone repeats; then lighter loads, then speed.
      // People with the WCA role staff-scrambler are tried first, as in Groupifier.
      const wcaJob = hasWcaJob(person, "scrambler") && load(key) < STAFF_LOAD_FACTOR * (othersTotalLoad / othersCount) + 2 ? 0 : 1;
      if (strictScramblers) return [wcaJob, roundLoad(key), loadInEvent(key) >= 3 ? 1 : 0, Math.floor(load(key) / 4), trusted.has(key) ? 0 : 1, beforeOwn(key, group), ...bestAverageAndSingle(person, round.eventId)];
      // Groupifier's criteria. Staff are generic here (not scrambling specialists), so they only
      // win among equally suitable people, like trusted people do.
      return [
        wcaJob,
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

    if (reserve.length) {
      const scramblingIn = (group: number) => [...rows.values()].filter(row => row.tasks.some(task => task.group === group && task.role === "scrambler")).length;
      fill("scrambler", group => Math.max(0, scramblersNeeded(group) - scramblingIn(group)), reserve, (person, group) => {
        const key = personKey(person);
        return [roundLoad(key), Math.floor(load(key) / 4), load(key), beforeOwn(key, group), ...bestAverageAndSingle(person, scrambleEvent)];
      });
    }
    };

    const delegateStep = () => {
      for (let group = 1; group <= groups.length; group += 1) {
        const planned = delegatePlan.get(`${round.id}:${group}`);
        // Unless delegate duty goes first, a task given earlier may have taken the planned delegate.
        let person = planned && (delegateFirst || freeIn(planned.key, group)) ? accepted.find(candidate => personKey(candidate) === planned.key) : undefined;
        let candidates = planned?.candidates ?? 0;
        if (!person && !delegateFirst) {
          const free = accepted.filter(candidate => delegateDuty.has(personKey(candidate)) && freeIn(personKey(candidate), group));
          person = best(free, candidate => [teamHere(round.id, group, personKey(candidate)) ? 0 : 1, roundLoad(personKey(candidate)), beforeOwn(personKey(candidate), group), load(personKey(candidate))]);
          candidates = free.length;
        }
        if (!person) continue;
        const key = personKey(person);
        const why: Why = { group, role: "delegate", candidates, load: load(key), reasons: reasonsFor("delegate", key, group) };
        assign(person, group, "delegate");
        rowFor(person).why.push(why);
      }
    };

    // Data entry types the results of every stage at once: one person per time slot is enough,
    // given to the first group found at that time (in any round or room).
    const dataEntryStep = () => {
      const typists = accepted.filter(person => dataEntry.has(personKey(person)));
      const byTime = groups.map((_, index) => index + 1).sort((a, b) => (windowsOf(a)[0]?.start ?? "").localeCompare(windowsOf(b)[0]?.start ?? "") || a - b);
      for (const group of byTime) {
        if (!groups[group - 1].length) continue;
        const windows = windowsOf(group);
        if (windows.length && windows.some(window => dataEntryTimes.some(covered => overlaps(covered, window)))) continue;
        const available = typists.filter(person => freeIn(personKey(person), group));
        const pick = best(available, person => [roundLoad(personKey(person)), load(personKey(person))]);
        if (!pick) continue;
        const why: Why = { group, role: "dataentry", candidates: available.length, load: load(personKey(pick)), reasons: reasonsFor("dataentry", personKey(pick), group) };
        assign(pick, group, "dataentry");
        rowFor(pick).why.push(why);
        dataEntryTimes.push(...windows);
      }
    };

    const normalPool = accepted.filter(person => normalTasksAllowed(personKey(person)));
    const poolFor = (role: "runner" | "judge") => allowed(role) ? normalPool.filter(person => allowed(role)!.has(personKey(person))) : normalPool;

    const weightedStep = () => {
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
          wcaJob: hasWcaJob(person, job),
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
        // Staff and volunteers work in any event (CanVolunteer in the Spanish Championship scripts).
        if (options.noTasksForNewcomers && isNewcomer(person) && !staff.has(key)) value -= 5000;
        if (options.tasksForOwnEventsOnly && !registeredForEvent(person) && !staff.has(key)) value -= 5000;
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
          const pool = (job === "scrambler" ? [...scramblerPool, ...reserve] : poolFor(job as "runner" | "judge")).filter(person => freeIn(personKey(person), group, job));
          counts[job] = pool.length;
          const scored = pool.map(person => {
            const breakdown = scoreBreakdown(factsFor(person, group, job), job, scoring!.weights);
            const key = personKey(person);
            // Reserve scramblers only when the usual pool runs short; a room's own team first.
            const score = Object.values(breakdown).reduce((sum, value) => sum + (value ?? 0), 0) + penalty(person, job) + (job === "scrambler" && reserveKeys.has(key) ? -300 : 0) + (teamHere(round.id, group, key) ? 200 : 0);
            return { key, job, score, person, breakdown };
          }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
          // The best few per seat keep the program small without changing its answer in practice.
          candidates.push(...scored.slice(0, Math.max(need * 6, 40)));
        }
        for (const [key, job] of solveGroupStaff(needs, candidates, seatPriority)) {
          const chosen = candidates.find(candidate => candidate.key === key && candidate.job === job)!;
          const why: Why = { group, role: job, candidates: counts[job] ?? 0, load: load(key), reasons: reasonsFor(job, key, group), score: Math.round(chosen.score * 10) / 10, breakdown: chosen.breakdown };
          assign(chosen.person, group, job);
          rowFor(chosen.person).why.push(why);
        }
      }
    };

    const staffPreferred = (key: string) => staff.has(key) && load(key) < STAFF_LOAD_FACTOR * (othersTotalLoad / othersCount) + 2;
    const othersKey = (role: "runner" | "judge") => (person: WcifPerson, group: number) => {
      const key = personKey(person);
      // staff-judge / staff-runner (WCA roles) come first for their job, then the rest of the staff.
      const wcaJob = hasWcaJob(person, role) && load(key) < STAFF_LOAD_FACTOR * (othersTotalLoad / othersCount) + 2;
      if (wcaJob || staffPreferred(key)) return [0, wcaJob ? 0 : 1, load(key), beforeOwn(key, group)];
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
    const runnerStep = () => fill("runner", runnersNeeded, poolFor("runner"), othersKey("runner"));
    const judgeStep = () => fill("judge", (group, size) => judgesNeeded(size, stationsIn(group)), poolFor("judge"), othersKey("judge"));

    // Tasks in the chosen order. With scoring, scramblers, runners and judges of a group are solved
    // together where the first of them comes, and the order decides which seats are filled first.
    const seatPriority = Object.fromEntries(taskOrder.map((item, index) => [item, (taskOrder.length - index) * 1000])) as Partial<Record<TaskRole, number>>;
    let weightedDone = false;
    for (const item of taskOrder) {
      if (weighted && (item === "scrambler" || item === "runner" || item === "judge")) {
        if (!weightedDone) weightedStep();
        weightedDone = true;
      } else if (item === "scrambler") scramblerStep();
      else if (item === "delegate") { if (options.assignDelegateDuties) delegateStep(); }
      else if (item === "dataentry") { if (options.assignDataEntry) dataEntryStep(); }
      else if (options.assignJudges) (item === "runner" ? runnerStep : judgeStep)();
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
        ...(scrambleEvent !== round.eventId && row.tasks.some(task => task.role === "scrambler") ? { scrambleResult: seedResult(row.person, scrambleEvent) } : {}),
        inRound: row.inRound,
        ...(row.inRound && featured?.has(row.key) ? { featured: true } : {}),
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

/** How one assignment set went in a round: people it wanted, seats it had and people it placed. */
export type SetStats = { id: string; name: string; wanted: number; seats: number; placed: number };

/**
 * CompScript's AssignGroups with ordered assignment sets. Each set, in order, takes its people
 * not placed yet (best first) and deals them over its groups one per group and pass, emptiest
 * first. A group never takes more than the even size of the round (people / groups): unlike
 * CompScript, which raises that limit when a set's groups are full, the people who do not fit
 * are left to the next sets and to the sorting rule, and the stats say how many. Whoever is left
 * fills the remaining seats so that groups stay even, following the sorting rule.
 */
export function splitWithSets(bestFirst: WcifPerson[], groupCount: number, sets: ResolvedSet[], rule: SortingRule, eventId: string, targets?: number[]) {
  const groups: WcifPerson[][] = Array.from({ length: groupCount }, () => []);
  const allowed = new Map<string, Set<number>>();
  const featured = new Set<string>();
  const setOf = new Map<string, string>();
  const stats: SetStats[] = [];
  const even = Math.ceil(bestFirst.length / Math.max(1, groupCount));
  /** Seats of each group: its target size when stages have a maximum, else the even size. */
  const seatsOf = (group: number) => targets?.[group - 1] ?? even;
  for (const set of sets) {
    const eligible = set.groups.filter(group => group >= 1 && group <= groupCount);
    // A set with no group in this round (its stage is not used) does not apply here.
    if (!eligible.length) continue;
    const queue = bestFirst.filter((person, index) => !allowed.has(personKey(person)) && (set.top === undefined || index < set.top) && (!set.members || set.members.has(personKey(person))));
    const seats = eligible.reduce((sum, group) => sum + Math.max(0, seatsOf(group) - groups[group - 1].length), 0);
    let placed = 0;
    for (let pass = 0; queue.length; pass += 1) {
      const open = eligible.filter(group => groups[group - 1].length < seatsOf(group));
      if (!open.length) break;
      // Alternating the tie order snakes the best people over the groups.
      open.sort((a, b) => groups[a - 1].length - groups[b - 1].length || (pass % 2 ? b - a : a - b));
      for (const group of open) {
        const person = queue.shift();
        if (!person) break;
        groups[group - 1].push(person);
        allowed.set(personKey(person), new Set(eligible));
        setOf.set(personKey(person), set.id);
        if (set.featured) featured.add(personKey(person));
        placed += 1;
      }
    }
    stats.push({ id: set.id, name: set.name, wanted: placed + queue.length, seats, placed });
  }
  if (!allowed.size) return { groups: targets ? fillByRule(bestFirst, targets, rule, eventId) : splitIntoGroups(bestFirst, groupCount, rule, eventId), allowed: undefined, featured: undefined, setOf: undefined, stats };
  const rest = bestFirst.filter(person => !allowed.has(personKey(person)));
  const sizes = groups.map(members => members.length);
  // Groups below their target first (fewest people first); past every target, the smallest.
  for (let left = rest.length; left > 0; left -= 1) {
    const below = sizes.map((size, index) => ({ size, index })).filter(item => !targets || item.size < targets[item.index]);
    const pool = below.length ? below : sizes.map((size, index) => ({ size, index }));
    const pick = pool.reduce((best, item) => item.size < best.size ? item : best);
    sizes[pick.index] += 1;
  }
  fillByRule(rest, sizes.map((size, index) => size - groups[index].length), rule, eventId).forEach((members, index) => groups[index].push(...members));
  return { groups, allowed, featured, setOf, stats };
}

/**
 * Group sizes when some groups have a maximum (`caps`): people go to the emptiest group still below
 * its maximum, the first ones first, so uncapped groups share what capped ones cannot take. When
 * every group is full, the rest go where they overflow the maximum least, in proportion (a stage of
 * 27 takes more than one of 21), and the review warns that the round does not fit.
 */
export function groupTargets(count: number, caps: Array<number | undefined>) {
  const sizes = caps.map(() => 0);
  for (let left = count; left > 0; left -= 1) {
    const open = sizes.map((size, index) => ({ size, index })).filter(item => caps[item.index] === undefined || item.size < caps[item.index]!);
    const ratio = (item: { size: number; index: number }) => open.length ? item.size : (item.size + 1) / caps[item.index]!;
    const pool = open.length ? open : sizes.map((size, index) => ({ size, index }));
    const pick = pool.reduce((best, item) => ratio(item) < ratio(best) ? item : best);
    sizes[pick.index] += 1;
  }
  return sizes;
}

/** Splits people (best first) into groups of the given sizes, as `splitIntoGroups` would. */
export function fillByRule(bestFirst: WcifPerson[], capacities: number[], rule: SortingRule, eventId: string) {
  const groups: WcifPerson[][] = capacities.map(() => []);
  const symmetric = rule === "symmetric" || rule === "scrambler-safe" || (rule === "balanced" && !BALANCED_BY_RANKS.includes(eventId));
  if (symmetric) {
    // One per group from the last group down, as the symmetric split does.
    let group = capacities.length - 1;
    for (const person of bestFirst) {
      while (groups[group].length >= capacities[group]) group = (group - 1 + capacities.length) % capacities.length;
      groups[group].push(person);
      group = (group - 1 + capacities.length) % capacities.length;
    }
    return groups;
  }
  const worstFirst = [...bestFirst].reverse();
  const ordered = rule === "name-optimised" ? separateSameFirstNames(worstFirst) : worstFirst;
  let start = 0;
  capacities.forEach((capacity, index) => {
    groups[index] = ordered.slice(start, start + capacity);
    start += capacity;
  });
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
export function spreadRole(groups: WcifPerson[][], hasRole: (person: WcifPerson) => boolean, canMove: (person: WcifPerson, group: number) => boolean = () => true, canSwap: (a: WcifPerson, b: WcifPerson) => boolean = () => true) {
  for (let guard = 0; guard < groups.length * 4; guard += 1) {
    const counts = groups.map(members => members.filter(hasRole).length);
    const crowded = counts.findIndex(count => count >= 2);
    const empty = counts.findIndex(count => count === 0);
    if (crowded < 0 || empty < 0) return;
    // The first person with the role who can move and has someone to swap with (same set).
    let swap: { position: number; swapIndex: number } | undefined;
    for (const [position, mover] of groups[crowded].entries()) {
      if (!hasRole(mover) || !canMove(mover, empty + 1)) continue;
      const swapIndex = groups[empty].reduce((closest, person, index) => !hasRole(person) && canMove(person, crowded + 1) && canSwap(mover, person) && (closest < 0 || Math.abs(index - position) < Math.abs(closest - position)) ? index : closest, -1);
      if (swapIndex >= 0) { swap = { position, swapIndex }; break; }
    }
    if (!swap) return;
    const mover = groups[crowded][swap.position];
    groups[crowded][swap.position] = groups[empty][swap.swapIndex];
    groups[empty][swap.swapIndex] = mover;
  }
}
