import { normalizeAssignments, type GeneratedAssignment } from "@/lib/assignments";
import type { AssignmentOptions } from "@/lib/group-generator";
import type { PeopleSettings } from "@/lib/people";
import { normalizeProPeople } from "@/lib/pro/people";
import { normalizeScoring } from "@/lib/pro/scoring";
import { normalizeJobs, normalizeSegments, type Segment } from "@/lib/pro/segments";
import { normalizeProSchedule, type LaneStaffing, type ProConfig } from "@/lib/pro/schedule";
import type { RoundConfig, ZoneMode } from "@/lib/rounds";
import type { PrintingOptions } from "@/lib/scorecards/options";
import type { Seating } from "@/lib/seating";

export type WorkspaceSettings = {
  stations: number;
  zoneMode: ZoneMode;
  rounds: RoundConfig[];
  options: AssignmentOptions;
  people: PeopleSettings;
  printing: PrintingOptions;
  /** How competitors sit at fixed stations; absent in drafts older than the option (in order). */
  seating?: Seating;
  /** PRO mode for large competitions; absent until it is first switched on. */
  pro?: ProConfig;
};

export type Draft = {
  version: 3;
  settings?: WorkspaceSettings;
  /** Signature of the settings the current proposal was generated with. */
  generatedWith?: string;
  assignments: GeneratedAssignment[];
  /** When the settings saved at the WCA that this draft last loaded or published were saved. */
  remoteSavedAt?: string;
};

/**
 * Unavailabilities used to live in PRO people; they are now for both modes, in `people`. Moves
 * the old ones over, once.
 */
export function withSharedUnavailability(settings: WorkspaceSettings): WorkspaceSettings {
  const old = settings.pro?.people?.unavailable ?? [];
  if (!old.length) return settings;
  const own = settings.people.unavailable ?? [];
  const unavailable = [...own, ...old.filter(item => !own.some(other => other.id === item.id))];
  return { ...settings, people: { ...settings.people, unavailable }, pro: { ...settings.pro!, people: { ...settings.pro!.people!, unavailable: [] } } };
}

export function draftStorageKey(competitionId: string) {
  // Storage keys keep the app's first name (WCA Easy Groups), so saved drafts stay readable.
  return `wca-easy-groups:draft:${competitionId}`;
}

function usesSegments(settings: WorkspaceSettings) {
  const pro = settings.pro;
  return !!pro && (Object.keys(pro.jobs ?? {}).length > 0 || Object.values(pro.staffing ?? {}).some(lane => lane.team) || (pro.sets ?? []).some(set => !set.off && (set.segment || set.first)) || (pro.stationRules ?? []).some(rule => !rule.off && (rule.first || rule.exclusions.some(item => item.segment))));
}

