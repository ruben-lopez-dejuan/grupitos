export type DutyRole = "judge" | "scrambler" | "runner";
export type AssignedDuty = { group: number; role: DutyRole };
export type CellValue = "competitor" | DutyRole | "";
export type CellRef = { id: string; group: number };

export type GeneratedAssignment = {
  id: string;
  roundId: string;
  eventId: string;
  personId: string;
  name: string;
  wcaId?: string | null;
  birthdate?: string;
  seedResult?: number;
  group: number;
  station?: number;
  duties: AssignedDuty[];
};

/** Shape written by the first versions of the app, before a person could hold several duties. */
type LegacyAssignment = Omit<GeneratedAssignment, "duties"> & { duties?: AssignedDuty[]; dutyGroup?: number; dutyRole?: DutyRole | "" };

export function normalizeAssignments(assignments: LegacyAssignment[]): GeneratedAssignment[] {
  return assignments.map(({ dutyGroup, dutyRole, ...item }) => ({
    ...item,
    duties: item.duties ?? (dutyGroup && dutyRole ? [{ group: dutyGroup, role: dutyRole }] : []),
  }));
}

export function cellValue(item: GeneratedAssignment, group: number): CellValue {
  if (item.group === group) return "competitor";
  return item.duties.find(duty => duty.group === group)?.role ?? "";
}

function firstFreeStation(roundAssignments: GeneratedAssignment[], group: number, stations: number, exceptId: string) {
  const used = new Set(roundAssignments.filter(item => item.group === group && item.id !== exceptId).map(item => item.station));
  for (let station = 1; station <= stations; station += 1) if (!used.has(station)) return station;
  return undefined;
}

export type ApplyResult = {
  assignments: GeneratedAssignment[];
  changed: number;
  /** Cells that could not take the value, e.g. a duty on the cell where the person competes. */
  skipped: number;
};

/**
 * Writes one value into many cells. Each person keeps exactly one competing group:
 * a competing cell can only be moved, never cleared or turned into a duty.
 */
export function applyCells(assignments: GeneratedAssignment[], cells: CellRef[], value: CellValue, options: { stations: number; fixedStations: boolean }): ApplyResult {
  const byId = new Map<string, number[]>();
  for (const cell of cells) byId.set(cell.id, [...(byId.get(cell.id) ?? []), cell.group]);

  const next = [...assignments];
  let changed = 0;
  let skipped = 0;

  next.forEach((item, index) => {
    const groups = byId.get(item.id);
    if (!groups) return;
    let updated = item;

    if (value === "competitor") {
      if (groups.length !== 1) { skipped += groups.length; return; }
      const group = groups[0];
      if (group === item.group) return;
      const station = options.fixedStations ? firstFreeStation(next.filter(other => other.roundId === item.roundId), group, options.stations, item.id) : undefined;
      updated = { ...item, group, station, duties: item.duties.filter(duty => duty.group !== group) };
    } else {
      for (const group of groups) {
        if (group === updated.group) { skipped += 1; continue; }
        const current = updated.duties.find(duty => duty.group === group)?.role ?? "";
        if (current === value) continue;
        const duties = updated.duties.filter(duty => duty.group !== group);
        updated = { ...updated, duties: value ? [...duties, { group, role: value }].sort((a, b) => a.group - b.group) : duties };
      }
    }

    if (updated !== item) {
      next[index] = updated;
      changed += 1;
    }
  });

  return { assignments: changed ? next : assignments, changed, skipped };
}

export type GroupTotals = { group: number; competitors: number; judges: number; scramblers: number; runners: number };

export function groupTotals(roundAssignments: GeneratedAssignment[], groupCount: number): GroupTotals[] {
  const totals = Array.from({ length: groupCount }, (_, index) => ({ group: index + 1, competitors: 0, judges: 0, scramblers: 0, runners: 0 }));
  for (const item of roundAssignments) {
    const own = totals[item.group - 1];
    if (own) own.competitors += 1;
    for (const duty of item.duties) {
      const target = totals[duty.group - 1];
      if (!target) continue;
      if (duty.role === "judge") target.judges += 1;
      else if (duty.role === "scrambler") target.scramblers += 1;
      else target.runners += 1;
    }
  }
  return totals;
}

/** Number of duties per person across every round. */
export function dutyLoads(assignments: GeneratedAssignment[]) {
  const loads = new Map<string, number>();
  for (const item of assignments) loads.set(item.personId, (loads.get(item.personId) ?? 0) + item.duties.length);
  return loads;
}

/** Highest group number referenced in a round, so out-of-range assignments stay visible. */
export function usedGroupCount(roundAssignments: GeneratedAssignment[]) {
  return Math.max(0, ...roundAssignments.map(item => item.group), ...roundAssignments.flatMap(item => item.duties.map(duty => duty.group)));
}
