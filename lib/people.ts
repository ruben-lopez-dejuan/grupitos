import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
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
