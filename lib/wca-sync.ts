/*
 * Publishing to the WCA (PATCH /api/v0/competitions/{id}/wcif) and keeping the app's settings
 * there, as Groupifier and Delegate Dashboard keep theirs: whoever manages the competition finds
 * them on any device. Every publish starts from the WCIF just downloaded, because the WCA replaces
 * the whole schedule and the whole list of competition extensions with what it receives.
 */
import type { GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition, WcifActivity, WcifExtension } from "@/lib/competition-store";
import { parseDraft, type WorkspaceSettings } from "@/lib/draft";
import type { PersonRole } from "@/lib/people";
import { PERSON_EXTENSION_ID, type ProPeople } from "@/lib/pro/people";
import { roundIdOf, type GroupSlot, type ProSchedule } from "@/lib/pro/schedule";
import { exportWcif, specUrlOf, type WcifExportReport } from "@/lib/wcif-export";
import { isDraftExtension } from "@/lib/wcif-session";

/** WCA extension ids are dot-separated words: no hyphens. */
export const SETTINGS_EXTENSION_ID = "grupitos.Settings";
/** The id under the app's first name (WCA Easy Groups): read if present, replaced when publishing. */
const OLD_SETTINGS_EXTENSION_ID = "wcaEasyGroups.Settings";
const isSettingsExtension = (id: string) => id === SETTINGS_EXTENSION_ID || id === OLD_SETTINGS_EXTENSION_ID;
export const SETTINGS_SPEC_URL = "https://github.com/ruben-lopez-dejuan/grupitos/blob/main/docs/WCIF_EXTENSION.md";

export type SavedSettings = { settings: WorkspaceSettings; generatedWith?: string; savedAt: string; savedBy?: string };

/** Lists that may say why someone does not work (another job, health…). */
const PRIVATE_ROLES: PersonRole[] = ["avoid", "notasks"];

/**
 * The settings without anything personal, for the public WCIF: people's properties (form and
 * spreadsheet answers), busy times and their notes, volunteers, the "avoid tasks" and "no tasks"
 * lists and the people picked by hand in clusters. They stay in this browser's draft and in the
 * downloaded WCIF file; `withPrivateSettings` puts them back when settings come from the WCA.
 */
export function publicSettings(settings: WorkspaceSettings): WorkspaceSettings {
  const roles = Object.fromEntries(Object.entries(settings.people.roles).filter(([role]) => !PRIVATE_ROLES.includes(role as PersonRole)));
  const pro = settings.pro && {
    ...settings.pro,
    ...(settings.pro.people ? { people: { ...settings.pro.people, propertyKeys: [], properties: {}, volunteers: [], unavailable: [] } } : {}),
    ...(settings.pro.segments ? { segments: settings.pro.segments.map(segment => ({ ...segment, rules: segment.rules.map(rule => rule.kind === "people" ? { ...rule, keys: [] } : rule) })) } : {}),
  };
  const { unavailable: _unavailable, ...people } = settings.people;
  return { ...settings, people: { ...people, roles }, ...(pro ? { pro } : {}) };
}

/** Settings from the WCA with the personal parts this browser keeps (see `publicSettings`). */
export function withPrivateSettings(remote: WorkspaceSettings, local: WorkspaceSettings | undefined): WorkspaceSettings {
  if (!local) return remote;
  const roles = { ...remote.people.roles };
  for (const role of PRIVATE_ROLES) if (local.people.roles[role]) roles[role] = local.people.roles[role];
  const people = { ...remote.people, roles, ...(local.people.unavailable ? { unavailable: local.people.unavailable } : {}) };
  if (!remote.pro) return { ...remote, people };
  const own = local.pro?.people;
  const keys = new Map((local.pro?.segments ?? []).map(segment => [segment.id, segment.rules]));
  return {
    ...remote,
    people,
    pro: {
      ...remote.pro,
      ...(own ? { people: { ...(remote.pro.people ?? own), propertyKeys: own.propertyKeys, properties: own.properties, volunteers: own.volunteers, unavailable: own.unavailable } } : {}),
      ...(remote.pro.segments ? { segments: remote.pro.segments.map(segment => ({ ...segment, rules: segment.rules.map((rule, index) => {
        const mine = keys.get(segment.id)?.[index];
        return rule.kind === "people" && mine?.kind === "people" ? { ...rule, keys: mine.keys } : rule;
      }) })) } : {}),
    },
  };
}
type SettingsData = { version: 1; savedAt: string; savedBy?: string; encoding: "deflate-raw;base64"; payload: string };

const GROUP_CODE = /-g\d+(?:-a\d+)?$/;

