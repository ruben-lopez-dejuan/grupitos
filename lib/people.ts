import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import type { Unavailability } from "@/lib/pro/people";
import { acceptedPeople, personKey } from "@/lib/rounds";

/**
 * `notasks`: people who get no judging, scrambling or running (registration desk, streaming, medical…).
 * `avoid`: people who get them only when nobody else can (Groupifier's `staff-other`).
 */
export const PERSON_ROLES = ["delegate", "trainee-delegate", "organizer", "staff", "dataentry", "avoid", "notasks"] as const;
export type PersonRole = typeof PERSON_ROLES[number];

export type PeopleSettings = {
  roles: Partial<Record<PersonRole, string[]>>;
  /** Preferred scramblers. */
  trustedIds: string[];
  /** Delegates and trainees who receive delegate duties when that option is on. */
  delegateDutyIds: string[];
  /** 2 once `staff-*` roles follow Groupifier's meaning (see `migrateWcaStaffRoles`). */
  wcaStaffRoles?: 2;
  /** When people cannot take tasks (a delegate leaving early…), in both modes. Personal: never published. */
  unavailable?: Unavailability[];
};

/** WCA roles for a staff job, as Groupifier's roles manager sets them. */
export const WCA_JOB_ROLES = { judge: "staff-judge", scrambler: "staff-scrambler", runner: "staff-runner" } as const;

/** Whether the person's WCA roles mark them for this job (`staff-judge`…): they are tried first for it. */
export function hasWcaJob(person: Pick<WcifPerson, "roles">, job: string) {
  return (person.roles ?? []).includes(WCA_JOB_ROLES[job as keyof typeof WCA_JOB_ROLES]);
}

/**
 * The app's role for a person's WCA staff roles, as Groupifier reads them: `staff-judge`,
 * `staff-scrambler` and `staff-runner` work more (staff), `staff-dataentry` enters results, and
 * any other `staff-*` (`staff-other`…) has another job, so tasks are avoided.
 */
export function staffRoleFromWcif(roles: string[] = []): "staff" | "dataentry" | "avoid" | undefined {
  if (roles.includes("staff-dataentry")) return "dataentry";
  if (Object.values(WCA_JOB_ROLES).some(role => roles.includes(role))) return "staff";
  if (roles.some(role => role.startsWith("staff-"))) return "avoid";
  return undefined;
}

/** Roles read from the WCIF: delegates, trainees, organizers and the `staff-*` roles. */
export function peopleFromWcif(competition: StoredCompetition): PeopleSettings {
  const roles: Record<PersonRole, string[]> = { delegate: [], "trainee-delegate": [], organizer: [], staff: [], dataentry: [], avoid: [], notasks: [] };
  for (const person of [...acceptedPeople(competition), ...nonCompetingStaff(competition)]) {
    const key = personKey(person);
    for (const role of person.roles ?? []) if (role === "delegate" || role === "trainee-delegate" || role === "organizer") roles[role].push(key);
    const staffRole = staffRoleFromWcif(person.roles);
    if (staffRole) roles[staffRole].push(key);
  }
  return { roles, trustedIds: [], delegateDutyIds: [...roles.delegate, ...roles["trainee-delegate"]], wcaStaffRoles: 2 };
}

/**
 * Drafts made before `staff-other` meant "avoid tasks" kept those people as staff (more tasks).
 * Moves them, once, unless they also have a job role.
 */
export function migrateWcaStaffRoles(settings: PeopleSettings, competition: StoredCompetition): PeopleSettings {
  if (settings.wcaStaffRoles === 2) return settings;
  const avoid = [...competition.persons ?? []].filter(person => staffRoleFromWcif(person.roles) === "avoid").map(personKey);
  const moved = avoid.filter(key => settings.roles.staff?.includes(key));
  return {
    ...settings,
    roles: { ...settings.roles, staff: (settings.roles.staff ?? []).filter(key => !moved.includes(key)), avoid: [...new Set([...(settings.roles.avoid ?? []), ...moved])] },
    wcaStaffRoles: 2,
  };
}

/**
 * People with a WCA role (delegate, organizer, staff-*) who are not competing: no registration,
 * or an accepted one marked as not competing. They work but never get a competitor group.
 */
export function nonCompetingStaff(competition: StoredCompetition): WcifPerson[] {
  return (competition.persons ?? [])
    .filter(person => (person.roles ?? []).some(role => role === "delegate" || role === "trainee-delegate" || role === "organizer" || role.startsWith("staff-")))
    .filter(person => !person.registration || (person.registration.status === "accepted" && person.registration.isCompeting === false))
    .map(person => ({ ...person, registration: { ...person.registration, status: "accepted", isCompeting: false, eventIds: [] } }));
}

/** A to Z by name, ignoring accents and case: the order of every list or search of people. */
export function byName(a: { name?: string | null }, b: { name?: string | null }) {
  return (a.name ?? "").localeCompare(b.name ?? "", "es", { sensitivity: "base" });
}

export function rolesOf(people: PeopleSettings, key: string): PersonRole[] {
  return PERSON_ROLES.filter(role => people.roles[role]?.includes(key));
}

export function isDelegate(people: PeopleSettings, key: string) {
  return !!people.roles.delegate?.includes(key) || !!people.roles["trainee-delegate"]?.includes(key);
}

export function isNewcomer(person: WcifPerson) {
  return !person.wcaId;
}

export function ageOf(person: WcifPerson, today = new Date()) {
  if (!person.birthdate) return undefined;
  const birth = new Date(`${person.birthdate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return undefined;
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function competitionCountry(competition: StoredCompetition) {
  return competition.schedule?.venues?.find(venue => venue.countryIso2)?.countryIso2;
}

/**
 * Keys that changed because the WCA registered someone: people without a registration are keyed
 * by WCA ID (or name), and by registrant id once registered (as staff, when publishing their tasks).
 */
export function staleKeys(competition: StoredCompetition): Map<string, string> {
  const persons = competition.persons ?? [];
  const current = new Set(persons.map(personKey));
  const aliases = new Map<string, string>();
  for (const person of persons) {
    if (person.registrantId === null || person.registrantId === undefined || person.appKey) continue;
    const old = person.wcaId ?? person.name;
    if (old && !current.has(old)) aliases.set(old, personKey(person));
  }
  return aliases;
}

/** Fields that hold text about a person, never a key. */
const TEXT_FIELDS = new Set(["name", "wcaId", "note", "label", "title"]);

/** Settings or a proposal with stale person keys (see `staleKeys`) replaced, in values and object keys. */
export function rekeyPeople<T>(value: T, aliases: Map<string, string>): T {
  if (!aliases.size) return value;
  const walk = (item: unknown): unknown => {
    if (typeof item === "string") {
      // Row ids are `roundId:personKey`.
      const at = item.lastIndexOf(":");
      return aliases.get(item) ?? (at > 0 && aliases.has(item.slice(at + 1)) ? `${item.slice(0, at + 1)}${aliases.get(item.slice(at + 1))}` : item);
    }
    if (Array.isArray(item)) {
      const mapped = item.map(walk);
      // A list of keys may now hold the same person twice.
      return item.some(inner => typeof inner === "string" && aliases.has(inner)) ? [...new Set(mapped)] : mapped;
    }
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.entries(item).map(([key, inner]) => [aliases.get(key) ?? key, TEXT_FIELDS.has(key) ? inner : walk(inner)]));
  };
  return walk(value) as T;
}
