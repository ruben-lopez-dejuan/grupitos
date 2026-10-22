import { groupTotals, type GeneratedAssignment } from "@/lib/assignments";
import { judgesNeeded } from "@/lib/rounds";

/**
 * - error: breaks a hard rule; the WCIF would be wrong if published.
 * - warning: the proposal does not reach what was configured (missing staff, empty group…).
 * - preference: a soft preference could not be honoured.
 */
export type IssueSeverity = "error" | "warning" | "preference";

export type IssueCode =
  | "group-out-of-range"
  | "duty-out-of-range"
  | "duty-while-competing"
  | "missing-station"
  | "station-out-of-range"
  | "duplicate-station"
  | "over-capacity"
  | "empty-group"
  | "missing-scramblers"
  | "missing-judges"
  | "missing-runners"
  | "scrambler-without-result"
  | "works-before-competing";

export type Issue = {
  key: string;
  severity: IssueSeverity;
  code: IssueCode;
  roundId: string;
  group?: number;
  /** Assignment row the issue points at, when it concerns one person. */
  assignmentId?: string;
  message: string;
};

export type RoundRules = {
  groups: number;
  scramblers: number;
  runners: number;
  stations: number;
  fixedStations: boolean;
  /** Judges and runners are only expected when the generator is asked to assign them. */
  checkJudges: boolean;
  avoidBeforeOwnGroup: boolean;
};

export const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, preference: 2 };

export function validateRound(roundId: string, roundAssignments: GeneratedAssignment[], rules: RoundRules): Issue[] {
  const issues: Issue[] = [];
  const add = (issue: Omit<Issue, "key" | "roundId">) => issues.push({ ...issue, roundId, key: `${roundId}:${issue.code}:${issue.assignmentId ?? ""}:${issue.group ?? ""}` });

  for (const item of roundAssignments) {
    if (item.group < 1 || item.group > rules.groups) {
      add({ severity: "error", code: "group-out-of-range", group: item.group, assignmentId: item.id, message: `${item.name} compite en G${item.group}, pero la ronda tiene ${rules.groups} grupos.` });
    }
    for (const duty of item.duties) {
      if (duty.group < 1 || duty.group > rules.groups) {
        add({ severity: "error", code: "duty-out-of-range", group: duty.group, assignmentId: item.id, message: `${item.name} tiene una tarea en G${duty.group}, pero la ronda tiene ${rules.groups} grupos.` });
      }
      if (duty.group === item.group) {
        add({ severity: "error", code: "duty-while-competing", group: duty.group, assignmentId: item.id, message: `${item.name} compite y trabaja a la vez en G${duty.group}.` });
      }
      if (duty.role === "scrambler" && item.seedResult === undefined) {
        add({ severity: "warning", code: "scrambler-without-result", group: duty.group, assignmentId: item.id, message: `${item.name} mezcla en G${duty.group} sin resultados oficiales en esta prueba.` });
      }
      // With two groups, G1 can only be staffed from G2, so there is never an alternative.
      if (rules.avoidBeforeOwnGroup && rules.groups > 2 && duty.group === item.group - 1) {
        add({ severity: "preference", code: "works-before-competing", group: duty.group, assignmentId: item.id, message: `${item.name} trabaja en G${duty.group}, justo antes de competir en G${item.group}.` });
      }
    }
  }

  if (rules.fixedStations) {
    for (let group = 1; group <= rules.groups; group += 1) {
      const members = roundAssignments.filter(item => item.group === group);
      const byStation = new Map<number, GeneratedAssignment[]>();
      for (const item of members) {
        if (item.station === undefined) {
          add({ severity: "error", code: "missing-station", group, assignmentId: item.id, message: `${item.name} no tiene estación en G${group}.` });
        } else if (item.station < 1 || item.station > rules.stations) {
          add({ severity: "error", code: "station-out-of-range", group, assignmentId: item.id, message: `${item.name} tiene la estación ${item.station}, pero solo hay ${rules.stations}.` });
        } else {
          byStation.set(item.station, [...(byStation.get(item.station) ?? []), item]);
        }
      }
      for (const [station, holders] of byStation) {
        if (holders.length < 2) continue;
        for (const item of holders) {
          add({ severity: "error", code: "duplicate-station", group, assignmentId: item.id, message: `La estación ${station} de G${group} está asignada a ${holders.map(holder => holder.name).join(" y ")}.` });
        }
      }
      if (members.length > rules.stations) {
        add({ severity: "error", code: "over-capacity", group, message: `G${group} tiene ${members.length} competidores y solo ${rules.stations} estaciones.` });
      }
    }
  }

  for (const totals of groupTotals(roundAssignments, rules.groups)) {
    const { group } = totals;
    if (totals.competitors === 0) {
      add({ severity: "warning", code: "empty-group", group, message: `G${group} no tiene competidores.` });
      continue;
    }
    if (totals.scramblers < rules.scramblers) {
      add({ severity: "warning", code: "missing-scramblers", group, message: `G${group} tiene ${totals.scramblers} de ${rules.scramblers} mezcladores.` });
    }
    if (rules.checkJudges) {
      const judges = judgesNeeded(totals.competitors, rules.stations);
      if (totals.judges < judges) {
        add({ severity: "warning", code: "missing-judges", group, message: `G${group} tiene ${totals.judges} de ${judges} jueces.` });
      }
      if (totals.runners < rules.runners) {
        add({ severity: "warning", code: "missing-runners", group, message: `G${group} tiene ${totals.runners} de ${rules.runners} runners.` });
      }
    }
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.group ?? 0) - (b.group ?? 0));
}

export function countBySeverity(issues: Issue[]) {
  const counts: Record<IssueSeverity, number> = { error: 0, warning: 0, preference: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}