async function streamText(input: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([input as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

const fromBase64 = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));

/**
 * The settings as a competition extension. The WCA keeps an extension in a 64 KB text column, so
 * they go compressed (a national championship's settings: about 40 KB of JSON, 7 KB compressed).
 * Competition extensions are part of the public WCIF: nothing here may be private, so the settings
 * go through `publicSettings`, and the generation signature (which holds people's properties and
 * busy times) is not sent.
 */
export async function settingsExtension(saved: SavedSettings): Promise<WcifExtension> {
  const payload = toBase64(await streamText(new TextEncoder().encode(JSON.stringify({ settings: publicSettings(saved.settings) })), new CompressionStream("deflate-raw")));
  const data: SettingsData = { version: 1, savedAt: saved.savedAt, ...(saved.savedBy ? { savedBy: saved.savedBy } : {}), encoding: "deflate-raw;base64", payload };
  return { id: SETTINGS_EXTENSION_ID, specUrl: SETTINGS_SPEC_URL, data };
}

/** The settings saved in a WCIF, read as a stored draft would be; undefined when absent or unreadable. */
export async function readSettings(competition: StoredCompetition): Promise<SavedSettings | undefined> {
  const data = (competition.extensions?.find(item => item.id === SETTINGS_EXTENSION_ID) ?? competition.extensions?.find(item => item.id === OLD_SETTINGS_EXTENSION_ID))?.data as Partial<SettingsData> | undefined;
  if (!data || data.version !== 1 || data.encoding !== "deflate-raw;base64" || typeof data.payload !== "string" || typeof data.savedAt !== "string") return undefined;
  try {
    const json = new TextDecoder().decode(await streamText(fromBase64(data.payload), new DecompressionStream("deflate-raw")));
    const parsed = JSON.parse(json) as { settings?: WorkspaceSettings; generatedWith?: string };
    const draft = parseDraft(JSON.stringify({ version: 3, settings: parsed.settings, generatedWith: parsed.generatedWith, assignments: [] }));
    if (!draft?.settings) return undefined;
    return { settings: draft.settings, generatedWith: draft.generatedWith, savedAt: data.savedAt, ...(data.savedBy ? { savedBy: data.savedBy } : {}) };
  } catch {
    return undefined;
  }
}

/** Round activities (not groups) by code and room, with their times. */
function roundActivities(competition: StoredCompetition) {
  const result = new Map<string, string>();
  for (const venue of competition.schedule?.venues ?? []) for (const room of venue.rooms ?? []) for (const activity of room.activities ?? []) {
    if (!roundIdOf(activity.activityCode) || GROUP_CODE.test(activity.activityCode)) continue;
    result.set(`${room.id}|${activity.id}|${activity.activityCode}`, `${activity.startTime}|${activity.endTime}`);
  }
  return result;
}

/**
 * Round activities that changed at the WCA since this WCIF was imported (moved, added or
 * removed). The groups were planned on the old times, so publishing then would place them wrong.
 */
export function changedRounds(stored: StoredCompetition, fresh: StoredCompetition) {
  const before = roundActivities(stored);
  const after = roundActivities(fresh);
  const codes = new Set<string>();
  for (const [key, times] of before) if (after.get(key) !== times) codes.add(key.split("|")[2]);
  for (const key of after.keys()) if (!before.has(key)) codes.add(key.split("|")[2]);
  return [...codes].sort();
}

export type PatchSummary = WcifExportReport & {
  /** People whose WCA assignments change, and how many assignments come and go. */
  changedPeople: number;
  added: number;
  removed: number;
  withGroups: boolean;
};

export type WcifPatch = {
  formatVersion: string;
  id: string;
  schedule?: StoredCompetition["schedule"];
  /**
   * `registration` only for people new to the WCIF, or listed without a registration (organizers,
   * delegates) and given tasks: the WCA then registers them as non-competing staff. Without a
   * registration the WCA drops their assignments.
   */
  persons?: Array<{ wcaUserId: number; assignments: NonNullable<StoredCompetition["persons"]>[number]["assignments"]; extensions: WcifExtension[]; registration?: { isCompeting: false } }>;
  extensions: WcifExtension[];
};

/** Fills the spec URL of known extensions that lack one (the WCA refuses an extension without it). */
function withSpecUrls(node: unknown) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach(withSpecUrls);
  const own = node as { extensions?: WcifExtension[] };
  if (Array.isArray(own.extensions)) for (const item of own.extensions) item.specUrl ??= specUrlOf(item.id);
  Object.values(node).forEach(withSpecUrls);
}

const assignmentKey = (item: { activityId: number; assignmentCode: string; stationNumber?: number | null }) => `${item.activityId}|${item.assignmentCode}|${item.stationNumber ?? ""}`;

