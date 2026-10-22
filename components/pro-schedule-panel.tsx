"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { EventIcon } from "@/components/event-icon";
import { Hint } from "@/components/hint";
import { roundName, useEventName, useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import { addMinutes, clockOf, dayOf, fromMinutes, laneForItem, newItemId, newRoomId, newStageId, OTHER_KINDS, overlaps, roundIdOf, scheduleLanes, scheduleProblems, sortByTime, STAGE_COLORS, targetKey, toMinutes, type OtherKind, type ProActivity, type ProRoom, type ProRoundBlock, type ProSchedule, type ProStage, type ScheduleProblem } from "@/lib/pro/schedule";
import type { RoundConfig } from "@/lib/rounds";

const SCALE = 1.25;
const SNAP_MINUTES = 5;
const ATTEMPT_EVENTS = ["333mbf", "333fm"];

type Item = ({ type: "block" } & ProRoundBlock) | ({ type: "activity" } & ProActivity);
type DragMode = "move" | "start" | "end";
type DragGesture = { item: Item; preview: Item; mode: DragMode; clientY: number };

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
  const [dragging, setDragging] = useState(false);
  const [dragPreview, setDragPreview] = useState<Item>();
  const dragRef = useRef<DragGesture | undefined>(undefined);
  const { rooms, blocks, activities } = schedule;
  const lanes = useMemo(() => scheduleLanes(schedule), [schedule]);

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
  const updateRoom = (id: number, change: Partial<ProRoom>) => update({ rooms: rooms.map(room => room.id === id ? { ...room, ...change } : room) });
  const updateStage = (roomId: number, id: number, change: Partial<ProStage>) => update({ rooms: rooms.map(room => room.id === roomId ? { ...room, stages: room.stages.map(stage => stage.id === id ? { ...stage, ...change } : stage) } : room) });
  const updateItem = (item: Item, change: Partial<ProRoundBlock & ProActivity>) => {
    if (item.type === "block") {
      const invalidateExactGroups = "start" in change || "end" in change || "groups" in change;
      update({ blocks: sortByTime(blocks.map(block => block.id === item.id ? { ...block, ...pick(change, ["activityCode", "roomId", "stageId", "start", "end", "groups"]), ...(invalidateExactGroups ? { groupWindows: undefined } : {}) } : block)) });
    } else {
      update({ activities: sortByTime(activities.map(activity => activity.id === item.id ? { ...activity, ...pick(change, ["kind", "name", "roomId", "stageId", "start", "end"]) } : activity)) });
    }
  };
  const removeItem = (item: Item) => {
    setSelectedId(undefined);
    if (item.type === "block") update({ blocks: blocks.filter(block => block.id !== item.id) });
    else update({ activities: activities.filter(activity => activity.id !== item.id) });
  };

  function addRoom() {
    const id = newRoomId(rooms);
    update({ rooms: [...rooms, { id, name: t("schedule.newRoom", { number: rooms.length + 1 }), color: STAGE_COLORS[rooms.length % STAGE_COLORS.length], stages: [] }] });
  }

  function removeRoom(room: ProRoom) {
    const count = blocks.filter(block => block.roomId === room.id).length + activities.filter(activity => activity.roomId === room.id).length;
    if (count && !window.confirm(t("schedule.confirmRemoveRoom", { name: room.name, count }))) return;
    onChange({ ...schedule, rooms: rooms.filter(item => item.id !== room.id), blocks: blocks.filter(block => block.roomId !== room.id), activities: activities.filter(activity => activity.roomId !== room.id) });
  }

  function addStage(room: ProRoom) {
    const id = newStageId(rooms);
    updateRoom(room.id, { stages: [...room.stages, { id, name: t("schedule.newStage", { number: room.stages.length + 1 }), color: STAGE_COLORS[id % STAGE_COLORS.length] }] });
  }

  function removeStage(room: ProRoom, stage: ProStage) {
    const count = blocks.filter(block => block.roomId === room.id && block.stageId === stage.id).length + activities.filter(activity => activity.roomId === room.id && activity.stageId === stage.id).length;
    if (count && !window.confirm(t("schedule.confirmRemoveStage", { name: stage.name, count }))) return;
    onChange({ ...schedule, rooms: rooms.map(item => item.id === room.id ? { ...item, stages: item.stages.filter(candidate => candidate.id !== stage.id) } : item), blocks: blocks.filter(block => block.stageId !== stage.id), activities: activities.filter(activity => activity.stageId !== stage.id) });
  }

  function nextFreeTime(roomId: number, stageId?: number) {
    const key = targetKey(roomId, stageId);
    const ends = items.filter(item => laneForItem(schedule, item)?.key === key && dayOf(item.start) === day).map(item => item.end).sort();
    return ends.at(-1) ?? `${day}T10:00`;
  }

  function addBlock() {
    if (!lanes.length || !day) return;
    const scheduled = new Set(blocks.map(block => roundIdOf(block.activityCode)));
    const round = rounds.find(item => item.enabled && !scheduled.has(item.id)) ?? rounds[0];
    if (!round) return;
    const lane = lanes[0];
    const start = nextFreeTime(lane.roomId, lane.stageId);
    const block: ProRoundBlock = { id: newItemId("b", blocks), activityCode: ATTEMPT_EVENTS.includes(round.eventId) ? `${round.id}-a1` : round.id, roomId: lane.roomId, stageId: lane.stageId, start, end: addMinutes(start, 60), groups: round.groups };
    update({ blocks: sortByTime([...blocks, block]) });
    setSelectedId(block.id);
  }

  function addActivity() {
    if (!lanes.length || !day) return;
    const lane = lanes[0];
    const start = nextFreeTime(lane.roomId, lane.stageId);
    const activity: ProActivity = { id: newItemId("a", activities), kind: "lunch", name: t("schedule.kinds.lunch"), roomId: lane.roomId, stageId: lane.stageId, start, end: addMinutes(start, 60) };
    update({ activities: sortByTime([...activities, activity]) });
    setSelectedId(activity.id);
  }

  function copyToStages(block: ProRoundBlock) {
    const room = rooms.find(candidate => candidate.id === block.roomId);
    if (!room) return;
    const copies: ProRoundBlock[] = [];
    for (const stage of room.stages) {
      if (stage.id === block.stageId || blocks.some(other => other.roomId === room.id && other.stageId === stage.id && other.activityCode === block.activityCode && overlaps(other, block))) continue;
      copies.push({ ...block, id: newItemId("b", [...blocks, ...copies]), stageId: stage.id });
    }
    update({ blocks: sortByTime([...blocks, ...copies]) });
  }

  function startDrag(event: ReactPointerEvent, item: Item, mode: DragMode) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    dragRef.current = { item, preview: item, mode, clientY: event.clientY };
    setDragPreview(item);
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const gesture = dragRef.current;
      if (!gesture) return;
      const delta = Math.round((event.clientY - gesture.clientY) / SCALE / SNAP_MINUTES) * SNAP_MINUTES;
      let start = gesture.item.start;
      let end = gesture.item.end;
      if (gesture.mode === "move") {
        start = addMinutes(gesture.item.start, delta);
        end = addMinutes(gesture.item.end, delta);
      } else if (gesture.mode === "start") {
        start = fromMinutes(Math.min(toMinutes(gesture.item.end) - SNAP_MINUTES, toMinutes(gesture.item.start) + delta));
      } else {
        end = fromMinutes(Math.max(toMinutes(gesture.item.start) + SNAP_MINUTES, toMinutes(gesture.item.end) + delta));
      }
      let roomId = gesture.item.roomId;
      let stageId = gesture.item.stageId;
      if (gesture.mode === "move") {
        const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-schedule-lane]");
        if (element) {
          roomId = Number(element.dataset.roomId);
          stageId = element.dataset.stageId ? Number(element.dataset.stageId) : undefined;
        }
      }
      const preview = { ...gesture.item, roomId, stageId, start, end } as Item;
      gesture.preview = preview;
      setDragPreview(preview);
    };
    const finish = () => {
      const gesture = dragRef.current;
      if (gesture) updateItem(gesture.item, { roomId: gesture.preview.roomId, stageId: gesture.preview.stageId, start: gesture.preview.start, end: gesture.preview.end });
      dragRef.current = undefined;
      setDragPreview(undefined);
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleItems = items.map(item => dragPreview?.id === item.id ? dragPreview : item);
  const dayItems = visibleItems.filter(item => dayOf(item.start) === day);
  const minuteOfDay = (time: string) => toMinutes(time) - toMinutes(`${day}T00:00`);
  const from = Math.floor(Math.min(9 * 60, ...dayItems.map(item => minuteOfDay(item.start))) / 60) * 60;
  const to = Math.ceil(Math.max(19 * 60, ...dayItems.map(item => minuteOfDay(item.end))) / 60) * 60;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, index) => from + index * 60);
  const problemText = (problem: ScheduleProblem) => {
    const item = items.find(candidate => candidate.id === problem.itemId);
    const itemName = item ? item.type === "block" ? codeLabel(item.activityCode) : item.name : "";
    return t(keyOf("schedule.problems", problem.code), { item: itemName, round: problem.roundId ? roundName(problem.roundId, eventName, t) : itemName, other: problem.otherRoundId ? roundName(problem.otherRoundId, eventName, t) : "" });
  };
  const selectedRoom = selected && rooms.find(room => room.id === selected.roomId);
  const roomHeaders = rooms.map(room => ({ room, count: Math.max(1, lanes.filter(lane => lane.roomId === room.id).length) })).filter(header => lanes.some(lane => lane.roomId === header.room.id));

  return <section className={`pro-schedule ${dragging ? "is-dragging" : ""}`}>
    <div className="setup-heading pro-heading">
      <h2>{t("schedule.title")} <Hint align="start" text={t("schedule.hint")} /></h2>
      <button type="button" className="plain" onClick={() => { if (window.confirm(t("schedule.confirmReimport"))) { setSelectedId(undefined); onReimport(); } }}>{t("schedule.reimport")}</button>
    </div>

    <div className="room-bar" aria-label={t("schedule.rooms")}>
      {rooms.map(room => <div key={room.id} className="room-card">
        <div className="room-row">
          <label className="stage-color" style={{ background: room.color }} title={t("schedule.roomColor", { name: room.name })}><input type="color" value={room.color} onChange={event => updateRoom(room.id, { color: event.target.value })} aria-label={t("schedule.roomColor", { name: room.name })} /></label>
          <input value={room.name} onChange={event => updateRoom(room.id, { name: event.target.value })} aria-label={t("schedule.roomName")} />
          <button type="button" onClick={() => removeRoom(room)} aria-label={t("schedule.removeRoom", { name: room.name })} title={t("schedule.removeRoom", { name: room.name })}>×</button>
        </div>
        <div className="room-stages">
          {room.stages.map(stage => <div key={stage.id} className="stage-chip">
            <label className="stage-color" style={{ background: stage.color }} title={t("schedule.stageColor", { name: stage.name })}><input type="color" value={stage.color} onChange={event => updateStage(room.id, stage.id, { color: event.target.value })} aria-label={t("schedule.stageColor", { name: stage.name })} /></label>
            <input value={stage.name} onChange={event => updateStage(room.id, stage.id, { name: event.target.value })} aria-label={t("schedule.stageName")} size={Math.max(4, stage.name.length)} />
            <button type="button" onClick={() => removeStage(room, stage)} aria-label={t("schedule.removeStage", { name: stage.name })} title={t("schedule.removeStage", { name: stage.name })}>×</button>
          </div>)}
          <button type="button" className="stage-add" onClick={() => addStage(room)}>+ {t("schedule.addStage")}</button>
        </div>
      </div>)}
      <button type="button" className="room-add" onClick={addRoom}>+ {t("schedule.addRoom")}</button>
    </div>

    {problems.length > 0 && <ul className="schedule-problems">{problems.map((problem, index) => <li key={index} className={`issue-${problem.severity}`}><button type="button" disabled={!problem.itemId} onClick={() => { const item = items.find(candidate => candidate.id === problem.itemId); if (item) { setDay(dayOf(item.start)); setSelectedId(item.id); } }}>{problemText(problem)}</button></li>)}</ul>}

    <div className="schedule-toolbar">
      <div className="round-subtabs" role="tablist">{schedule.days.map(value => <button key={value} role="tab" aria-selected={day === value} className={day === value ? "active" : ""} onClick={() => setDay(value)}>{dayLabel(value)} <span>{items.filter(item => dayOf(item.start) === value).length}</span></button>)}</div>
      <span className="schedule-drag-hint">{t("schedule.dragHint")}</span>
      <div className="schedule-add"><button type="button" className="button secondary" onClick={addBlock} disabled={!lanes.length}>+ {t("schedule.addRound")}</button><button type="button" className="button secondary" onClick={addActivity} disabled={!lanes.length}>+ {t("schedule.addActivity")}</button></div>
    </div>

    <div className="schedule-body">
      <div className="timeline" style={{ gridTemplateColumns: `44px repeat(${Math.max(lanes.length, 1)}, minmax(130px, 1fr))` }}>
        <div className="timeline-corner" />
        {roomHeaders.map(({ room, count }) => <div key={room.id} className="timeline-room" style={{ gridColumn: `span ${count}`, borderColor: room.color }}>{room.name}</div>)}
        <div className="timeline-corner" />
        {lanes.map(lane => <div key={lane.key} className="timeline-stage" style={{ borderColor: lane.color }}>{rooms.find(room => room.id === lane.roomId)?.stages.length ? lane.name : t("schedule.wholeRoom")}</div>)}
        <div className="timeline-hours" style={{ height: (to - from) * SCALE }}>{hours.map(minute => <span key={minute} style={{ top: (minute - from) * SCALE }}>{String(minute / 60).padStart(2, "0")}:00</span>)}</div>
        {lanes.map(lane => {
          const own = sortByTime(dayItems.filter(item => laneForItem(schedule, item)?.key === lane.key));
          const laneEnds: string[] = [];
          const itemLane = new Map(own.map(item => {
            let index = laneEnds.findIndex(end => end <= item.start);
            if (index < 0) index = laneEnds.push(item.end) - 1;
            else laneEnds[index] = item.end;
            return [item.id, index];
          }));
          return <div key={lane.key} className="timeline-column" data-schedule-lane data-room-id={lane.roomId} data-stage-id={lane.stageId} style={{ height: (to - from) * SCALE, backgroundSize: `100% ${60 * SCALE}px`, backgroundPositionY: `${(Math.ceil(from / 60) * 60 - from) * SCALE}px` }}>
            {own.map(item => {
              const top = (minuteOfDay(item.start) - from) * SCALE;
              const height = Math.max(14, (toMinutes(item.end) - toMinutes(item.start)) * SCALE);
              const width = 100 / Math.max(laneEnds.length, 1);
              const roundId = item.type === "block" ? roundIdOf(item.activityCode) : undefined;
              return <button key={item.id} type="button" className={`timeline-item ${item.type} ${selectedId === item.id ? "selected" : ""} ${height < 34 ? "short" : ""} ${dragPreview?.id === item.id ? "drag-preview" : ""}`} style={{ top, height, left: `${itemLane.get(item.id)! * width}%`, width: `${width}%`, ["--stage" as string]: lane.color }} onPointerDown={event => startDrag(event, item, "move")} onClick={() => setSelectedId(item.id)} title={`${item.type === "block" ? codeLabel(item.activityCode) : item.name}\n${clockOf(item.start)}–${clockOf(item.end)}\n${t("schedule.dragTitle")}`}>
                <span className="resize-handle top" onPointerDown={event => startDrag(event, item, "start")} title={t("schedule.resizeStart")} />
                <span className="timeline-title">{roundId && <EventIcon eventId={roundId.split("-r")[0]} label="" />}{item.type === "block" ? shortCode(item.activityCode) : item.name}</span>
                <small>{clockOf(item.start)}–{clockOf(item.end)}{item.type === "block" && ` · ${t("schedule.groupsShort", { count: item.groups })}`}</small>
                {item.type === "block" && Array.from({ length: item.groups - 1 }, (_, index) => <i key={index} className="group-line" style={{ top: `${((index + 1) * 100) / item.groups}%` }} />)}
                <span className="resize-handle bottom" onPointerDown={event => startDrag(event, item, "end")} title={t("schedule.resizeEnd")} />
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
          <label><span>{t("schedule.room")}</span><select value={selected.roomId} onChange={event => { const room = rooms.find(candidate => candidate.id === Number(event.target.value)); updateItem(selected, { roomId: room!.id, stageId: selected.type === "block" ? room!.stages[0]?.id : undefined }); }}>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          {selectedRoom && selectedRoom.stages.length > 0 && <label><span>{t("schedule.stage")}</span><select value={selected.stageId ?? ""} onChange={event => updateItem(selected, { stageId: event.target.value ? Number(event.target.value) : undefined })}><option value="">{t("schedule.wholeRoom")}</option>{selectedRoom.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>}
          <label><span>{t("schedule.day")}</span><select value={dayOf(selected.start)} onChange={event => { const next = event.target.value; updateItem(selected, { start: `${next}T${clockOf(selected.start)}`, end: `${next}T${clockOf(selected.end)}` }); setDay(next); }}>{schedule.days.map(value => <option key={value} value={value}>{dayLabel(value)}</option>)}</select></label>
          <div className="editor-times">
            <label><span>{t("schedule.start")}</span><input type="time" step={300} value={clockOf(selected.start)} onChange={event => event.target.value && updateItem(selected, { start: `${dayOf(selected.start)}T${event.target.value}` })} /></label>
            <label><span>{t("schedule.end")}</span><input type="time" step={300} value={clockOf(selected.end)} onChange={event => event.target.value && updateItem(selected, { end: `${dayOf(selected.start)}T${event.target.value}` })} /></label>
          </div>
          {selected.type === "block" && <>
            <label><span>{t("schedule.groups")}</span><div className="number-field"><button type="button" aria-label={t("rounds.remove", { thing: t("schedule.groups") })} disabled={selected.groups <= 1} onClick={() => updateItem(selected, { groups: selected.groups - 1 })}>−</button><strong>{selected.groups}</strong><button type="button" aria-label={t("rounds.add", { thing: t("schedule.groups") })} onClick={() => updateItem(selected, { groups: selected.groups + 1 })}>+</button></div></label>
            {selected.end > selected.start && <small className="editor-note">{t("schedule.perGroup", { minutes: Math.round((toMinutes(selected.end) - toMinutes(selected.start)) / selected.groups) })}</small>}
            {(selectedRoom?.stages.length ?? 0) > 1 && <button type="button" className="button secondary" onClick={() => copyToStages(selected)}>{t("schedule.copyToStages")}</button>}
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
