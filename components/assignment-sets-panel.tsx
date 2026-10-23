"use client";

import { ScopeFields, ScopeRows, type ScopeLane, type ScopeRound } from "@/components/group-scope";
import { useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import { newSetId, SET_TEMPLATES, type AssignmentSetConfig, type SetTemplate } from "@/lib/pro/assignment-sets";


/**
 * PRO: ordered assignment sets for the competitor groups (CompScript's AssignmentSet). The first
 * set places its people first; later sets never move them; everyone left follows the sorting rule.
 */
export function AssignmentSetsPanel({ sets, onChange, segments, lanes, rounds, onCluster }: {
  sets: AssignmentSetConfig[];
  onChange: (sets: AssignmentSetConfig[]) => void;
  segments: Array<{ id: string; name: string; size: number }>;
  lanes: ScopeLane[];
  rounds: ScopeRound[];
  /** Finds or creates the cluster of a template (organizers, delegates on duty) and gives its id. */
  onCluster: (template: "organizers" | "delegating") => string;
}) {
  const { t } = useI18n();
  const save = (set: AssignmentSetConfig) => onChange(sets.map(item => item.id === set.id ? set : item));
  const move = (index: number, step: -1 | 1) => {
    const next = [...sets];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };
  const mainLane = lanes[0]?.key;

  function add(template: SetTemplate) {
    const base = { id: newSetId(sets), name: t(keyOf("sets.templates", template)), rounds: "first" as const, groups: "any" as const };
    const set: AssignmentSetConfig = template === "featured"
      ? { ...base, top: 4, perGroup: true, lanes: mainLane ? [mainLane] : [], featured: true }
      : template === "cluster"
        ? { ...base, segment: segments[0]?.id, lanes: [] }
        : { ...base, segment: onCluster(template), lanes: mainLane ? [mainLane] : [] };
    onChange([...sets, set]);
  }

  return <div className="assignment-sets">
    {sets.length === 0 && <p className="setup-note">{t("sets.empty")}</p>}
    <ol>{sets.map((set, index) => {
      return <li key={set.id} className={set.off ? "off" : ""}>
        <div className="set-head">
          <span className="task-order-position">{index + 1}</span>
          <input className="set-name" value={set.name} onChange={event => save({ ...set, name: event.target.value })} aria-label={t("sets.name")} />
          <button type="button" className={`set-star ${set.featured ? "on" : ""}`} aria-pressed={!!set.featured} onClick={() => save({ ...set, featured: !set.featured })} title={t("sets.featuredHelp")}>★ <span>{t("sets.featured")}</span></button>
          <label className="set-on"><input type="checkbox" checked={!set.off} onChange={event => save({ ...set, off: !event.target.checked })} />{t("sets.active")}</label>
          <span className="task-order-moves">
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("sets.up", { name: set.name })}>↑</button>
            <button type="button" disabled={index === sets.length - 1} onClick={() => move(index, 1)} aria-label={t("sets.down", { name: set.name })}>↓</button>
            <button type="button" onClick={() => onChange(sets.filter(item => item.id !== set.id))} aria-label={t("sets.remove", { name: set.name })}>×</button>
          </span>
        </div>
        <div className="set-fields">
          <label><span>{t("sets.who")}</span>
            <select value={set.segment ?? ""} onChange={event => save({ ...set, segment: event.target.value || undefined })}>
              <option value="">{t("sets.anyone")}</option>
              {segments.map(segment => <option key={segment.id} value={segment.id}>{segment.name} ({segment.size})</option>)}
              {set.segment && !segments.some(segment => segment.id === set.segment) && <option value={set.segment}>{t("sets.missingCluster")}</option>}
            </select>
          </label>
          <label className="set-top"><input type="checkbox" checked={set.top !== undefined} onChange={event => save({ ...set, top: event.target.checked ? 4 : undefined })} /><span>{t("sets.onlyTop")}</span>
            {set.top !== undefined && <>
              <input type="number" min={1} max={999} value={set.top} onChange={event => save({ ...set, top: Math.max(1, Number(event.target.value) || 1) })} aria-label={t("sets.topCount")} />
              <select value={set.perGroup ? "group" : "round"} onChange={event => save({ ...set, perGroup: event.target.value === "group" })} aria-label={t("sets.topUnit")}><option value="group">{t("sets.perGroup")}</option><option value="round">{t("sets.perRound")}</option></select>
            </>}
          </label>
          <ScopeFields value={set} onChange={change => save({ ...set, ...change })} rounds={rounds} />
        </div>
        <ScopeRows value={set} onChange={change => save({ ...set, ...change })} lanes={lanes} rounds={rounds} />
      </li>;
    })}</ol>
    <div className="set-templates">
      <small>{t("sets.add")}</small>
      {SET_TEMPLATES.map(template => <button key={template} type="button" className="plain" disabled={template === "cluster" && !segments.length} onClick={() => add(template)}>+ {t(keyOf("sets.templates", template))}</button>)}
    </div>
  </div>;
}
