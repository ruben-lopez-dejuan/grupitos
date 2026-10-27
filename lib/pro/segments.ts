/*
 * Segments: named filters of people, the visual version of CompScript's Define(...) with
 * And/Or/Not and predicates such as HasRole, property values, age, registration and personal
 * bests (CanScramble). A segment is a list of rules matched all together or any of them; a rule
 * can be negated and can reuse another segment, which covers nesting.
 */
import type { WcifPerson } from "@/lib/competition-store";
import { ageOf, rolesOf, type PeopleSettings, type PersonRole } from "@/lib/people";
import type { ProPeople } from "@/lib/pro/people";
import { bestAverageAndSingle, personalBestValue, personKey, SCRAMBLE_EVENT } from "@/lib/rounds";
import { EVENT_NAMES_EN, SHORT_EVENT_NAMES } from "@/lib/scorecards/scorecards";

export const SEGMENT_ROLES = ["delegate", "trainee-delegate", "organizer", "staff", "dataentry", "trusted", "volunteer"] as const;
export type SegmentRole = typeof SEGMENT_ROLES[number];
export const PROPERTY_OPS = ["eq", "neq", "lt", "gt", "contains", "set", "unset"] as const;
export type PropertyOp = typeof PROPERTY_OPS[number];

export type Condition =
  | { kind: "role"; role: SegmentRole }
  | { kind: "property"; key: string; op: PropertyOp; value?: string }
  | { kind: "age"; op: "lt" | "gte"; value: number }
  | { kind: "registered"; eventId: string }
  /** Personal best below `value` centiseconds (multi-blind and FMC compare their WCA-encoded value). */
  | { kind: "pb"; eventId: string; type: "single" | "average"; value: number }
  | { kind: "newcomer" }
  | { kind: "country"; iso2: string }
  | { kind: "segment"; id: string }
  /** Registered for the event of the round being staffed (CompScript's CompetingIn(event)). */
  | { kind: "roundRegistered" }
  /**
   * CompScript's CanScramble: the personal best (average; single for blind events) in the round's
   * event, or in the event it maps to (3BLD and OH use 3x3), is below that event's limit.
   * Events without a limit take anyone with a result in them.
   */
  | { kind: "roundPb"; limits: Record<string, number>; mapping: Record<string, string> }
  /**
   * In the fastest `percent` % of the psych sheet of the round's event, among those registered for
   * it (CompScript's IsInTop25Psych in the Écija and Granada scripts); 3BLD and OH may use 3x3.
   */
  | { kind: "roundTop"; percent: number; mapping: Record<string, string> }
  /** A property naming the round's event (Granada's `chill`, CubingUSA's `puzzles-to-scramble`). */
  | { kind: "roundProperty"; key: string }
  /** These people (the Écija and Granada scripts' sets by WCA ID). */
  | { kind: "people"; keys: string[] };

export const CONDITION_KINDS: Condition["kind"][] = ["role", "property", "age", "registered", "roundRegistered", "pb", "roundPb", "roundTop", "roundProperty", "newcomer", "country", "people", "segment"];
/** Conditions that depend on the round's event; without a round they hold if they hold for any event. */
export const ROUND_KINDS: Condition["kind"][] = ["roundRegistered", "roundPb", "roundTop", "roundProperty"];

export type SegmentRule = Condition & { negate?: boolean };
export type Segment = { id: string; name: string; match: "all" | "any"; rules: SegmentRule[] };

export type SegmentContext = {
  people: PeopleSettings; pro: ProPeople; segments: Segment[]; today?: Date;
  /** The round's event, for round conditions. */
  eventId?: string;
  /** Everyone being filtered: "top X %" ranks within the people registered for the event. */
  population?: WcifPerson[];
};

/** Positions in each event's psych sheet (registered people, best first), per population. */
const PSYCH_SHEETS = new WeakMap<WcifPerson[], Map<string, { position: Map<string, number>; size: number }>>();

