import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import { acceptedPeople, personKey } from "@/lib/rounds";

export const PERSON_ROLES = ["delegate", "trainee-delegate", "organizer", "staff", "dataentry"] as const;
export type PersonRole = typeof PERSON_ROLES[number];

export type PeopleSettings = {
  roles: Partial<Record<PersonRole, string[]>>;
  /** Preferred scramblers. */
  trustedIds: string[];
  /** Delegates and trainees who receive delegate duties when that option is on. */
  delegateDutyIds: string[];
};

/** Roles read from the WCIF: delegates, trainees, organizers and any `staff-*` role. */
export function peopleFromWcif(competition: StoredCompetition): PeopleSettings {
  const roles: Record<PersonRole, string[]> = { delegate: [], "trainee-delegate": [], organizer: [], staff: [], dataentry: [] };
  for (const person of acceptedPeople(competition)) {
    const key = personKey(person);
    for (const role of person.roles ?? []) {
      if (role === "delegate" || role === "trainee-delegate" || role === "organizer") roles[role].push(key);
      else if (role === "staff-dataentry") roles.dataentry.push(key);
      else if (role.startsWith("staff-") && !roles.staff.includes(key)) roles.staff.push(key);
    }
  }
  return { roles, trustedIds: [], delegateDutyIds: [...roles.delegate, ...roles["trainee-delegate"]] };
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