/** Only the settings that change what the generator produces. */
export function generationSignature(settings: WorkspaceSettings) {
  return JSON.stringify({
    stations: settings.stations,
    zoneMode: settings.zoneMode,
    // Seating from the middle depends on how many stations a row has; in order, on nothing.
    ...(settings.seating?.order === "center" || settings.pro?.stationRules?.some(rule => !rule.off && rule.seating === "center") ? { seating: { tables: settings.seating?.tables, seats: settings.seating?.seats, rowTables: settings.seating?.rowTables } } : {}),
    rounds: settings.rounds.filter(round => round.enabled).map(({ id, groups, scramblers, runners }) => ({ id, groups, scramblers, runners })),
    options: settings.options,
    people: settings.people,
    // Room/stage names and colours, and activities without groups, do not change the proposal.
    pro: settings.pro?.enabled ? {
      rooms: settings.pro.schedule.rooms.map(room => ({ id: room.id, stages: room.stages.map(stage => stage.id) })),
      blocks: settings.pro.schedule.blocks,
      volunteers: settings.pro.people?.volunteers.map(volunteer => volunteer.key),
      unavailable: settings.pro.people?.unavailable,
      // Teams are read live from a property: their setup and people's values shape the proposal.
      teams: settings.pro.people?.teams,
      teamValues: settings.pro.people?.properties && Object.fromEntries(Object.entries(settings.pro.people.properties).flatMap(([key, own]) => {
        const property = settings.pro?.people?.teams?.property ?? "team";
        return own[property] ? [[key, own[property]]] : [];
      })),
      // Segment rules decide who may do each job, so they shape the proposal too.
      jobs: settings.pro.jobs,
      staffing: settings.pro.staffing,
      sets: settings.pro.sets?.filter(set => !set.off).map(({ name: _name, ...set }) => set),
      stationRules: settings.pro.stationRules?.filter(rule => !rule.off),
      // A station rule by property reads people's properties.
      stationProperties: settings.pro.stationRules?.some(rule => !rule.off && rule.sortBy === "property") ? settings.pro.people?.properties : undefined,
      scoring: settings.pro.scoring?.enabled ? settings.pro.scoring : undefined,
      preferences: settings.pro.scoring?.enabled && settings.pro.scoring.weights.preferences ? settings.pro.people?.properties : undefined,
      // Segments shape the proposal when they decide who may do a job or who staffs a room.
      segments: usesSegments(settings) ? settings.pro.segments : undefined,
      properties: usesSegments(settings) ? settings.pro.people?.properties : undefined,
    } : undefined,
  });
}

/**
 * Older drafts sent a team to a room by writing an "Equipo: X" cluster (property = X) as that
 * room's dedicated team in the zone tab. The team's own setup carries the room now, so that copy
 * is dropped; any other room team is kept.
 */
function withoutOldTeamRooms(staffing: Record<string, LaneStaffing>, segments: unknown, teamRoles: unknown) {
  const old = teamRoles as { property?: string; map?: Record<string, string> } | undefined;
  if (!old?.property || !old.map || !Array.isArray(segments)) return staffing;
  const next = { ...staffing };
  for (const [team, choice] of Object.entries(old.map)) {
    if (typeof choice !== "string" || !choice.startsWith("lane:")) continue;
    const lane = choice.slice(5);
    const segment = (segments as Segment[]).find(item => item.id === next[lane]?.team);
    const copy = segment?.rules.length === 1 && segment.rules[0].kind === "property" && segment.rules[0].key === old.property && segment.rules[0].op === "eq" && segment.rules[0].value === team && !segment.rules[0].negate;
    if (!copy) continue;
    const { team: _dropped, ...rest } = next[lane];
    if (Object.keys(rest).length) next[lane] = rest;
    else delete next[lane];
  }
  return next;
}

/**
 * Accepts the current format; older drafts keep their assignments (migrated) and
 * lose their settings, which had a different shape.
 */
export function parseDraft(raw: string | null): Draft | undefined {
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as unknown;
    if (Array.isArray(data)) return { version: 3, assignments: normalizeAssignments(data) };
    if (data && typeof data === "object") {
      const draft = data as { version?: number; assignments?: unknown[] };
      if (draft.version === 3) {
        const current = data as Draft;
        const pro = current.settings?.pro;
        const settings = pro && current.settings ? { ...current.settings, pro: { ...pro, schedule: normalizeProSchedule(pro.schedule), ...(pro.people ? { people: normalizeProPeople(pro.people) } : {}), segments: normalizeSegments(pro.segments), jobs: normalizeJobs(pro.jobs), scoring: normalizeScoring(pro.scoring), ...(pro.staffing ? { staffing: withoutOldTeamRooms(pro.staffing, pro.segments, (pro.people as { teamRoles?: unknown } | undefined)?.teamRoles) } : {}) } } : current.settings;
        return { ...current, settings, assignments: normalizeAssignments((draft.assignments ?? []) as never[]) };
      }
      if (draft.version === 2) return { version: 3, assignments: normalizeAssignments((draft.assignments ?? []) as never[]) };
    }
  } catch {
    // Fall through: an unreadable draft is treated as missing.
  }
  return undefined;
}
