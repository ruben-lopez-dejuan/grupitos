"use client";

import { useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { ScopeFields, ScopeRows, type ScopeLane, type ScopeRound } from "@/components/group-scope";
import { useEventName, useI18n } from "@/components/i18n";
import type { SetPreview } from "@/lib/pro/sets-preview";
import { keyOf } from "@/lib/i18n";
import { appliesToRound, newSetId, SET_TEMPLATES, type AssignmentSetConfig, type SetTemplate } from "@/lib/pro/assignment-sets";


/**
 * PRO: ordered assignment sets for the competitor groups (CompScript's AssignmentSet). The first
 * set places its people first; later sets never move them; everyone left follows the sorting rule.
 */
export function AssignmentSetsPanel({ sets, onChange, segments, lanes, rounds, onCluster, preview }: {
  sets: AssignmentSetConfig[];
  onChange: (sets: AssignmentSetConfig[]) => void;
  segments: Array<{ id: string; name: string; size: number }>;
  lanes: ScopeLane[];
  rounds: ScopeRound[];
  /** Finds or creates the cluster of a template (organizers, delegates on duty) and gives its id. */
  onCluster: (template: "organizers" | "delegating") => string;
  /** Per set: people wanted, seats and people placed in each round, with the people registered now. */
  preview?: Map<string, SetPreview[]>;
}) {
  const { t, tp } = useI18n();
  const eventName = useEventName();
  const [byEventOpen, setByEventOpen] = useState<string>();
  const roundName = (roundId: string) => {
    const round = rounds.find(item => item.id === roundId);
    return round ? `${eventName(round.eventId)}${round.roundNumber > 1 ? ` R${round.roundNumber}` : ""}` : roundId;
  };
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
              {set.segment && !segments.some(segment => segment.id === set.segment) && <option value={set.segment}>{set.segment.startsWith("team:") ? t("sets.missingTeam", { team: set.segment.slice(5) }) : t("sets.missingCluster")}</option>}
            </select>
          </label>
          <label className="set-top"><input type="checkbox" checked={set.top !== undefined} onChange={event => save({ ...set, top: event.target.checked ? 4 : undefined })} /><span>{t("sets.onlyTop")}</span>
            {set.top !== undefined && <>
              <input type="number" min={1} max={999} value={set.top} onChange={event => save({ ...set, top: Math.max(1, Number(event.target.value) || 1) })} aria-label={t("sets.topCount")} />
              <select value={set.perGroup === "round" ? "roundGroup" : set.perGroup ? "group" : "round"} onChange={event => save({ ...set, perGroup: event.target.value === "roundGroup" ? "round" : event.target.value === "group" })} aria-label={t("sets.topUnit")} title={t("sets.topUnitHelp")}><option value="group">{t("sets.perGroup")}</option><option value="roundGroup">{t("sets.perRoundGroup")}</option><option value="round">{t("sets.perRound")}</option></select>
              <button type="button" className={`plain set-by-event ${Object.keys(set.topByEvent ?? {}).length ? "on" : ""}`} aria-expanded={byEventOpen === set.id} onClick={() => setByEventOpen(open => open === set.id ? undefined : set.id)}>{Object.keys(set.topByEvent ?? {}).length ? t("sets.byEventCount", { count: Object.keys(set.topByEvent ?? {}).length }) : t("sets.byEvent")}</button>
            </>}
          </label>
          <ScopeFields value={set} onChange={change => save({ ...set, ...change })} rounds={rounds} />
        </div>
        <ScopeRows value={set} onChange={change => save({ ...set, ...change })} lanes={lanes} rounds={rounds} />
        {set.top !== undefined && byEventOpen === set.id && <div className="set-events" role="group" aria-label={t("sets.byEvent")}>
          <small>{t("sets.byEventHelp", { count: set.top })}</small>
          {[...new Set(rounds.filter(round => appliesToRound({ rounds: set.rounds }, round)).map(round => round.eventId))].map(eventId => <label key={eventId} title={eventName(eventId)}>
            <EventIcon eventId={eventId} />
            <input type="number" min={1} max={999} placeholder={String(set.top)} value={set.topByEvent?.[eventId] ?? ""} onChange={event => {
              const { [eventId]: _old, ...rest } = set.topByEvent ?? {};
              const value = Number(event.target.value);
              const next = event.target.value === "" || !value ? rest : { ...rest, [eventId]: Math.max(1, value) };
              save({ ...set, topByEvent: Object.keys(next).length ? next : undefined });
            }} aria-label={`${eventName(eventId)} · ${t("sets.topCount")}`} />
          </label>)}
        </div>}
        {!set.off && (() => {
          const rows = preview?.get(set.id) ?? [];
          if (!rows.length) return null;
          const short = rows.filter(row => row.wanted > row.placed);
          const placed = rows.reduce((sum, row) => sum + row.placed, 0);
          return short.length
            ? <p className="set-preview short">{tp("sets.previewShort", short.length)}: {short.slice(0, 4).map(row => t("sets.previewRow", { round: roundName(row.roundId), wanted: row.wanted, seats: row.seats })).join(" · ")}{short.length > 4 ? " …" : ""}</p>
            : <p className="set-preview">{t("sets.previewOk", { people: placed, rounds: rows.length })}</p>;
        })()}
      </li>;
    })}</ol>
    <div className="set-templates">
      <small>{t("sets.add")}</small>
      {SET_TEMPLATES.map(template => <button key={template} type="button" className="plain" disabled={template === "cluster" && !segments.length} onClick={() => add(template)}>+ {t(keyOf("sets.templates", template))}</button>)}
    </div>
  </div>;
}
