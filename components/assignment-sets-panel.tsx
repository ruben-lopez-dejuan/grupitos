"use client";

import { EventIcon } from "@/components/event-icon";
import { useEventName, useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import { appliesToRound, formatGroupNumbers, newSetId, parseGroupNumbers, SET_TEMPLATES, type AssignmentSetConfig, type SetTemplate } from "@/lib/pro/assignment-sets";

type Lane = { key: string; name: string; color: string };
type Round = { id: string; eventId: string; roundNumber: number };

/**
 * PRO: ordered assignment sets for the competitor groups (CompScript's AssignmentSet). The first
 * set places its people first; later sets never move them; everyone left follows the sorting rule.
 */
export function AssignmentSetsPanel({ sets, onChange, segments, lanes, rounds, onCluster }: {
  sets: AssignmentSetConfig[];
  onChange: (sets: AssignmentSetConfig[]) => void;
  segments: Array<{ id: string; name: string; size: number }>;
  lanes: Lane[];
  rounds: Round[];
  /** Finds or creates the cluster of a template (organizers, delegates on duty) and gives its id. */
  onCluster: (template: "organizers" | "delegating") => string;
}) {
  const { t, tp } = useI18n();
  const eventName = useEventName();
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
      const roundCount = rounds.filter(round => appliesToRound({ ...set, off: false }, round)).length;
      const groupMode = Array.isArray(set.groups) ? "numbers" : set.groups;
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
          <label><span>{t("sets.rounds")}</span>
            <select value={Array.isArray(set.rounds) ? "pick" : set.rounds} onChange={event => save({ ...set, rounds: event.target.value === "pick" ? rounds.filter(round => appliesToRound({ ...set, off: false }, round)).map(round => round.id) : event.target.value as "first" | "all" })}>
              <option value="first">{t("sets.firstRounds")}</option><option value="all">{t("sets.allRounds")}</option><option value="pick">{t("sets.pickRounds")}</option>
            </select>
            <small>{tp("sets.roundCount", roundCount)}</small>
          </label>
          <label><span>{t("sets.groups")}</span>
            <select value={groupMode} onChange={event => save({ ...set, groups: event.target.value === "numbers" ? [1] : event.target.value as "any" | "first" | "last" })}>
              <option value="any">{t("sets.anyGroup")}</option><option value="first">{t("sets.firstGroup")}</option><option value="last">{t("sets.lastGroup")}</option><option value="numbers">{t("sets.groupNumbers")}</option>
            </select>
            {Array.isArray(set.groups) && <input key={formatGroupNumbers(set.groups)} className="set-numbers" defaultValue={formatGroupNumbers(set.groups)} placeholder="1, 3-4" onBlur={event => { const numbers = parseGroupNumbers(event.target.value); save({ ...set, groups: numbers.length ? numbers : "any" }); }} aria-label={t("sets.groupNumbers")} />}
          </label>
        </div>
        {lanes.length > 1 && <div className="set-lanes" role="group" aria-label={t("sets.where")}>
          <span>{t("sets.where")}</span>
          {lanes.map(lane => {
            const on = set.lanes.includes(lane.key);
            return <button key={lane.key} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => save({ ...set, lanes: on ? set.lanes.filter(key => key !== lane.key) : [...set.lanes, lane.key] })}><i style={{ background: lane.color }} />{lane.name}</button>;
          })}
          {!set.lanes.length && <small>{t("sets.anyLane")}</small>}
        </div>}
        {Array.isArray(set.rounds) && <div className="set-rounds" role="group" aria-label={t("sets.pickRounds")}>
          {rounds.map(round => {
            const on = (set.rounds as string[]).includes(round.id);
            return <button key={round.id} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => save({ ...set, rounds: on ? (set.rounds as string[]).filter(id => id !== round.id) : [...(set.rounds as string[]), round.id] })} title={`${eventName(round.eventId)} · ${t("sets.roundNumber", { number: round.roundNumber })}`}><EventIcon eventId={round.eventId} />{round.roundNumber > 1 && <small>R{round.roundNumber}</small>}</button>;
          })}
        </div>}
      </li>;
    })}</ol>
    <div className="set-templates">
      <small>{t("sets.add")}</small>
      {SET_TEMPLATES.map(template => <button key={template} type="button" className="plain" disabled={template === "cluster" && !segments.length} onClick={() => add(template)}>+ {t(keyOf("sets.templates", template))}</button>)}
    </div>
  </div>;
}
