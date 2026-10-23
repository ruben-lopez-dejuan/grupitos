import { normalizeAssignments, type GeneratedAssignment } from "@/lib/assignments";
import type { AssignmentOptions } from "@/lib/group-generator";
import type { PeopleSettings } from "@/lib/people";
import { normalizeProPeople } from "@/lib/pro/people";
import { normalizeProSchedule, type ProConfig } from "@/lib/pro/schedule";
import type { RoundConfig, ZoneMode } from "@/lib/rounds";
import type { PrintingOptions } from "@/lib/scorecards/options";

export type WorkspaceSettings = {
  stations: number;
  zoneMode: ZoneMode;
  rounds: RoundConfig[];
  options: AssignmentOptions;
  people: PeopleSettings;
  printing: PrintingOptions;
  /** PRO mode for large competitions; absent until it is first switched on. */
  pro?: ProConfig;
};

export type Draft = {
  version: 3;
  settings?: WorkspaceSettings;
  /** Signature of the settings the current proposal was generated with. */
  generatedWith?: string;
  assignments: GeneratedAssignment[];
};

export function draftStorageKey(competitionId: string) {
  return `wca-easy-groups:draft:${competitionId}`;
}

/** Only the settings that change what the generator produces. */
export function generationSignature(settings: WorkspaceSettings) {
  return JSON.stringify({
    stations: settings.stations,
    zoneMode: settings.zoneMode,
    rounds: settings.rounds.filter(round => round.enabled).map(({ id, groups, scramblers, runners }) => ({ id, groups, scramblers, runners })),
    options: settings.options,
    people: settings.people,
    // Room/stage names and colours, and activities without groups, do not change the proposal.
    pro: settings.pro?.enabled ? {
      rooms: settings.pro.schedule.rooms.map(room => ({ id: room.id, stages: room.stages.map(stage => stage.id) })),
      blocks: settings.pro.schedule.blocks,
      volunteers: settings.pro.people?.volunteers.map(volunteer => volunteer.key),
      unavailable: settings.pro.people?.unavailable,
    } : undefined,
  });
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
        const settings = current.settings?.pro ? { ...current.settings, pro: { ...current.settings.pro, schedule: normalizeProSchedule(current.settings.pro.schedule), ...(current.settings.pro.people ? { people: normalizeProPeople(current.settings.pro.people) } : {}) } } : current.settings;
        return { ...current, settings, assignments: normalizeAssignments((draft.assignments ?? []) as never[]) };
      }
      if (draft.version === 2) return { version: 3, assignments: normalizeAssignments((draft.assignments ?? []) as never[]) };
    }
  } catch {
    // Fall through: an unreadable draft is treated as missing.
  }
  return undefined;
}
