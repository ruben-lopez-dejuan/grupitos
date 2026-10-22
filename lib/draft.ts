import { normalizeAssignments, type GeneratedAssignment } from "@/lib/assignments";
import type { FlowMode, Preset, RoundConfig } from "@/lib/rounds";

export type WorkspaceSettings = {
  stations: number;
  flowMode: FlowMode;
  preset: Preset;
  trustedIds: string[];
  rounds: RoundConfig[];
  avoidBeforeOwnGroup: boolean;
  assignJudges: boolean;
};

export type Draft = {
  version: 2;
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
    flowMode: settings.flowMode,
    trustedIds: settings.preset === "simple" ? [] : [...settings.trustedIds].sort(),
    rounds: settings.rounds.filter(round => round.enabled).map(({ id, groups, scramblers, runners }) => ({ id, groups, scramblers, runners })),
    avoidBeforeOwnGroup: settings.avoidBeforeOwnGroup,
    assignJudges: settings.assignJudges,
  });
}

/** Accepts the current format and the bare assignment arrays saved by earlier versions. */
export function parseDraft(raw: string | null): Draft | undefined {
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as unknown;
    if (Array.isArray(data)) return { version: 2, assignments: normalizeAssignments(data) };
    if (data && typeof data === "object" && (data as Draft).version === 2) {
      const draft = data as Draft;
      return { ...draft, assignments: normalizeAssignments(draft.assignments ?? []) };
    }
  } catch {
    // Fall through: an unreadable draft is treated as missing.
  }
  return undefined;
}
