"use client";

import { useMemo, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { Hint } from "@/components/hint";
import { roundName, useEventName, useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import { addMinutes, clockOf, dayOf, newItemId, newStageId, OTHER_KINDS, overlaps, roundIdOf, scheduleProblems, sortByTime, STAGE_COLORS, toMinutes, type OtherKind, type ProActivity, type ProRoundBlock, type ProSchedule, type ProStage, type ScheduleProblem } from "@/lib/pro/schedule";
import type { RoundConfig } from "@/lib/rounds";

/** Pixels per minute in the timeline. */
const SCALE = 1.25;
/** Events whose rounds are scheduled per attempt in the WCIF. */
const ATTEMPT_EVENTS = ["333mbf", "333fm"];

type Item = ({ type: "block" } & ProRoundBlock) | ({ type: "activity" } & ProActivity);

export function ProSchedulePanel({ schedule, rounds, onChange, onReimport }: {
  schedule: ProSchedule;
  rounds: RoundConfig[];
  onChange: (schedule: ProSchedule) => void;
  onReimport: () => void;
}) {
  const { t, locale } = useI18n();
  const eventName = useEventName();
  const [day, setDay] = useState(schedule.days[0] ?? "");
  const [selectedId, setSelectedId] = useState<string>();
  const { stages, blocks, activities } = schedule;

  const items: Item[] = useMemo(() => [...blocks.map(block => ({ type: "block" as const, ...block })), ...activities.map(activity => ({ type: "activity" as const, ...activity }))], [blocks, activities]);
  const selected = items.find(item => item.id === selectedId);
  const problems = useMemo(() => scheduleProblems(schedule, rounds.filter(round => round.enabled).map(round => round.id)), [schedule, rounds]);
  const roundCodes = useMemo(() => rounds.flatMap(round => ATTEMPT_EVENTS.includes(round.eventId) ? [1, 2, 3].map(attempt => `${round.id}-a${attempt}`) : [round.id]), [rounds]);

  const codeLabel = (activityCode: string) => {
    const roundId = roundIdOf(activityCode) ?? activityCode;
    const attempt = activityCode.match(/-a(\d+)$/)?.[1];
    return `${roundName(roundId, eventName, t)}${attempt ? ` · ${t("schedule.attempt", { number: attempt })}` : ""}`;
  };
  const shortCode = (activityCode: string) => {
    const roundId = roundIdOf(activityCode) ?? activityCode;
    const [eventId, number] = roundId.split("-r");
    const attempt = activityCode.match(/-a(\d+)$/)?.[1];
    return `${eventName(eventId)} R${number}${attempt ? ` A${attempt}` : ""}`;
  };
  const dayLabel = (value: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

  const update = (change: Partial<ProSchedule>) => onChange({ ...schedule, ...change });
  const updateStage = (id: number, change: Partial<ProStage>) => update({ stages: stages.map(stage => stage.id === id ? { ...stage, ...change } : stage) });
  const updateItem = (item: Item, change: Partial<ProRoundBlock & ProActivity>) => {
    if (item.type === "block") update({ blocks: sortByTime(blocks.map(block => block.id === item.id ? { ...block, ...pick(change, ["activityCode", "stageId", "start", "end", "groups"]) } : block)) });
    else update({ activities: sortByTime(activities.map(activity => activity.id === item.id ? { ...activity, ...pick(change, ["kind", "name", "stageId", "start", "end"]) } : activity)) });
  };
  const removeItem = (item: Item) => {
    setSelectedId(undefined);
    if (item.type === "block") update({ blocks: blocks.filter(block => block.id !== item.id) });
    else update({ activities: activities.filter(activity => activity.id !== item.id) });
  };

  function addStage() {
    const id = newStageId(stages);
    update({ stages: [...stages, { id, name: t("schedule.newStage", { number: stages.length + 1 }), color: STAGE_COLORS[stages.length % STAGE_COLORS.length] }] });
  }

  function removeStage(stage: ProStage) {
    const count = blocks.filter(block => block.stageId === stage.id).length + activities.filter(activity => activity.stageId === stage.id).length;
    if (count && !window.confirm(t("schedule.confirmRemoveStage", { name: stage.name, count }))) return;
    onChange({ ...schedule, stages: stages.filter(item => item.id !== stage.id), blocks: blocks.filter(block => block.stageId !== stage.id), activities: activities.filter(activity => activity.stageId !== stage.id) });
  }

  /** New items go after the last thing of the day in the first stage. */
  function nextFreeTime(stageId: number) {
    const ends = items.filter(item => item.stageId === stageId && dayOf(item.start) === day).map(item => item.end).sort();
    return ends.at(-1) ?? `${day}T10:00`;
  }

  function addBlock() {
    if (!stages.length || !day) return;
    const scheduled = new Set(blocks.map(block => roundIdOf(block.activityCode)));
    const round = rounds.find(item => item.enabled && !scheduled.has(item.id)) ?? rounds[0];
    if (!round) return;
    const stageId = stages[0].id;
    const start = nextFreeTime(stageId);
    const block: ProRoundBlock = { id: newItemId("b", blocks), activityCode: ATTEMPT_EVENTS.includes(round.eventId) ? `${round.id}-a1` : round.id, stageId, start, end: addMinutes(start, 60), groups: round.groups };
    update({ blocks: sortByTime([...blocks, block]) });
    setSelectedId(block.id);
  }

  function addActivity() {
    if (!stages.length || !day) return;
    const stageId = stages[0].id;
    const start = nextFreeTime(stageId);
    const activity: ProActivity = { id: newItemId("a", activities), kind: "lunch", name: t("schedule.kinds.lunch"), stageId, start, end: addMinutes(start, 60) };
    update({ activities: sortByTime([...activities, activity]) });
    setSelectedId(activity.id);
  }

  /** Same round at the same time in every other stage (CompScript's Map(AllStages(), CreateGroups(…))). */
  function copyToStages(block: ProRoundBlock) {
    const copies: ProRoundBlock[] = [];
    for (const stage of stages) {
      if (stage.id === block.stageId || blocks.some(other => other.stageId === stage.id && other.activityCode === block.activityCode && overlaps(other, block))) continue;
      copies.push({ ...block, id: newItemId("b", [...blocks, ...copies]), stageId: stage.id });
    }
    update({ blocks: sortByTime([...blocks, ...copies]) });
  }

  const dayItems = items.filter(item => dayOf(item.start) === day);
  const minuteOfDay = (time: string) => toMinutes(time) - toMinutes(`${day}T00:00`);
  const from = Math.floor(Math.min(9 * 60, ...dayItems.map(item => minuteOfDay(item.start))) / 60) * 60;
  const to = Math.ceil(Math.max(19 * 60, ...dayItems.map(item => minuteOfDay(item.end))) / 60) * 60;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, index) => from + index * 60);
  const problemText = (problem: ScheduleProblem) => {
    const item = items.find(candidate => candidate.id === problem.itemId);
    const itemName = item ? item.type === "block" ? codeLabel(item.activityCode) : item.name : "";
    return t(keyOf("schedule.problems", problem.code), { item: itemName, round: problem.roundId ? roundName(problem.roundId, eventName, t) : itemName, other: problem.otherRoundId ? roundName(problem.otherRoundId, eventName, t) : "" });
  };

  return <section className="pro-schedule">
    <div className="setup-heading pro-heading">
      <h2>{t("schedule.title")} <Hint align="start" text={t("schedule.hint")} /></h2>
      <button type="button" className="plain" onClick={() => { if (window.confirm(t("schedule.confirmReimport"))) { setSelectedId(undefined); onReimport(); } }}>{t("schedule.reimport")}</button>
    </div>

    <div className="stage-bar" aria-label={t("schedule.stages")}>
      {stages.map(stage => <div key={stage.id} className="stage-chip">
        <label className="stage-color" style={{ background: stage.color }} title={t("schedule.stageColor", { name: stage.name })}><input type="color" value={stage.color} onChange={event => updateStage(stage.id, { color: event.target.value })} aria-label={t("schedule.stageColor", { name: stage.name })} /></label>
        <input value={stage.name} onChange={event => updateStage(stage.id, { name: event.target.value })} aria-label={t("schedule.stageName")} size={Math.max(4, stage.name.length)} />
        <button type="button" onClick={() => removeStage(stage)} aria-label={t("schedule.removeStage", { name: stage.name })} title={t("schedule.removeStage", { name: stage.name })}>×</button>
      </div>)}
      <button type="button" className="stage-add" onClick={addStage}>+ {t("schedule.addStage")}</button>
    </div>

    {problems.length > 0 && <ul className="schedule-problems">{problems.map((problem, index) => <li key={index} className={`issue-${problem.severity}`}><button type="button" disabled={!problem.itemId} onClick={() => { const item = items.find(candidate => candidate.id === problem.itemId); if (item) { setDay(dayOf(item.start)); setSelectedId(item.id); } }}>{problemText(problem)}</button></li>)}</ul>}

    <div className="schedule-toolbar">
      <div className="round-subtabs" role="tablist">{schedule.days.map(value => <button key={value} role="tab" aria-selected={day === value} className={day === value ? "active" : ""} onClick={() => setDay(value)}>{dayLabel(value)} <span>{items.filter(item => dayOf(item.start) === value).length}</span></button>)}</div>
      <div className="schedule-add"><button type="button" className="button secondary" onClick={addBlock} disabled={!stages.length}>+ {t("schedule.addRound")}</button><button type="button" className="button secondary" onClick={addActivity} disabled={!stages.length}>+ {t("schedule.addActivity")}</button></div>
    </div>

    <div className="schedule-body">
      <div className="timeline" style={{ gridTemplateColumns: `44px repeat(${Math.max(stages.length, 1)}, minmax(130px, 1fr))` }}>
        <div className="timeline-corner" />
        {stages.map(stage => <div key={stage.id} className="timeline-stage" style={{ borderColor: stage.color }}>{stage.name}</div>)}
        <div className="timeline-hours" style={{ height: (to - from) * SCALE }}>{hours.map(minute => <span key={minute} style={{ top: (minute - from) * SCALE }}>{String(minute / 60).padStart(2, "0")}:00</span>)}</div>
        {stages.map(stage => {
          const own = sortByTime(dayItems.filter(item => item.stageId === stage.id));
          const lanes: string[] = [];
          const lane = new Map(own.map(item => {
            let index = lanes.findIndex(end => end <= item.start);
            if (index < 0) index = lanes.push(item.end) - 1;
            else lanes[index] = item.end;
            return [item.id, index];
          }));
          return <div key={stage.id} className="timeline-column" style={{ height: (to - from) * SCALE, backgroundSize: `100% ${60 * SCALE}px`, backgroundPositionY: `${(Math.ceil(from / 60) * 60 - from) * SCALE}px` }}>
            {own.map(item => {
              const top = (minuteOfDay(item.start) - from) * SCALE;
              const height = Math.max(14, (toMinutes(item.end) - toMinutes(item.start)) * SCALE);
              const width = 100 / Math.max(lanes.length, 1);
              const roundId = item.type === "block" ? roundIdOf(item.activityCode) : undefined;
              return <button key={item.id} type="button" className={`timeline-item ${item.type} ${selectedId === item.id ? "selected" : ""} ${height < 34 ? "short" : ""}`} style={{ top, height, left: `${lane.get(item.id)! * width}%`, width: `${width}%`, ["--stage" as string]: stage.color }} onClick={() => setSelectedId(item.id)} title={`${item.type === "block" ? codeLabel(item.activityCode) : item.name}\n${clockOf(item.start)}–${clockOf(item.end)}`}>
                <span className="timeline-title">{roundId && <EventIcon eventId={roundId.split("-r")[0]} label="" />}{item.type === "block" ? shortCode(item.activityCode) : item.name}</span>
                <small>{clockOf(item.start)}–{clockOf(item.end)}{item.type === "block" && ` · ${t("schedule.groupsShort", { count: item.groups })}`}</small>
                {item.type === "block" && Array.from({ length: item.groups - 1 }, (_, index) => <i key={index} className="group-line" style={{ top: `${((index + 1) * 100) / item.groups}%` }} />)}
              </button>;
            })}
          </div>;
        })}
        {dayItems.length === 0 && <p className="timeline-empty">{t("schedule.emptyDay")}</p>}
      </div>

      <aside className="schedule-editor">
        {!selected ? <p className="setup-note">{t("schedule.selectHint")}</p> : <>
          <h3>{selected.type === "block" ? t("schedule.round") : t("schedule.activity")}</h3>
          {selected.type === "block"
            ? <label><span>{t("schedule.round")}</span><select value={selected.activityCode} onChange={event => updateItem(selected, { activityCode: event.target.value })}>{[...new Set([...roundCodes, selected.activityCode])].map(code => <option key={code} value={code}>{codeLabel(code)}</option>)}</select></label>
            : <>
              <label><span>{t("schedule.kind")}</span><select value={selected.kind} onChange={event => { const kind = event.target.value as OtherKind; updateItem(selected, { kind, name: selected.name === t(keyOf("schedule.kinds", selected.kind)) ? t(keyOf("schedule.kinds", kind)) : selected.name }); }}>{OTHER_KINDS.map(kind => <option key={kind} value={kind}>{t(keyOf("schedule.kinds", kind))}</option>)}</select></label>
              <label><span>{t("schedule.name")}</span><input value={selected.name} onChange={event => updateItem(selected, { name: event.target.value })} /></label>
            </>}
          <label><span>{t("schedule.stage")}</span><select value={selected.stageId} onChange={event => updateItem(selected, { stageId: Number(event.target.value) })}>{stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
          <label><span>{t("schedule.day")}</span><select value={dayOf(selected.start)} onChange={event => { const next = event.target.value; updateItem(selected, { start: `${next}T${clockOf(selected.start)}`, end: `${next}T${clockOf(selected.end)}` }); setDay(next); }}>{schedule.days.map(value => <option key={value} value={value}>{dayLabel(value)}</option>)}</select></label>
          <div className="editor-times">
            <label><span>{t("schedule.start")}</span><input type="time" step={300} value={clockOf(selected.start)} onChange={event => event.target.value && updateItem(selected, { start: `${dayOf(selected.start)}T${event.target.value}` })} /></label>
            <label><span>{t("schedule.end")}</span><input type="time" step={300} value={clockOf(selected.end)} onChange={event => event.target.value && updateItem(selected, { end: `${dayOf(selected.start)}T${event.target.value}` })} /></label>
          </div>
          {selected.type === "block" && <>
            <label><span>{t("schedule.groups")}</span><div className="number-field"><button type="button" aria-label={t("rounds.remove", { thing: t("schedule.groups") })} disabled={selected.groups <= 1} onClick={() => updateItem(selected, { groups: selected.groups - 1 })}>−</button><strong>{selected.groups}</strong><button type="button" aria-label={t("rounds.add", { thing: t("schedule.groups") })} onClick={() => updateItem(selected, { groups: selected.groups + 1 })}>+</button></div></label>
            {selected.end > selected.start && <small className="editor-note">{t("schedule.perGroup", { minutes: Math.round((toMinutes(selected.end) - toMinutes(selected.start)) / selected.groups) })}</small>}
            {stages.length > 1 && <button type="button" className="button secondary" onClick={() => copyToStages(selected)}>{t("schedule.copyToStages")}</button>}
          </>}
          <button type="button" className="plain danger" onClick={() => removeItem(selected)}>{t("schedule.remove")}</button>
        </>}
      </aside>
    </div>
  </section>;
}

function pick<T extends object>(source: T, keys: Array<keyof T>): Partial<T> {
  return Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]])) as Partial<T>;
}
