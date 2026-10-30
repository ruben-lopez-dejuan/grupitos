"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { EventIcon } from "@/components/event-icon";
import { ROUND_SCOPE_KEYS, ScopeFields, ScopeRows, type ScopeLane, type ScopeRound } from "@/components/group-scope";
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
    if (index + step < 0 || index + step >= sets.length) return;
    const next = [...sets];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };
  /** The set opened to edit; the others show one summary line. */
  const [open, setOpen] = useState<string>();
  /** While dragging (mouse or touch, like reordering a Google Keep list): the order on screen. */
  const [drag, setDrag] = useState<{ id: string; order: string[] }>();
  const listRef = useRef<HTMLOListElement>(null);
  const shown = drag ? drag.order.map(id => sets.find(set => set.id === id)!).filter(Boolean) : sets;

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    // Keeps the moves coming to the handle while the pointer leaves it (not every pointer can be captured).
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* moves still arrive while over the handle */ }
    setDrag({ id, order: sets.map(set => set.id) });
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag || !listRef.current) return;
    // The new place is after every other card whose middle is above the pointer.
    const others = [...listRef.current.children].filter(item => (item as HTMLElement).dataset.id !== drag.id) as HTMLElement[];
    const index = others.filter(item => { const box = item.getBoundingClientRect(); return box.top + box.height / 2 < event.clientY; }).length;
    const order = others.map(item => item.dataset.id!);
    order.splice(index, 0, drag.id);
    if (order.join() !== drag.order.join()) setDrag({ ...drag, order });
  }
  function endDrag() {
    if (!drag) return;
    const order = drag.order;
    setDrag(undefined);
    if (order.join() !== sets.map(set => set.id).join()) onChange(order.map(id => sets.find(set => set.id === id)!));
  }
  function keyMove(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    move(index, event.key === "ArrowUp" ? -1 : 1);
  }

  /** One line: who, how many, which rounds and where. */
  const summary = (set: AssignmentSetConfig) => {
    const segment = segments.find(item => item.id === set.segment);
    const who = set.segment ? segment?.name ?? (set.segment.startsWith("team:") ? t("sets.missingTeam", { team: set.segment.slice(5) }) : t("sets.missingCluster")) : t("sets.anyone");
    const top = set.top !== undefined ? t("sets.summaryTop", { count: set.top, unit: set.perGroup === "round" ? t("sets.perRoundGroup") : set.perGroup ? t("sets.perGroup") : t("sets.perRound") }) : "";
    const which = Array.isArray(set.rounds) ? tp("sets.roundCount", set.rounds.length) : t(ROUND_SCOPE_KEYS[set.rounds]);
    const where = set.lanes.length ? set.lanes.map(key => lanes.find(lane => lane.key === key)?.name ?? key).join(", ") : t("sets.summaryAnywhere");
    const groups = set.groups === "any" ? "" : set.groups === "first" ? t("sets.firstGroup") : set.groups === "last" ? t("sets.lastGroup") : `G${set.groups.join(", ")}`;
    const firstName = set.first ? t("sets.summaryFirst", { name: segments.find(item => item.id === set.first)?.name ?? t("sets.missingCluster") }) : "";
    const positions = set.positions ? t(keyOf("sets.positionsShort", set.positions)) : "";
    const ranked = set.fill === "ranked" ? t("sets.summaryRanked") : "";
    return [who, top, positions, firstName, which, where, groups, ranked].filter(Boolean).join(" · ");
  };
  /** How many people the set takes: its top N, or the size of its cluster. */
  const people = (set: AssignmentSetConfig) => set.top !== undefined ? `top ${set.top}` : set.segment ? String(segments.find(item => item.id === set.segment)?.size ?? 0) : t("sets.everyone");
  const mainLane = lanes[0]?.key;

  function add(template: SetTemplate) {
    if (template === "finals") {
      // The Spanish Championship 2025 finals: odd positions to one stage, even to the other
      // (the first two stages of a room, or the first two lanes).
      const stages = lanes.filter(lane => !lane.key.endsWith(":room"));
      const room = stages.find(lane => stages.filter(other => other.key.split(":")[0] === lane.key.split(":")[0]).length > 1)?.key.split(":")[0];
      const [left, right] = room ? stages.filter(lane => lane.key.split(":")[0] === room) : lanes;
      const odd: AssignmentSetConfig = { id: newSetId(sets), name: t("sets.finalsOdd"), rounds: "final", groups: "any", positions: "odd", lanes: left ? [left.key] : [] };
      const even: AssignmentSetConfig = { id: newSetId([...sets, odd]), name: t("sets.finalsEven"), rounds: "final", groups: "any", positions: "even", lanes: right ? [right.key] : [] };
      onChange([...sets, odd, even]);
      setOpen(odd.id);
      return;
    }
    const base = { id: newSetId(sets), name: t(keyOf("sets.templates", template)), rounds: "first" as const, groups: "any" as const };
    const set: AssignmentSetConfig = template === "featured"
      ? { ...base, top: 4, perGroup: true, lanes: mainLane ? [mainLane] : [], featured: true }
      : template === "cluster"
        ? { ...base, segment: segments[0]?.id, lanes: [] }
        : { ...base, segment: onCluster(template), lanes: mainLane ? [mainLane] : [] };
    onChange([...sets, set]);
    setOpen(set.id);
  }

  return <div className="assignment-sets">
    {sets.length === 0 && <p className="setup-note">{t("sets.empty")}</p>}
    <ol ref={listRef} className="set-cards">{shown.map((set, index) => {
      const rows = preview?.get(set.id) ?? [];
      const short = set.off ? [] : rows.filter(row => row.wanted > row.placed);
      const isOpen = open === set.id && !drag;
      return <li key={set.id} data-id={set.id} className={[set.off && "off", isOpen && "open", drag?.id === set.id && "dragging"].filter(Boolean).join(" ")}>
        <div className="set-row">
          <button type="button" className="drag-handle" aria-label={t("sets.drag", { name: set.name })} title={t("sets.dragHelp")}
            onPointerDown={event => startDrag(event, set.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={event => keyMove(event, index)}>⋮⋮</button>
          <span className="task-order-position">{index + 1}</span>
          <button type="button" className="set-summary" aria-expanded={isOpen} onClick={() => setOpen(current => current === set.id ? undefined : set.id)}>
            <strong>{set.name}{set.featured && <span className="set-summary-star" title={t("sets.featured")}> ★</span>}{short.length > 0 && <span className="set-summary-warning" title={tp("sets.previewShort", short.length)}> ⚠</span>}</strong>
            <small>{summary(set)}</small>
          </button>
          <span className="set-people" title={t("sets.peopleHelp")}>{people(set)}</span>
          <label className="set-on" title={t("sets.active")}><input type="checkbox" checked={!set.off} onChange={event => save({ ...set, off: !event.target.checked })} aria-label={t("sets.active")} /></label>
          <span className="set-chevron" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
        </div>
        {isOpen && <div className="set-body">
        <div className="set-head">
          <input className="set-name" value={set.name} onChange={event => save({ ...set, name: event.target.value })} aria-label={t("sets.name")} />
          <button type="button" className={`set-star ${set.featured ? "on" : ""}`} aria-pressed={!!set.featured} onClick={() => save({ ...set, featured: !set.featured })} title={t("sets.featuredHelp")}>★ <span>{t("sets.featured")}</span></button>
          <button type="button" className="plain danger" onClick={() => onChange(sets.filter(item => item.id !== set.id))} aria-label={t("sets.remove", { name: set.name })}>{t("sets.delete")}</button>
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
        <div className="set-fields set-order">
          <label><span>{t("sets.positions")}</span>
            <select value={set.positions ?? ""} onChange={event => save({ ...set, positions: (event.target.value || undefined) as AssignmentSetConfig["positions"] })}>
              <option value="">{t("sets.allPositions")}</option><option value="odd">{t("sets.oddPositions")}</option><option value="even">{t("sets.evenPositions")}</option>
            </select>
          </label>
          <label title={t("sets.firstHelp")}><span>{t("sets.countFirst")}</span>
            <select value={set.first ?? ""} onChange={event => save({ ...set, first: event.target.value || undefined })}>
              <option value="">{t("sets.nobodyFirst")}</option>
              {segments.map(segment => <option key={segment.id} value={segment.id}>{segment.name} ({segment.size})</option>)}
              {set.first && !segments.some(segment => segment.id === set.first) && <option value={set.first}>{t("sets.missingCluster")}</option>}
            </select>
          </label>
          <label title={t("sets.fillHelp")}><span>{t("sets.fill")}</span>
            <select value={set.fill ?? ""} onChange={event => save({ ...set, fill: event.target.value === "ranked" ? "ranked" : undefined })}>
              <option value="">{t("sets.fillSpread")}</option><option value="ranked">{t("sets.fillRanked")}</option>
            </select>
          </label>
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
          if (!rows.length) return null;
          const placed = rows.reduce((sum, row) => sum + row.placed, 0);
          return short.length
            ? <p className="set-preview short">{tp("sets.previewShort", short.length)}: {short.slice(0, 4).map(row => t("sets.previewRow", { round: roundName(row.roundId), wanted: row.wanted, seats: row.seats })).join(" · ")}{short.length > 4 ? " …" : ""}. {t("sets.previewOverflow")}</p>
            : <p className="set-preview">{t("sets.previewOk", { people: placed, rounds: rows.length })}</p>;
        })()}
        </div>}
      </li>;
    })}</ol>
    <div className="set-templates">
      <small>{t("sets.add")}</small>
      {SET_TEMPLATES.map(template => <button key={template} type="button" className="plain" disabled={template === "cluster" && !segments.length} onClick={() => add(template)}>+ {t(keyOf("sets.templates", template))}</button>)}
    </div>
  </div>;
}