function psychSheet(population: WcifPerson[], eventId: string) {
  const byEvent = PSYCH_SHEETS.get(population) ?? new Map<string, { position: Map<string, number>; size: number }>();
  PSYCH_SHEETS.set(population, byEvent);
  let sheet = byEvent.get(eventId);
  if (!sheet) {
    const registered = population.filter(person => person.registration?.eventIds?.includes(eventId))
      .sort((a, b) => { const [a1, a2] = bestAverageAndSingle(a, eventId); const [b1, b2] = bestAverageAndSingle(b, eventId); return (a1 - b1) || (a2 - b2); });
    sheet = { position: new Map(registered.map((person, index) => [personKey(person), index])), size: registered.length };
    byEvent.set(eventId, sheet);
  }
  return sheet;
}

function inTop(person: WcifPerson, eventId: string, condition: Extract<Condition, { kind: "roundTop" }>, population: WcifPerson[]) {
  const source = condition.mapping[eventId] || eventId;
  const sheet = psychSheet(population, source);
  const position = sheet.position.get(personKey(person));
  return position !== undefined && Number.isFinite(bestAverageAndSingle(person, source)[0]) && position < (condition.percent / 100) * sheet.size;
}

/** Whether a property names an event: by its id (333bf) or its English or short name (3x3x3 Blindfolded, 3BLD). */
function namesEvent(text: string | undefined, eventId: string) {
  if (!text) return false;
  const value = text.toLowerCase();
  const tokens = value.split(/[,;|/]+/).map(token => token.trim()).filter(Boolean);
  const names = [eventId, EVENT_NAMES_EN[eventId], SHORT_EVENT_NAMES[eventId]].filter(Boolean).map(name => name!.toLowerCase());
  return names.some(name => tokens.includes(name)) || (value.trim() === eventId);
}

function underLimit(person: WcifPerson, eventId: string, condition: Extract<Condition, { kind: "roundPb" }>) {
  const source = condition.mapping[eventId] || eventId;
  const limit = condition.limits[source];
  const best = bestAverageAndSingle(person, source)[0];
  // Without a limit, any result in the event will do.
  return Number.isFinite(best) && best > 0 && (!limit || best < limit);
}

const numeric = (text: string | undefined) => text !== undefined && text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : undefined;

function compare(actual: string | undefined, op: PropertyOp, expected = "") {
  if (op === "set") return actual !== undefined && actual !== "";
  if (op === "unset") return actual === undefined || actual === "";
  if (actual === undefined) return op === "neq";
  const [a, b] = [numeric(actual), numeric(expected)];
  const both = a !== undefined && b !== undefined;
  switch (op) {
    case "eq": return both ? a === b : actual.trim().toLowerCase() === expected.trim().toLowerCase();
    case "neq": return both ? a !== b : actual.trim().toLowerCase() !== expected.trim().toLowerCase();
    case "lt": return both ? a < b : actual.localeCompare(expected) < 0;
    case "gt": return both ? a > b : actual.localeCompare(expected) > 0;
    case "contains": return actual.toLowerCase().includes(expected.trim().toLowerCase());
  }
}

function hasRole(person: WcifPerson, role: SegmentRole, context: SegmentContext) {
  const key = personKey(person);
  if (role === "volunteer") return context.pro.volunteers.some(volunteer => volunteer.key === key);
  if (role === "trusted") return context.people.trustedIds.includes(key);
  return rolesOf(context.people, key).includes(role as PersonRole);
}

function test(condition: Condition, person: WcifPerson, context: SegmentContext, visiting: Set<string>): boolean {
  switch (condition.kind) {
    case "role": return hasRole(person, condition.role, context);
    case "property": return compare(context.pro.properties[personKey(person)]?.[condition.key], condition.op, condition.value);
    case "age": {
      const age = ageOf(person, context.today);
      return age !== undefined && (condition.op === "lt" ? age < condition.value : age >= condition.value);
    }
    case "registered": return !!person.registration?.eventIds?.includes(condition.eventId);
    case "pb": {
      const best = personalBestValue(person, condition.eventId, condition.type);
      return Number.isFinite(best) && best > 0 && best < condition.value;
    }
    case "newcomer": return !person.wcaId;
    case "country": return person.countryIso2 === condition.iso2;
    case "roundRegistered": return context.eventId ? !!person.registration?.eventIds?.includes(context.eventId) : !!person.registration?.eventIds?.length;
    case "roundPb": {
      if (context.eventId) return underLimit(person, context.eventId, condition);
      return Object.keys({ ...condition.limits, ...condition.mapping }).some(eventId => underLimit(person, eventId, condition));
    }
    case "roundTop": {
      const population = context.population ?? [person];
      if (context.eventId) return inTop(person, context.eventId, condition, population);
      return (person.registration?.eventIds ?? []).some(eventId => inTop(person, eventId, condition, population));
    }
    case "roundProperty": {
      const value = context.pro.properties[personKey(person)]?.[condition.key];
      return context.eventId ? namesEvent(value, context.eventId) : !!value?.trim();
    }
    case "people": return condition.keys.includes(personKey(person));
    case "segment": {
      const other = context.segments.find(segment => segment.id === condition.id);
      // A segment that refers back to itself matches nobody through that rule.
      if (!other || visiting.has(other.id)) return false;
      return matchesSegment(other, person, context, visiting);
    }
  }
}

