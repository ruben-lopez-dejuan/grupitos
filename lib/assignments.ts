/** Staff duties, named after the WCIF `staff-*` assignment codes. */
export const DUTY_ROLES = ["judge", "scrambler", "runner", "delegate", "stagelead", "announcer", "dataentry", "other"] as const;
export type DutyRole = typeof DUTY_ROLES[number];
export type TaskRole = "competitor" | DutyRole;
export type CellValue = TaskRole | "";
export type Task = { group: number; role: TaskRole };
export type CellRef = { id: string; group: number };

export const TASK_LABELS: Record<CellValue, string> = {
  "": "Vacío", competitor: "Compite", judge: "Juez", scrambler: "Mezclador", runner: "Runner",
  delegate: "Delegado", stagelead: "Jefe de escenario", announcer: "Locutor", dataentry: "Data entry", other: "Otra tarea",
};
export const TASK_CODES: Record<CellValue, string> = {
  "": "", competitor: "C", judge: "J", scrambler: "M", runner: "R", delegate: "D", stagelead: "L", announcer: "A", dataentry: "E", other: "O",
};

export function wcifAssignmentCode(role: TaskRole) {
  return role === "competitor" ? "competitor" : `staff-${role}`;
}

export type GeneratedAssignment = {
  id: string;
  roundId: string;
  eventId: string;
  personId: string;
  name: string;
  wcaId?: string | null;
  birthdate?: string;
  seedResult?: number;
  /** Whether the person takes part in this round as a competitor (registered or advanced). */
  inRound: boolean;
  station?: number;
  /** At most one task per group. Anything is allowed here; the validator reports what is wrong. */
  tasks: Task[];
};

/** Formats saved by earlier versions of the app. */
type LegacyAssignment = Omit<GeneratedAssignment, "tasks" | "inRound"> & {
  tasks?: Task[];
  inRound?: boolean;
  group?: number | null;
  duties?: Array<{ group: number; role: DutyRole }>;
  dutyGroup?: number;
  dutyRole?: DutyRole | "";
};

export function normalizeAssignments(assignments: LegacyAssignment[]): GeneratedAssignment[] {
  return assignments.map(({ group, duties, dutyGroup, dutyRole, tasks, inRound, ...item }) => {
    if (tasks) return { ...item, inRound: inRound ?? true, tasks };
    const legacyDuties = duties ?? (dutyGroup && dutyRole ? [{ group: dutyGroup, role: dutyRole }] : []);
    const competing: Task[] = group ? [{ group, role: "competitor" }] : [];
    return { ...item, inRound: inRound ?? true, tasks: sortTasks([...competing, ...legacyDuties]) };
  });
}

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.group - b.group);
}

export function cellValue(item: GeneratedAssignment, group: number): CellValue {
  return item.tasks.find(task => task.group === group)?.role ?? "";
}

export function competingGroups(item: GeneratedAssignment) {
  return item.tasks.filter(task => task.role === "competitor").map(task => task.group);
}

/** The single competing group, or undefined when there is none or more than one. */
export function competingGroup(item: GeneratedAssignment) {
  const groups = competingGroups(item);
  return groups.length === 1 ? groups[0] : undefined;
}

export function duties(item: GeneratedAssignment) {
  return item.tasks.filter((task): task is { group: number; role: DutyRole } => task.role !== "competitor");
}

function firstFreeStation(roundAssignments: GeneratedAssignment[], group: number, stations: number, exceptId: string) {
  const used = new Set(roundAssignments.filter(item => item.id !== exceptId && competingGroup(item) === group).map(item => item.station));
  for (let station = 1; station <= stations; station += 1) if (!used.has(station)) return station;
  return undefined;
}

export type ApplyResult = { assignments: GeneratedAssignment[]; changed: number };

/**
 * Writes one value into many cells, without restrictions. When someone ends up competing
 * in exactly one group of a fixed-station round, they keep or receive a station.
 */
export function applyCells(assignments: GeneratedAssignment[], cells: CellRef[], value: CellValue, options: { stations: number; fixedStations: boolean }): ApplyResult {
  const byId = new Map<string, number[]>();
  for (const cell of cells) byId.set(cell.id, [...(byId.get(cell.id) ?? []), cell.group]);

  const next = [...assignments];
  let changed = 0;

  next.forEach((item, index) => {
    const groups = byId.get(item.id);
    if (!groups) return;
    let tasks = item.tasks;
    for (const group of groups) {
      if (cellValue({ ...item, tasks }, group) === value) continue;
      tasks = tasks.filter(task => task.group !== group);
      if (value) tasks = sortTasks([...tasks, { group, role: value }]);
    }
    if (tasks === item.tasks) return;

    const before = competingGroup(item);
    let updated: GeneratedAssignment = { ...item, tasks };
    const after = competingGroup(updated);
    if (after === undefined) updated = { ...updated, station: undefined };
    else if (after !== before) updated = { ...updated, station: options.fixedStations ? firstFreeStation(next.filter(other => other.roundId === item.roundId), after, options.stations, item.id) : undefined };
    next[index] = updated;
    changed += 1;
  });

  return { assignments: changed ? next : assignments, changed };
}

export type GroupTotals = { group: number; counts: Record<TaskRole, number> };

export function emptyCounts(): Record<TaskRole, number> {
  return { competitor: 0, judge: 0, scrambler: 0, runner: 0, delegate: 0, stagelead: 0, announcer: 0, dataentry: 0, other: 0 };
}

export function groupTotals(roundAssignments: GeneratedAssignment[], groupCount: number): GroupTotals[] {
  const totals = Array.from({ length: groupCount }, (_, index) => ({ group: index + 1, counts: emptyCounts() }));
  for (const item of roundAssignments) {
    for (const task of item.tasks) {
      const target = totals[task.group - 1];
      if (target) target.counts[task.role] += 1;
    }
  }
  return totals;
}

/** Number of staff duties per person across every round. */
export function dutyLoads(assignments: GeneratedAssignment[]) {
  const loads = new Map<string, number>();
  for (const item of assignments) loads.set(item.personId, (loads.get(item.personId) ?? 0) + duties(item).length);
  return loads;
}

/** Highest group number referenced in a round, so out-of-range assignments stay visible. */
export function usedGroupCount(roundAssignments: GeneratedAssignment[]) {
  return Math.max(0, ...roundAssignments.flatMap(item => item.tasks.map(task => task.group)));
}
