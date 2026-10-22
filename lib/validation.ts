import { competingGroup, competingGroups, duties, groupTotals, TASK_LABELS, type GeneratedAssignment } from "@/lib/assignments";
import { judgesNeeded } from "@/lib/rounds";

/**
 * - error: breaks a hard rule; the WCIF would be wrong if published.
 * - warning: the proposal does not reach what was configured, or ignores a configured role.
 */
export type IssueSeverity = "error" | "warning";

export type IssueCode =
  | "no-group"
  | "several-groups"
  | "not-registered"
  | "group-out-of-range"
  | "missing-station"
  | "station-out-of-range"
  | "duplicate-station"
  | "over-capacity"
  | "empty-group"
  | "missing-scramblers"
  | "missing-judges"
  | "missing-runners"
  | "missing-delegate"
  | "missing-dataentry"
  | "scrambler-without-result"
  | "role-with-normal-task";

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
  checkDelegates: boolean;
  checkDataEntry: boolean;
  /** People who should not get judging, scrambling or running (data entry, and delegates/organizers unless allowed). */
  noNormalTasks: Set<string>;
};

export const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1 };
const NORMAL_DUTIES = new Set(["judge", "scrambler", "runner"]);

export function validateRound(roundId: string, roundAssignments: GeneratedAssignment[], rules: RoundRules): Issue[] {
  const issues: Issue[] = [];
  const add = (issue: Omit<Issue, "key" | "roundId">) => issues.push({ ...issue, roundId, key: `${roundId}:${issue.code}:${issue.assignmentId ?? ""}:${issue.group ?? ""}` });

  for (const item of roundAssignments) {
    const competing = competingGroups(item);
    if (item.inRound && competing.length === 0) {
      add({ severity: "error", code: "no-group", assignmentId: item.id, message: `${item.name} está en la ronda y no compite en ningún grupo.` });
    }
    if (competing.length > 1) {
      add({ severity: "error", code: "several-groups", group: competing[1], assignmentId: item.id, message: `${item.name} compite en varios grupos (${competing.map(group => `G${group}`).join(", ")}).` });
    }
    if (!item.inRound && competing.length > 0) {
      add({ severity: "warning", code: "not-registered", group: competing[0], assignmentId: item.id, message: `${item.name} compite en G${competing[0]}, pero no está en esta ronda.` });
    }
    for (const task of item.tasks) {
      if (task.group < 1 || task.group > rules.groups) {
        add({ severity: "error", code: "group-out-of-range", group: task.group, assignmentId: item.id, message: `${item.name} tiene «${TASK_LABELS[task.role]}» en G${task.group}, pero la ronda tiene ${rules.groups} grupos.` });
      }
    }
    for (const duty of duties(item)) {
      if (duty.role === "scrambler" && item.seedResult === undefined) {
        add({ severity: "warning", code: "scrambler-without-result", group: duty.group, assignmentId: item.id, message: `${item.name} mezcla en G${duty.group} sin resultados oficiales en esta prueba.` });
      }
      if (NORMAL_DUTIES.has(duty.role) && rules.noNormalTasks.has(item.personId)) {
        add({ severity: "warning", code: "role-with-normal-task", group: duty.group, assignmentId: item.id, message: `${item.name} tiene un rol que no hace tareas normales y es ${TASK_LABELS[duty.role].toLowerCase()} en G${duty.group}.` });
      }
    }
  }

  if (rules.fixedStations) {
    for (let group = 1; group <= rules.groups; group += 1) {
      const members = roundAssignments.filter(item => competingGroup(item) === group);
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

  for (const { group, counts } of groupTotals(roundAssignments, rules.groups)) {
    if (counts.competitor === 0) {
      add({ severity: "warning", code: "empty-group", group, message: `G${group} no tiene competidores.` });
      continue;
    }
    if (counts.scrambler < rules.scramblers) {
      add({ severity: "warning", code: "missing-scramblers", group, message: `G${group} tiene ${counts.scrambler} de ${rules.scramblers} mezcladores.` });
    }
    if (rules.checkJudges) {
      const judges = judgesNeeded(counts.competitor, rules.stations);
      if (counts.judge < judges) add({ severity: "warning", code: "missing-judges", group, message: `G${group} tiene ${counts.judge} de ${judges} jueces.` });
      if (counts.runner < rules.runners) add({ severity: "warning", code: "missing-runners", group, message: `G${group} tiene ${counts.runner} de ${rules.runners} runners.` });
    }
    if (rules.checkDelegates && counts.delegate === 0) add({ severity: "warning", code: "missing-delegate", group, message: `G${group} no tiene delegado de turno.` });
    if (rules.checkDataEntry && counts.dataentry === 0) add({ severity: "warning", code: "missing-dataentry", group, message: `G${group} no tiene data entry.` });
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.group ?? 0) - (b.group ?? 0));
}

export function countBySeverity(issues: Issue[]) {
  const counts: Record<IssueSeverity, number> = { error: 0, warning: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}