export function matchesSegment(segment: Segment, person: WcifPerson, context: SegmentContext, visiting = new Set<string>()): boolean {
  if (!segment.rules.length) return true;
  const inner = new Set(visiting).add(segment.id);
  const results = segment.rules.map(rule => test(rule, person, context, inner) !== !!rule.negate);
  return segment.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function segmentMembers(segment: Segment, people: WcifPerson[], context: SegmentContext) {
  const withPopulation = context.population ? context : { ...context, population: people };
  return people.filter(person => matchesSegment(segment, person, withPopulation));
}

export function newSegmentId(segments: Segment[]) {
  let index = segments.length + 1;
  while (segments.some(segment => segment.id === `s${index}`)) index += 1;
  return `s${index}`;
}

/** A fresh rule of a kind, with sensible defaults. */
export function defaultRule(kind: Condition["kind"], options: { propertyKeys: string[]; eventIds: string[]; countries: string[]; segmentIds: string[] }): SegmentRule {
  switch (kind) {
    case "role": return { kind, role: "organizer" };
    case "property": return { kind, key: options.propertyKeys[0] ?? "", op: "eq", value: "" };
    case "age": return { kind, op: "lt", value: 45 };
    case "registered": return { kind, eventId: options.eventIds[0] ?? "333" };
    case "pb": return { kind, eventId: options.eventIds[0] ?? "333", type: "average", value: 2000 };
    case "newcomer": return { kind };
    case "country": return { kind, iso2: options.countries[0] ?? "ES" };
    case "segment": return { kind, id: options.segmentIds[0] ?? "" };
    case "roundRegistered": return { kind };
    case "roundPb": return { kind, ...SCRAMBLE_LIMITS };
    case "roundTop": return { kind, percent: 25, mapping: { ...SCRAMBLE_EVENT } };
    case "roundProperty": return { kind, key: options.propertyKeys.find(key => key === "chill" || key === "puzzles-to-scramble") ?? options.propertyKeys[0] ?? "" };
    case "people": return { kind, keys: [] };
  }
}

/** The Amore Open 2026 limits (ScrambleLimits, EventsToScramblingEvents), in centiseconds. */
export const SCRAMBLE_LIMITS: { limits: Record<string, number>; mapping: Record<string, string> } = {
  limits: { "333": 1000, "222": 500, "444": 5000, pyram: 600, skewb: 600, sq1: 2000 },
  mapping: { ...SCRAMBLE_EVENT },
};

/** Starting points from real CompScript scripts: Álvaro López's Spanish scripts and CubingUSA's. */
/** Not organizer, delegate or trainee: the people who can be asked to help (CanStaff). */
const STAFFABLE: SegmentRule[] = [{ kind: "role", role: "organizer", negate: true }, { kind: "role", role: "delegate", negate: true }, { kind: "role", role: "trainee-delegate", negate: true }];

export const SEGMENT_TEMPLATE_IDS = ["volunteers", "runners", "scramblers", "eventScramblers", "topQuarterScramblers", "offersToScramble", "staffThisEvent", "canJudge", "canRun", "canDelegate", "delegating", "organizers", "delegates", "newcomers", "adults", "sideRoom", "staffAndVolunteers", "somePeople"] as const;

export const SEGMENT_TEMPLATES: Array<{ id: typeof SEGMENT_TEMPLATE_IDS[number]; segment: Omit<Segment, "id" | "name"> }> = [
  // EligibleVolunteer (Álvaro's scripts): can be asked to help, and not a newcomer.
  { id: "volunteers", segment: { match: "all", rules: [...STAFFABLE, { kind: "newcomer", negate: true }] } },
  // EligibleRunner: an eligible volunteer under 45.
  { id: "runners", segment: { match: "all", rules: [...STAFFABLE, { kind: "newcomer", negate: true }, { kind: "age", op: "lt", value: 45 }] } },
  { id: "scramblers", segment: { match: "any", rules: [{ kind: "pb", eventId: "333", type: "average", value: 2000 }, { kind: "role", role: "trusted" }] } },
  // CanScramble with time limits per event (Amore Open 2026, Spanish Championship 2026).
  { id: "eventScramblers", segment: { match: "all", rules: [{ kind: "roundPb", ...SCRAMBLE_LIMITS }] } },
  // CanScrambleEvent (Écija and Granada Open): the fastest quarter of the event; 3BLD and OH by 3x3.
  { id: "topQuarterScramblers", segment: { match: "all", rules: [...STAFFABLE, { kind: "roundTop", percent: 25, mapping: { ...SCRAMBLE_EVENT } }] } },
  // CubingUSA's CanScramble: under the limit and offering to scramble that puzzle in the form.
  { id: "offersToScramble", segment: { match: "all", rules: [{ kind: "roundProperty", key: "puzzles-to-scramble" }, { kind: "roundPb", ...SCRAMBLE_LIMITS }] } },
  // CanStaffEvent (Granada Open): can help, except in the event they asked to rest in (`chill`).
  { id: "staffThisEvent", segment: { match: "all", rules: [...STAFFABLE, { kind: "roundProperty", key: "chill", negate: true }] } },
  // CanJudge / CanRun / CanDelegate (Spanish Championship 2026): weights of −1 say "never", the delegate team does not judge.
  { id: "canJudge", segment: { match: "all", rules: [{ kind: "property", key: "weight-judge", op: "neq", value: "-1" }, { kind: "property", key: "team", op: "neq", value: "Delegado" }] } },
  { id: "canRun", segment: { match: "all", rules: [{ kind: "property", key: "weight-runner", op: "neq", value: "-1" }, { kind: "property", key: "team", op: "neq", value: "Delegado" }] } },
  { id: "canDelegate", segment: { match: "all", rules: [{ kind: "property", key: "delegate-cluster", op: "gt", value: "0" }] } },
  { id: "delegating", segment: { match: "all", rules: [{ kind: "role", role: "delegate" }, { kind: "role", role: "organizer", negate: true }] } },
  { id: "organizers", segment: { match: "all", rules: [{ kind: "role", role: "organizer" }] } },
  { id: "delegates", segment: { match: "any", rules: [{ kind: "role", role: "delegate" }, { kind: "role", role: "trainee-delegate" }] } },
  { id: "newcomers", segment: { match: "all", rules: [{ kind: "newcomer" }] } },
  { id: "adults", segment: { match: "all", rules: [{ kind: "age", op: "gte", value: 18 }] } },
  { id: "sideRoom", segment: { match: "all", rules: [{ kind: "property", key: "team", op: "contains", value: "side" }] } },
  { id: "staffAndVolunteers", segment: { match: "any", rules: [{ kind: "role", role: "staff" }, { kind: "role", role: "volunteer" }] } },
  // UkuSet / DeLaTorreSet (Écija and Granada Open): people chosen one by one, to keep together.
  { id: "somePeople", segment: { match: "all", rules: [{ kind: "people", keys: [] }] } },
];

/** Jobs whose eligibility a segment can restrict (CompScript's Job(..., eligibility=...)). */
export const JOB_ROLES = ["judge", "scrambler", "runner"] as const;
export type JobRole = typeof JOB_ROLES[number];
export type JobEligibility = Partial<Record<JobRole, string>>;

export function normalizeJobs(value: unknown): JobEligibility {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(JOB_ROLES.flatMap(role => typeof (value as Record<string, unknown>)[role] === "string" ? [[role, (value as Record<string, string>)[role]]] : []));
}

export function normalizeSegments(value: unknown): Segment[] {
  return Array.isArray(value) ? value.filter((item): item is Segment => Boolean(item) && typeof item === "object" && typeof (item as Segment).id === "string" && Array.isArray((item as Segment).rules)) : [];
}
