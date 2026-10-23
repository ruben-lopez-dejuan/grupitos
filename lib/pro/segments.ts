/*
 * Segments: named filters of people, the visual version of CompScript's Define(...) with
 * And/Or/Not and predicates such as HasRole, property values, age, registration and personal
 * bests (CanScramble). A segment is a list of rules matched all together or any of them; a rule
 * can be negated and can reuse another segment, which covers nesting.
 */
import type { WcifPerson } from "@/lib/competition-store";
import { ageOf, rolesOf, type PeopleSettings, type PersonRole } from "@/lib/people";
import type { ProPeople } from "@/lib/pro/people";
import { bestAverageAndSingle, personalBestValue, personKey } from "@/lib/rounds";

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
   * Events without a limit take nobody.
   */
  | { kind: "roundPb"; limits: Record<string, number>; mapping: Record<string, string> };

export const CONDITION_KINDS: Condition["kind"][] = ["role", "property", "age", "registered", "roundRegistered", "pb", "roundPb", "newcomer", "country", "segment"];
/** Conditions that depend on the round's event; without a round they hold if they hold for any event. */
export const ROUND_KINDS: Condition["kind"][] = ["roundRegistered", "roundPb"];

export type SegmentRule = Condition & { negate?: boolean };
export type Segment = { id: string; name: string; match: "all" | "any"; rules: SegmentRule[] };

export type SegmentContext = { people: PeopleSettings; pro: ProPeople; segments: Segment[]; today?: Date; /** The round's event, for round conditions. */ eventId?: string };

function underLimit(person: WcifPerson, eventId: string, condition: Extract<Condition, { kind: "roundPb" }>) {
  const source = condition.mapping[eventId] || eventId;
  const limit = condition.limits[source];
  if (!limit) return false;
  const best = bestAverageAndSingle(person, source)[0];
  return Number.isFinite(best) && best > 0 && best < limit;
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
  return people.filter(person => matchesSegment(segment, person, context));
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
  }
}

/** The Amore Open 2026 limits (ScrambleLimits, EventsToScramblingEvents), in centiseconds. */
export const SCRAMBLE_LIMITS: { limits: Record<string, number>; mapping: Record<string, string> } = {
  limits: { "333": 1000, "222": 500, "444": 5000, pyram: 600, skewb: 600, sq1: 2000 },
  mapping: { "333bf": "333", "333oh": "333" },
};

/** Starting points from real CompScript scripts (EligibleVolunteer, EligibleRunner, CanScramble, EligibleScrambler). */
export const SEGMENT_TEMPLATES: Array<{ id: "volunteers" | "runners" | "scramblers" | "eventScramblers"; segment: Omit<Segment, "id" | "name"> }> = [
  { id: "volunteers", segment: { match: "all", rules: [{ kind: "role", role: "organizer", negate: true }, { kind: "role", role: "delegate", negate: true }, { kind: "role", role: "trainee-delegate", negate: true }, { kind: "newcomer", negate: true }] } },
  { id: "runners", segment: { match: "all", rules: [{ kind: "age", op: "lt", value: 45 }] } },
  { id: "scramblers", segment: { match: "any", rules: [{ kind: "pb", eventId: "333", type: "average", value: 2000 }, { kind: "role", role: "trusted" }] } },
  { id: "eventScramblers", segment: { match: "all", rules: [{ kind: "roundRegistered" }, { kind: "roundPb", ...SCRAMBLE_LIMITS }] } },
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
