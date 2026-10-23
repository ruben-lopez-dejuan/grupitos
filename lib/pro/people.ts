/*
 * PRO mode people: properties per person (CompScript's SetProperty / natshelper Person
 * properties), volunteers who do not compete (AddPerson) and unavailabilities
 * (UnavailableBetween, and "while X competes" for parents who come with a child).
 */
import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import { nonCompetingStaff, type PeopleSettings } from "@/lib/people";
import { acceptedPeople, personKey } from "@/lib/rounds";
import type { TimeWindow } from "@/lib/pro/schedule";

export const PERSON_EXTENSION_ID = "org.cubingusa.natshelper.v1.Person";

export type ProVolunteer = { key: string; name: string; wcaId?: string; countryIso2?: string };

/** A time range, or the times another person competes. */
export type Unavailability = { id: string; personKey: string; note?: string } & ({ start: string; end: string; whileCompeting?: undefined } | { whileCompeting: string; start?: undefined; end?: undefined });

/** What a team (a property value such as natshelper's `team`) means for the app. */
export const TEAM_ROLES = ["staff", "dataentry", "notasks"] as const;
export type TeamRole = typeof TEAM_ROLES[number];
export type TeamRoles = { property: string; map: Record<string, TeamRole | "none"> };

export type ProPeople = {
  /** Column order of the properties table. */
  propertyKeys: string[];
  /** Values as text; comparisons read numbers when both sides are numeric. */
  properties: Record<string, Record<string, string>>;
  volunteers: ProVolunteer[];
  unavailable: Unavailability[];
  /** Last team-to-role choice, to show it again. */
  teamRoles?: TeamRoles;
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
    ...(record(value.teamRoles) && typeof value.teamRoles.property === "string" && record(value.teamRoles.map) ? { teamRoles: value.teamRoles as TeamRoles } : {}),
  };
}

/** A volunteer as a WCIF-like person who is accepted but does not compete. */
export function volunteerPerson(volunteer: ProVolunteer): WcifPerson {
  return { appKey: volunteer.key, name: volunteer.name, wcaId: volunteer.wcaId ?? null, countryIso2: volunteer.countryIso2, registrantId: null, registration: { status: "accepted", isCompeting: false, eventIds: [] } };
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

const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** A first guess for a team name: volunteers judge and run, data entry enters results, desks and streaming do no normal tasks. */
export function suggestTeamRole(team: string): TeamRole | "none" {
  const name = plain(team);
  if (/data/.test(name)) return "dataentry";
  if (/voluntari|volunteer|staff|juez|judge/.test(name)) return "staff";
  if (/registr|stand|stream|medic|acceso|access|check|info|foto|photo|prensa|press/.test(name)) return "notasks";
  return "none";
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

/** Adds everyone whose team maps to a role to that role's list; returns the new lists and how many were added. */
export function applyTeamRoles(settings: PeopleSettings, people: ProPeople, teamRoles: TeamRoles) {
  const roles = { ...settings.roles };
  let added = 0;
  for (const [key, own] of Object.entries(people.properties)) {
    const role = teamRoles.map[own[teamRoles.property]?.trim() ?? ""];
    if (!role || role === "none") continue;
    const list = roles[role] ?? [];
    if (list.includes(key)) continue;
    roles[role] = [...list, key];
    added += 1;
  }
  return { settings: { ...settings, roles }, added };
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
