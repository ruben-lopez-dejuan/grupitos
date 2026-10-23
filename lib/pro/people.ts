/*
 * PRO mode people: properties per person (CompScript's SetProperty / natshelper Person
 * properties), volunteers who do not compete (AddPerson) and unavailabilities
 * (UnavailableBetween, and "while X competes" for parents who come with a child).
 */
import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import { nonCompetingStaff, type PeopleSettings } from "@/lib/people";
import { acceptedPeople, personKey } from "@/lib/rounds";
import type { TimeWindow } from "@/lib/pro/schedule";
import { migrateTeamRoles, normalizeTeams, type TeamsConfig } from "@/lib/pro/teams";

export const PERSON_EXTENSION_ID = "org.cubingusa.natshelper.v1.Person";

export type ProVolunteer = { key: string; name: string; wcaId?: string; countryIso2?: string };

/** A time range, or the times another person competes. */
export type Unavailability = { id: string; personKey: string; note?: string } & ({ start: string; end: string; whileCompeting?: undefined } | { whileCompeting: string; start?: undefined; end?: undefined });

export type ProPeople = {
  /** Column order of the properties table. */
  propertyKeys: string[];
  /** Values as text; comparisons read numbers when both sides are numeric. */
  properties: Record<string, Record<string, string>>;
  volunteers: ProVolunteer[];
  unavailable: Unavailability[];
  /** Teams read live from a property (lib/pro/teams.ts). */
  teams?: TeamsConfig;
};

export const EMPTY_PRO_PEOPLE: ProPeople = { propertyKeys: [], properties: {}, volunteers: [], unavailable: [] };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Properties stored by CompScript/natshelper in the WCIF, for accepted people. */
export function importPersonProperties(competition: StoredCompetition): Pick<ProPeople, "propertyKeys" | "properties"> {
  const properties: ProPeople["properties"] = {};
  const keys = new Set<string>();
  for (const person of acceptedPeople(competition)) {
    const data = person.extensions?.find(extension => extension.id === PERSON_EXTENSION_ID)?.data;
    const values = record(data) && record(data.properties) ? data.properties : undefined;
    if (!values) continue;
    const own: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined || typeof value === "object") continue;
      own[key] = String(value);
      keys.add(key);
    }
    if (Object.keys(own).length) properties[personKey(person)] = own;
  }
  return { propertyKeys: [...keys], properties };
}

export function normalizeProPeople(value: unknown): ProPeople {
  if (!record(value)) return EMPTY_PRO_PEOPLE;
  return {
    propertyKeys: Array.isArray(value.propertyKeys) ? value.propertyKeys.filter((key): key is string => typeof key === "string") : [],
    properties: record(value.properties) ? value.properties as ProPeople["properties"] : {},
    volunteers: Array.isArray(value.volunteers) ? value.volunteers as ProVolunteer[] : [],
    unavailable: Array.isArray(value.unavailable) ? value.unavailable as Unavailability[] : [],
    // Older drafts kept one choice per team (role or room) in `teamRoles`.
    ...((() => { const teams = normalizeTeams(value.teams) ?? migrateTeamRoles(value.teamRoles); return teams ? { teams } : {}; })()),
  };
}

/** A volunteer as a WCIF-like person who is accepted but does not compete. */
export function volunteerPerson(volunteer: ProVolunteer): WcifPerson {
  return { appKey: volunteer.key, name: volunteer.name, wcaId: volunteer.wcaId ?? null, countryIso2: volunteer.countryIso2, registrantId: null, registration: { status: "accepted", isCompeting: false, eventIds: [] } };
}

/**
 * Volunteers with a WCA ID take their name (and country) from the WCA: the WCA ID is what
 * identifies them, whatever a form or a person typed.
 */
export function withWcaNames(people: ProPeople, found: Record<string, { name: string; countryIso2?: string }>) {
  let changed = 0;
  const volunteers = people.volunteers.map(volunteer => {
    const wca = volunteer.wcaId ? found[volunteer.wcaId.trim().toUpperCase()] : undefined;
    if (!wca || (wca.name === volunteer.name && (!wca.countryIso2 || wca.countryIso2 === volunteer.countryIso2))) return volunteer;
    changed += 1;
    return { ...volunteer, wcaId: volunteer.wcaId!.trim().toUpperCase(), name: wca.name, ...(wca.countryIso2 ? { countryIso2: wca.countryIso2 } : {}) };
  });
  return { people: changed ? { ...people, volunteers } : people, changed };
}

export function newVolunteerKey(volunteers: ProVolunteer[]) {
  let index = volunteers.length + 1;
  while (volunteers.some(volunteer => volunteer.key === `vol-${index}`)) index += 1;
  return `vol-${index}`;
}