/**
 * A person's extensions for the public WCIF: natshelper's person properties (form answers) are
 * personal, so they are never sent, and those already at the WCA are taken out.
 */
function publicPersonExtensions(extensions: WcifExtension[]) {
  return extensions.flatMap(item => {
    if (item.id !== PERSON_EXTENSION_ID) return [item];
    const { properties: _private, ...rest } = (item.data ?? {}) as Record<string, unknown>;
    return Object.keys(rest).length ? [{ ...item, data: rest }] : [];
  });
}

/**
 * What to send: the groups and assignments (when there is a proposal) built on the fresh WCIF, the
 * natshelper (stages) and Groupifier extensions, and the settings. Only `wcaUserId`, assignments and
 * extensions go per person, so roles and registrations stay as the WCA has them; events are not
 * sent at all. Nothing personal is sent (see `publicSettings` and `publicPersonExtensions`).
 */
export function buildPatch({ fresh, assignments, rounds, slots, schedule, people, settings }: {
  fresh: StoredCompetition;
  assignments: GeneratedAssignment[];
  rounds: Array<{ id: string; eventId: string; roundNumber: number; groups: number }>;
  slots?: Map<string, GroupSlot[]>;
  schedule?: ProSchedule;
  people?: ProPeople;
  settings: WcifExtension;
}): { patch: WcifPatch; summary: PatchSummary } {
  const extensions = [...(fresh.extensions ?? []).filter(item => !isSettingsExtension(item.id) && !isDraftExtension(item.id)), settings];
  const patch: WcifPatch = { formatVersion: fresh.formatVersion ?? "2.2", id: fresh.id, extensions };
  const empty: PatchSummary = { people: 0, assignments: 0, groupsReused: 0, groupsCreated: 0, groupsRemoved: 0, newStaff: 0, skipped: [], changedPeople: 0, added: 0, removed: 0, withGroups: false };
  if (!assignments.length) return { patch, summary: empty };

  const { wcif, report } = exportWcif({ competition: fresh, assignments, rounds, slots, schedule, people });
  const before = new Map((fresh.persons ?? []).map(person => [person.wcaUserId, new Set((person.assignments ?? []).map(assignmentKey))]));
  const unregistered = new Set((fresh.persons ?? []).filter(person => !person.registration).map(person => person.wcaUserId));
  const summary: PatchSummary = { ...report, changedPeople: 0, added: 0, removed: 0, withGroups: true };
  patch.schedule = wcif.schedule;
  patch.persons = (wcif.persons ?? []).filter(person => person.wcaUserId !== undefined).map(person => {
    const now = new Set((person.assignments ?? []).map(assignmentKey));
    const old = before.get(person.wcaUserId) ?? new Set<string>();
    const added = [...now].filter(key => !old.has(key)).length;
    const removed = [...old].filter(key => !now.has(key)).length;
    summary.added += added;
    summary.removed += removed;
    if (added || removed) summary.changedPeople += 1;
    const register = !before.has(person.wcaUserId) || (unregistered.has(person.wcaUserId) && now.size > 0);
    if (register && before.has(person.wcaUserId)) summary.newStaff += 1;
    return { wcaUserId: person.wcaUserId!, assignments: person.assignments ?? [], extensions: publicPersonExtensions(person.extensions ?? []), ...(register ? { registration: { isCompeting: false as const } } : {}) };
  });
  withSpecUrls(patch);
  return { patch, summary };
}

/** After publishing: what the WCA has now matches what was sent (assignments and settings). */
export function checkPublished(patch: WcifPatch, reread: StoredCompetition) {
  const byUser = new Map((reread.persons ?? []).map(person => [person.wcaUserId, new Set((person.assignments ?? []).map(assignmentKey))]));
  let missing = 0;
  for (const person of patch.persons ?? []) {
    const now = byUser.get(person.wcaUserId);
    if (!now) continue;
    for (const item of person.assignments ?? []) if (!now.has(assignmentKey(item))) missing += 1;
  }
  const sentSettings = patch.extensions.find(item => item.id === SETTINGS_EXTENSION_ID)?.data as { savedAt?: string } | undefined;
  const keptSettings = reread.extensions?.find(item => item.id === SETTINGS_EXTENSION_ID)?.data as { savedAt?: string } | undefined;
  const groups = new Set<number>();
  const visit = (activity: WcifActivity) => { if (GROUP_CODE.test(activity.activityCode)) groups.add(activity.id); (activity.childActivities ?? []).forEach(visit); };
  for (const venue of reread.schedule?.venues ?? []) for (const room of venue.rooms ?? []) (room.activities ?? []).forEach(visit);
  return { missing, settingsSaved: !!sentSettings && keptSettings?.savedAt === sentSettings.savedAt, groups: groups.size };
}
