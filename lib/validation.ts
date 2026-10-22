import { competingGroup, competingGroups, duties, groupTotals, type GeneratedAssignment } from "@/lib/assignments";
import { slotsOverlap, type GroupSlot } from "@/lib/pro/schedule";
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
  | "role-with-normal-task"
  | "time-overlap";

export type Issue = {
  key: string;
  severity: IssueSeverity;
  code: IssueCode;
  roundId: string;
  group?: number;
  /** Assignment row the issue points at, when it concerns one person. */
  assignmentId?: string;
  /** Values for the issue's text, which the interface writes in the current language. */
  params: IssueParams;
};

/** `task` is a task role id and `names` a list of people; the interface translates both. */
export type IssueParams = { name?: string; group?: number; groups?: number[]; total?: number; count?: number; need?: number; station?: number; task?: string; names?: string[]; otherRound?: string; otherGroup?: number; otherTask?: string };

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
      add({ severity: "error", code: "no-group", assignmentId: item.id, params: { name: item.name } });
    }
    if (competing.length > 1) {
      add({ severity: "error", code: "several-groups", group: competing[1], assignmentId: item.id, params: { name: item.name, groups: competing } });
    }
    if (!item.inRound && competing.length > 0) {
      add({ severity: "warning", code: "not-registered", group: competing[0], assignmentId: item.id, params: { name: item.name, group: competing[0] } });
    }
    for (const task of item.tasks) {
      if (task.group < 1 || task.group > rules.groups) {
        add({ severity: "error", code: "group-out-of-range", group: task.group, assignmentId: item.id, params: { name: item.name, task: task.role, group: task.group, total: rules.groups } });
      }
    }
    for (const duty of duties(item)) {
      if (duty.role === "scrambler" && item.seedResult === undefined) {
        add({ severity: "warning", code: "scrambler-without-result", group: duty.group, assignmentId: item.id, params: { name: item.name, group: duty.group } });
      }
      if (NORMAL_DUTIES.has(duty.role) && rules.noNormalTasks.has(item.personId)) {
        add({ severity: "warning", code: "role-with-normal-task", group: duty.group, assignmentId: item.id, params: { name: item.name, task: duty.role, group: duty.group } });
      }
    }
  }

  if (rules.fixedStations) {
    for (let group = 1; group <= rules.groups; group += 1) {
      const members = roundAssignments.filter(item => competingGroup(item) === group);
      const byStation = new Map<number, GeneratedAssignment[]>();
      for (const item of members) {
        if (item.station === undefined) {
          add({ severity: "error", code: "missing-station", group, assignmentId: item.id, params: { name: item.name, group } });
        } else if (item.station < 1 || item.station > rules.stations) {
          add({ severity: "error", code: "station-out-of-range", group, assignmentId: item.id, params: { name: item.name, station: item.station, total: rules.stations } });
        } else {
          byStation.set(item.station, [...(byStation.get(item.station) ?? []), item]);
        }
      }
      for (const [station, holders] of byStation) {
        if (holders.length < 2) continue;
        for (const item of holders) {
          add({ severity: "error", code: "duplicate-station", group, assignmentId: item.id, params: { station, group, names: holders.map(holder => holder.name) } });
        }
      }
      if (members.length > rules.stations) {
        add({ severity: "error", code: "over-capacity", group, params: { group, count: members.length, total: rules.stations } });
      }
    }
  }

  for (const { group, counts } of groupTotals(roundAssignments, rules.groups)) {
    if (counts.competitor === 0) {
      add({ severity: "warning", code: "empty-group", group, params: { group } });
      continue;
    }
    if (counts.scrambler < rules.scramblers) {
      add({ severity: "warning", code: "missing-scramblers", group, params: { group, count: counts.scrambler, need: rules.scramblers } });
    }
    if (rules.checkJudges) {
      const judges = judgesNeeded(counts.competitor, rules.stations);
      if (counts.judge < judges) add({ severity: "warning", code: "missing-judges", group, params: { group, count: counts.judge, need: judges } });
      if (counts.runner < rules.runners) add({ severity: "warning", code: "missing-runners", group, params: { group, count: counts.runner, need: rules.runners } });
    }
    if (rules.checkDelegates && counts.delegate === 0) add({ severity: "warning", code: "missing-delegate", group, params: { group } });
    if (rules.checkDataEntry && counts.dataentry === 0) add({ severity: "warning", code: "missing-dataentry", group, params: { group } });
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.group ?? 0) - (b.group ?? 0));
}

/**
 * PRO mode: tasks of one person whose groups overlap in time, in this round or across rounds
 * (parallel stages, an event in another room). Each clash is reported on both tasks.
 */
export function validateTimes(assignments: GeneratedAssignment[], slots: Map<string, GroupSlot[]>): Issue[] {
  type Busy = { item: GeneratedAssignment; group: number; role: string; slot: GroupSlot };
  const byPerson = new Map<string, Busy[]>();
  for (const item of assignments) {
    for (const task of item.tasks) {
      const slot = slots.get(item.roundId)?.find(candidate => candidate.group === task.group);
      if (slot) byPerson.set(item.personId, [...(byPerson.get(item.personId) ?? []), { item, group: task.group, role: task.role, slot }]);
    }
  }
  const issues = new Map<string, Issue>();
  const add = (busy: Busy, other: Busy) => {
    const key = `${busy.item.roundId}:time-overlap:${busy.item.id}:${busy.group}`;
    if (!issues.has(key)) issues.set(key, { key, severity: "error", code: "time-overlap", roundId: busy.item.roundId, group: busy.group, assignmentId: busy.item.id, params: { name: busy.item.name, task: busy.role, group: busy.group, otherRound: other.item.roundId, otherGroup: other.group, otherTask: other.role } });
  };
  for (const tasks of byPerson.values()) {
    for (let i = 0; i < tasks.length; i += 1) {
      for (let j = i + 1; j < tasks.length; j += 1) {
        if (tasks[i].item.roundId === tasks[j].item.roundId && tasks[i].group === tasks[j].group) continue;
        if (slotsOverlap(tasks[i].slot, tasks[j].slot)) {
          add(tasks[i], tasks[j]);
          add(tasks[j], tasks[i]);
        }
      }
    }
  }
  return [...issues.values()];
}

export function countBySeverity(issues: Issue[]) {
  const counts: Record<IssueSeverity, number> = { error: 0, warning: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}
