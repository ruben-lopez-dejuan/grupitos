"use client";

import { useEffect } from "react";
import { EventIcon } from "@/components/event-icon";
import { useEventName, useI18n, useIssueText, useWhyText } from "@/components/i18n";
import { NewcomerBadge, PersonAvatar } from "@/components/person-badges";
import { competingGroups, duties, TASK_CODES, type GeneratedAssignment, whyOf } from "@/lib/assignments";
import { keyOf } from "@/lib/i18n";
import type { Issue } from "@/lib/validation";

/** Side panel with one person's groups and duties across every generated round. */
export function PersonCard({ rows, roundOrder, photo, roles, issues, groupLabel = (_, group) => String(group), onGoTo, onClose }: {
  /** This person's assignment rows, one per round. */
  rows: GeneratedAssignment[];
  roundOrder: string[];
  photo?: string;
  roles: string[];
  issues: Issue[];
  /** How people know a group (PRO: "1 Araba"). */
  groupLabel?: (roundId: string, group: number) => string;
  onGoTo: (roundId: string, group: number) => void;
  onClose: () => void;
}) {
  const { t, tp } = useI18n();
  const eventName = useEventName();
  const issueText = useIssueText(groupLabel);
  const whyText = useWhyText();
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

  return <aside className="person-card" aria-label={t("personCard.label", { name: person.name })}>
    <header>
      <PersonAvatar name={person.name} url={photo} size={56} />
      <div>
        <h3>{person.name}</h3>
        <small>{person.wcaId ?? <NewcomerBadge withLabel />}</small>
        {roles.length > 0 && <div className="person-roles">{roles.map(role => <span key={role}>{role}</span>)}</div>}
      </div>
      <button type="button" className="plain close" onClick={onClose} aria-label={t("personCard.close")}>×</button>
    </header>
    <p className="person-summary">{tp("personCard.competing", competing)} · {tp("personCard.tasks", totalDuties)}</p>
    <ul className="person-rounds">{sorted.map(row => {
      const groups = competingGroups(row);
      const rowIssues = issues.filter(issue => issue.assignmentId === row.id);
      return <li key={row.id}>
        <button type="button" onClick={() => onGoTo(row.roundId, groups[0] ?? duties(row)[0]?.group ?? 1)} title={t("personCard.goTo")}>
          <EventIcon eventId={row.eventId} label={eventName(row.eventId)} />
          <span className="round-label">{eventName(row.eventId)}<small>{t("rounds.roundNumber", { number: row.roundId.split("-r").at(-1) ?? "" })}</small></span>
          <span className="round-tasks">
            {groups.map(group => <span key={`c${group}`} className="cell-chip mini competitor">C G{groupLabel(row.roundId, group)}{row.station && groups.length === 1 ? ` · P${row.station}` : ""}</span>)}
            {duties(row).map(duty => <span key={`${duty.role}${duty.group}`} className={`cell-chip mini ${duty.role}`} title={[t(keyOf("tasks", duty.role)), ...(whyOf(row, duty.group) ? [whyText(whyOf(row, duty.group)!)] : [])].join("\n")}>{TASK_CODES[duty.role]} G{groupLabel(row.roundId, duty.group)}</span>)}
            {!groups.length && !duties(row).length && <span className="muted-mark">—</span>}
          </span>
          {rowIssues.length > 0 && <i className={`issue-dot static ${rowIssues.some(issue => issue.severity === "error") ? "error" : "warning"}`} title={rowIssues.map(issueText).join("\n")} />}
        </button>
      </li>;
    })}</ul>
  </aside>;
}