/** Competitors, non-competing staff and volunteers: everyone who can be given something to do. */
export function everyone(competition: StoredCompetition, people?: ProPeople): WcifPerson[] {
  return [...acceptedPeople(competition), ...nonCompetingStaff(competition), ...(people?.volunteers ?? []).map(volunteerPerson)];
}

/** Distinct values of a property, with how many people have each. */
export function propertyValues(people: ProPeople, property: string) {
  const counts = new Map<string, number>();
  for (const own of Object.values(people.properties)) {
    const value = own[property]?.trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * When each person is unavailable. "While X competes" uses the windows in which X competes,
 * which the caller knows once groups are made.
 */
export function unavailableWindows(unavailable: Unavailability[], competingWindows: (personKey: string) => TimeWindow[]) {
  const result = new Map<string, TimeWindow[]>();
  for (const item of unavailable) {
    const windows = item.whileCompeting !== undefined ? competingWindows(item.whileCompeting) : item.start && item.end && item.end > item.start ? [{ start: item.start, end: item.end }] : [];
    if (windows.length) result.set(item.personKey, [...(result.get(item.personKey) ?? []), ...windows]);
  }
  return result;
}

const sameName = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Volunteers that are really someone else: a registered person (or staff without registration)
 * with the same WCA ID, or else the only one with the same name; or an earlier volunteer with the
 * same WCA ID or name. Older imports created them for rows they could not match.
 */
export function findVolunteerCopies(competition: StoredCompetition, people: ProPeople) {
  const registered = [...acceptedPeople(competition), ...nonCompetingStaff(competition)];
  const byWcaId = new Map(registered.filter(person => person.wcaId).map(person => [person.wcaId!.toUpperCase(), personKey(person)]));
  const byName = new Map<string, string | null>();
  for (const person of registered) {
    const name = sameName(person.name);
    byName.set(name, byName.has(name) && byName.get(name) !== personKey(person) ? null : personKey(person));
  }
  const copies: Array<{ volunteer: string; into: string }> = [];
  const kept: ProVolunteer[] = [];
  for (const volunteer of people.volunteers) {
    const wcaId = volunteer.wcaId?.trim().toUpperCase();
    const twin = kept.find(other => (wcaId && other.wcaId?.trim().toUpperCase() === wcaId) || sameName(other.name) === sameName(volunteer.name));
    const into = (wcaId && byWcaId.get(wcaId)) || byName.get(sameName(volunteer.name)) || twin?.key;
    if (into) copies.push({ volunteer: volunteer.key, into });
    else kept.push(volunteer);
  }
  return copies;
}

/** Property owners that are nobody (left behind by a removed volunteer or a deleted registration). */
export function orphanPropertyKeys(competition: StoredCompetition, people: ProPeople) {
  const known = new Set(everyone(competition, people).map(personKey));
  return Object.keys(people.properties).filter(key => !known.has(key));
}

/**
 * Merges each copy into its person: properties (the copy's, imported later, win), unavailability
 * and role lists move to the person, and the copy is removed. Orphan properties are dropped.
 */
export function mergeVolunteerCopies(competition: StoredCompetition, people: ProPeople, settings: PeopleSettings) {
  const copies = findVolunteerCopies(competition, people);
  // A chain (copy of a copy) ends at the real person.
  const target = (key: string): string => { const next = copies.find(copy => copy.volunteer === key)?.into; return next && next !== key ? target(next) : key; };
  const moved = new Set(copies.map(copy => copy.volunteer));
  const properties: ProPeople["properties"] = {};
  const order = Object.keys(people.properties).sort((a, b) => Number(moved.has(a)) - Number(moved.has(b)) || a.localeCompare(b, undefined, { numeric: true }));
  for (const key of order) properties[target(key)] = { ...properties[target(key)], ...people.properties[key] };
  const remap = (keys: string[]) => [...new Set(keys.map(target))];
  const mergedPeople: ProPeople = {
    ...people,
    volunteers: people.volunteers.filter(volunteer => !moved.has(volunteer.key)),
    properties,
    unavailable: people.unavailable.map(item => ({ ...item, personKey: target(item.personKey), ...(item.whileCompeting !== undefined ? { whileCompeting: target(item.whileCompeting) } : {}) })) as Unavailability[],
  };
  const orphans = orphanPropertyKeys(competition, mergedPeople);
  for (const key of orphans) delete mergedPeople.properties[key];
  const mergedSettings: PeopleSettings = {
    ...settings,
    roles: Object.fromEntries(Object.entries(settings.roles).map(([role, keys]) => [role, remap(keys ?? [])])),
    trustedIds: remap(settings.trustedIds),
    delegateDutyIds: remap(settings.delegateDutyIds),
  };
  return { people: mergedPeople, settings: mergedSettings, merged: copies.length, orphans: orphans.length };
}
