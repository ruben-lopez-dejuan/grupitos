"use client";

import { useEffect } from "react";
import { EventIcon } from "@/components/event-icon";
import { NewcomerBadge, PersonAvatar } from "@/components/person-badges";
import { competingGroups, duties, TASK_CODES, TASK_LABELS, type GeneratedAssignment } from "@/lib/assignments";
import type { Issue } from "@/lib/validation";

/** Side panel with one person's groups and duties across every generated round. */
export function PersonCard({ rows, roundOrder, eventNames, photo, roles, issues, onGoTo, onClose }: {
  /** This person's assignment rows, one per round. */
  rows: GeneratedAssignment[];
  roundOrder: string[];
  eventNames: Record<string, string>;
  photo?: string;
  roles: string[];
  issues: Issue[];
  onGoTo: (roundId: string, group: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const person = rows[0];
  if (!person) return null;
  const sorted = [...rows].sort((a, b) => roundOrder.indexOf(a.roundId) - roundOrder.indexOf(b.roundId));
  const totalDuties = rows.reduce((sum, row) => sum + duties(row).length, 0);
  const competing = rows.filter(row => competingGroups(row).length > 0).length;

  return <aside className="person-card" aria-label={`Ficha de ${person.name}`}>
    <header>
      <PersonAvatar name={person.name} url={photo} size={56} />
      <div>
        <h3>{person.name}</h3>
        <small>{person.wcaId ?? <NewcomerBadge withLabel />}</small>
        {roles.length > 0 && <div className="person-roles">{roles.map(role => <span key={role}>{role}</span>)}</div>}
      </div>
      <button type="button" className="plain close" onClick={onClose} aria-label="Cerrar ficha">×</button>
    </header>
    <p className="person-summary"><strong>{competing}</strong> {competing === 1 ? "ronda" : "rondas"} compitiendo · <strong>{totalDuties}</strong> {totalDuties === 1 ? "tarea" : "tareas"}</p>
    <ul className="person-rounds">{sorted.map(row => {
      const groups = competingGroups(row);
      const rowIssues = issues.filter(issue => issue.assignmentId === row.id);
      return <li key={row.id}>
        <button type="button" onClick={() => onGoTo(row.roundId, groups[0] ?? duties(row)[0]?.group ?? 1)} title="Ver en la matriz">
          <EventIcon eventId={row.eventId} label={eventNames[row.eventId] ?? row.eventId} />
          <span className="round-label">{eventNames[row.eventId] ?? row.eventId}<small>Ronda {row.roundId.split("-r").at(-1)}</small></span>
          <span className="round-tasks">
            {groups.map(group => <span key={`c${group}`} className="cell-chip mini competitor">C G{group}{row.station && groups.length === 1 ? ` · P${row.station}` : ""}</span>)}
            {duties(row).map(duty => <span key={`${duty.role}${duty.group}`} className={`cell-chip mini ${duty.role}`} title={TASK_LABELS[duty.role]}>{TASK_CODES[duty.role]} G{duty.group}</span>)}
            {!groups.length && !duties(row).length && <span className="muted-mark">—</span>}
          </span>
          {rowIssues.length > 0 && <i className={`issue-dot static ${rowIssues.some(issue => issue.severity === "error") ? "error" : "warning"}`} title={rowIssues.map(issue => issue.message).join("\n")} />}
        </button>
      </li>;
    })}</ul>
  </aside>;
}
