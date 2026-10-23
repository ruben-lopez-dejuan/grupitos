/*
 * PRO mode people: properties per person (CompScript's SetProperty / natshelper Person
 * properties), volunteers who do not compete (AddPerson) and unavailabilities
 * (UnavailableBetween, and "while X competes" for parents who come with a child).
 */
import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import { acceptedPeople, personKey } from "@/lib/rounds";
import type { TimeWindow } from "@/lib/pro/schedule";

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

/** Competitors and volunteers, everyone who can be given something to do. */
export function everyone(competition: StoredCompetition, people?: ProPeople): WcifPerson[] {
  return [...acceptedPeople(competition), ...(people?.volunteers ?? []).map(volunteerPerson)];
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
