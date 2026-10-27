"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { useEventName, useI18n, useIssueText, useWhyText } from "@/components/i18n";
import { PersonCard } from "@/components/person-card";
import { NewcomerBadge, PersonAvatar } from "@/components/person-badges";
import { whyOf, applyCells, cellValue, competingGroup, setStation, duties, DUTY_ROLES, type DutyRole, dutyLoads, groupTotals, normalizeAssignments, TASK_CODES, usedGroupCount, type CellRef, type CellValue, type GeneratedAssignment, type TaskRole } from "@/lib/assignments";
import type { WcifPerson } from "@/lib/competition-store";
import { keyOf } from "@/lib/i18n";
import { judgesNeeded, personKey, seedResult } from "@/lib/rounds";
import type { Unavailability } from "@/lib/pro/people";
import { clockOf, isWholeRoomTask, targetKey, type GroupSlot, type ProRoom } from "@/lib/pro/schedule";
import { byName } from "@/lib/people";
import { formatResult } from "@/lib/results";
import { countBySeverity, groupLimits, SEVERITY_ORDER, validateAvailability, validateRound, validateTimes, type Issue, type IssueSeverity, type RoundRules } from "@/lib/validation";

type Tool = CellValue | "select";
type History = { past: GeneratedAssignment[][]; present: GeneratedAssignment[]; future: GeneratedAssignment[][] };
type HistoryAction = { type: "commit"; next: GeneratedAssignment[] } | { type: "undo" } | { type: "redo" };

const HISTORY_LIMIT = 200;

/** Built-in filters, or `segment:<id>` for a PRO segment. */
type RowFilter = "all" | "issues" | "scramblers" | "newcomers" | "staff-only" | `segment:${string}`;
type RowSort = "seed" | "name" | "group" | "load";
const FILTERS: RowFilter[] = ["all", "issues", "scramblers", "newcomers", "staff-only"];
const SORTS: RowSort[] = ["seed", "name", "group", "load"];
const VALUES: CellValue[] = ["competitor", "judge", "scrambler", "runner", "delegate", "stagelead", "announcer", "dataentry", "other", ""];
const HOTKEY_LABELS: Record<CellValue, string> = { "": "0", competitor: "C", judge: "J", scrambler: "S", runner: "R", delegate: "D", stagelead: "L", announcer: "A", dataentry: "E", other: "O" };
const HOTKEYS: Record<string, CellValue> = { c: "competitor", j: "judge", m: "scrambler", s: "scrambler", r: "runner", d: "delegate", l: "stagelead", a: "announcer", e: "dataentry", o: "other", "0": "", delete: "", backspace: "" };
/** Extra roles only appear in the group totals when someone has them or the rules require them. */
const EXTRA_ROLES: TaskRole[] = ["delegate", "stagelead", "announcer", "dataentry", "other"];

function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "commit") return { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: action.next, future: [] };
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
  }
  if (!state.future.length) return state;
  return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
}

const cellKey = (id: string, group: number) => `${id}|${group}`;

function refFromKey(key: string): CellRef {
  const split = key.lastIndexOf("|");
  return { id: key.slice(0, split), group: Number(key.slice(split + 1)) };
}

function worstSeverity(issues: Issue[] | undefined) {
  return issues?.reduce<IssueSeverity | undefined>((worst, issue) => !worst || SEVERITY_ORDER[issue.severity] < SEVERITY_ORDER[worst] ? issue.severity : worst, undefined);
}

function ageFromBirthdate(birthdate?: string) {
  if (!birthdate) return "—";
  const birth = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}


function fallbackRules(rows: GeneratedAssignment[]): RoundRules {
  return { groups: Math.max(1, usedGroupCount(rows)), scramblers: 0, runners: 0, stations: Number.MAX_SAFE_INTEGER, fixedStations: false, checkJudges: false, checkDelegates: false, checkDataEntry: false, noNormalTasks: new Set() };
}

/** Stable default, so validation is not redone on every render. */
const NO_UNAVAILABILITY: Unavailability[] = [];
const NO_SEGMENTS: SegmentFilter[] = [];
const NO_PEOPLE: WcifPerson[] = [];
const NO_ROUNDS = new Set<string>();

export type SegmentFilter = { id: string; name: string; members: Set<string> };

/** Multi-blind columns are "G1 A1", "G1 A2"…: the attempt of a column, or nothing in rounds without attempts. */
function attemptNumber(roundSlots: GroupSlot[], slot: GroupSlot) {
  return slot.attempt ?? (roundSlots.some(item => item.linkedTo === slot.group) ? 1 : undefined);
}

export function GroupReview({ pastRounds = NO_ROUNDS, everyone = NO_PEOPLE, unavailable = NO_UNAVAILABILITY, segmentFilters = NO_SEGMENTS,  initialAssignments, rules, roomName, onChange, photos, showPhotos, onShowPhotosChange, roleLabels, slots, rooms }: {
  initialAssignments: GeneratedAssignment[];
  /** WCA profile thumbnails by person. */
  photos: Record<string, string | undefined>;
  showPhotos: boolean;
  onShowPhotosChange: (show: boolean) => void;
  /** Role names per person, for the person card. */
  roleLabels: Record<string, string[]>;
  rules: Record<string, RoundRules>;
  roomName?: string;
  /** PRO mode: stage and times of every group, which also enables the time-overlap check. */
  slots?: Map<string, GroupSlot[]>;
  rooms?: ProRoom[];
  /** PRO mode: people's unavailabilities, checked against what they are given. */
  unavailable?: Unavailability[];
  /** PRO mode: segments offered as row filters. */
  segmentFilters?: SegmentFilter[];
  /** Rounds already held (with results): listed after the ones still to review, apart. */
  pastRounds?: Set<string>;
  /** Everyone who can be given a task (registered people, staff and volunteers): all are listed in every round. */
  everyone?: WcifPerson[];
  onChange: (assignments: GeneratedAssignment[]) => void;
}) {
  const { t, tp } = useI18n();
  const eventName = useEventName();
  const laneByKey = useMemo(() => new Map((rooms ?? []).flatMap(room => [
    [targetKey(room.id), { name: room.name, color: room.color }] as const,
    ...room.stages.map(stage => [targetKey(room.id, stage.id), { name: stage.name, color: stage.color }] as const),
  ])), [rooms]);
  /** PRO mode: "1 Araba" for the column of Araba's first group; parallel stages share the number. */
  const groupLabel = useCallback((round: string, group: number) => {
    const slot = slots?.get(round)?.find(item => item.group === group);
    if (!slot) return String(group);
    const lanes = new Set(slots!.get(round)!.map(item => targetKey(item.roomId, item.stageId)));
    const lane = laneByKey.get(targetKey(slot.roomId, slot.stageId));
    const number = attemptNumber(slots!.get(round)!, slot);
    const attempt = number ? ` ${t("review.attempt", { number })}` : "";
    return (lanes.size > 1 && lane ? `${slot.number} ${lane.name}` : String(slot.number)) + attempt;
  }, [slots, laneByKey, t]);
  const issueText = useIssueText(groupLabel);
  const whyText = useWhyText();
  const taskLabel = (value: CellValue) => value ? t(keyOf("tasks", value)) : t("tasks.empty");
  const severityCount = (severity: IssueSeverity, count: number) => severity === "error" ? tp("review.errors", count) : tp("review.warnings", count);
  const [history, dispatch] = useReducer(historyReducer, initialAssignments, initial => ({ past: [], present: normalizeAssignments(initial), future: [] }));
  const assignments = history.present;
  // Rounds already held first (hidden until asked for), then the ones still to be held.
  const rounds = useMemo(() => {
    const all = Array.from(new Map(initialAssignments.map(item => [item.roundId, { id: item.roundId, eventId: item.eventId }])).values());
    return [...all.filter(round => pastRounds.has(round.id)), ...all.filter(round => !pastRounds.has(round.id))];
  }, [initialAssignments, pastRounds]);
  const pastCount = rounds.filter(round => pastRounds.has(round.id)).length;
  const [showPast, setShowPast] = useState(false);
  // Open on the first round still to be held: that is what needs reviewing.
  const [roundId, setRoundId] = useState((rounds.find(round => !pastRounds.has(round.id)) ?? rounds[0])?.id ?? "");
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<CellRef>();
  const [cursor, setCursor] = useState<CellRef>();
  const [focusRequest, setFocusRequest] = useState(0);
  const [status, setStatus] = useState("");
  /** Severity whose list is open, from a click on its count. */
  const [openSeverity, setOpenSeverity] = useState<IssueSeverity>();
  const [showHelp, setShowHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RowFilter>("all");
  const [sortBy, setSortBy] = useState<RowSort>("seed");
  /** PRO with several stages: columns in time order (G1 of every stage together) or stage by stage. */
  const [columnOrder, setColumnOrder] = useState<"group" | "stage">("group");
  const [cardPersonId, setCardPersonId] = useState<string>();
  /** Station being typed into a competitor cell. */
  const [stationEdit, setStationEdit] = useState<{ id: string; group: number; value: string }>();
  // Enter and the blur that follows must not save twice.
  const stationEditOpen = useRef(false);
  const dragging = useRef(false);
  const finishDrag = useRef(() => {});
  const matrixRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onChange(assignments); }, [assignments]); // eslint-disable-line react-hooks/exhaustive-deps

  const issuesByRound = useMemo(() => {
    const timeIssues = slots ? [...validateTimes(assignments, slots), ...validateAvailability(assignments, slots, unavailable)] : [];
    return new Map(rounds.map(round => {
      const rows = assignments.filter(item => item.roundId === round.id);
      const issues = [...validateRound(round.id, rows, rules[round.id] ?? fallbackRules(rows)), ...timeIssues.filter(issue => issue.roundId === round.id)];
      return [round.id, issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.group ?? 0) - (b.group ?? 0))];
    }));
  }, [assignments, rounds, rules, slots, unavailable]);
  const roundSlots = slots?.get(roundId);

  // People in the round first, by seed; staff who only work in this round after them, by name.
  const loads = useMemo(() => dutyLoads(assignments), [assignments]);
  /** Duties per person and role across every round, for the totals column. */
  const roleTotals = useMemo(() => {
    const totals = new Map<string, Partial<Record<DutyRole, number>>>();
    for (const item of assignments) {
      const counts = totals.get(item.personId) ?? {};
      for (const duty of duties(item)) counts[duty.role] = (counts[duty.role] ?? 0) + 1;
      totals.set(item.personId, counts);
    }
    return totals;
  }, [assignments]);
  /**
   * Everyone without a row in this round, as empty rows at the bottom, so anyone can be given a
   * task. They are not stored: a row is kept only once it has a task.
   */
  const virtualRows = useMemo(() => {
    const round = rounds.find(item => item.id === roundId);
    if (!round) return [];
    const here = new Set(assignments.filter(item => item.roundId === roundId).map(item => item.personId));
    return everyone.filter(person => !here.has(personKey(person))).map((person): GeneratedAssignment => {
      const key = personKey(person);
      return { id: `${roundId}:${key}`, roundId, eventId: round.eventId, personId: key, name: person.name, wcaId: person.wcaId, birthdate: person.birthdate, seedResult: seedResult(person, round.eventId), inRound: false, tasks: [] };
    });
  }, [assignments, everyone, rounds, roundId]);
  const virtualIds = useMemo(() => new Set(virtualRows.map(item => item.id)), [virtualRows]);
  const roundRows = useMemo(() => [...assignments.filter(item => item.roundId === roundId), ...virtualRows], [assignments, roundId, virtualRows]);
  // People in the round first; staff who only work in this round after them.
  const visible = useMemo(() => {
    const withIssues = new Set((issuesByRound.get(roundId) ?? []).map(issue => issue.assignmentId));
    const needle = query.trim().toLowerCase();
    const keep = (item: GeneratedAssignment) => {
      if (needle && !`${item.name} ${item.wcaId ?? ""}`.toLowerCase().includes(needle)) return false;
      if (filter === "issues") return withIssues.has(item.id);
      if (filter === "scramblers") return duties(item).some(duty => duty.role === "scrambler");
      if (filter === "newcomers") return !item.wcaId;
      if (filter === "staff-only") return !item.inRound && item.tasks.length > 0;
      if (filter.startsWith("segment:")) return !!segmentFilters.find(segment => `segment:${segment.id}` === filter)?.members.has(item.personId);
      return true;
    };
    // Later rounds: the place in the previous round, as the groups and scorecards follow it.
    const bySeed = (a: GeneratedAssignment, b: GeneratedAssignment) => (a.roundRank ?? Number.MAX_SAFE_INTEGER) - (b.roundRank ?? Number.MAX_SAFE_INTEGER) || (a.seedResult ?? Number.MAX_SAFE_INTEGER) - (b.seedResult ?? Number.MAX_SAFE_INTEGER);
    const order: Record<RowSort, (a: GeneratedAssignment, b: GeneratedAssignment) => number> = {
      // After the round's competitors: those eliminated in the previous round by place, then everyone
      // else, those with an official result in the event first (by it), then A to Z.
      seed: (a, b) => Number(b.inRound) - Number(a.inRound) || (a.inRound ? bySeed(a, b) : (a.roundRank ?? Number.MAX_SAFE_INTEGER) - (b.roundRank ?? Number.MAX_SAFE_INTEGER) || (a.seedResult ?? Number.MAX_SAFE_INTEGER) - (b.seedResult ?? Number.MAX_SAFE_INTEGER)),
      name: () => 0,
      group: (a, b) => (competingGroup(a) ?? Number.MAX_SAFE_INTEGER) - (competingGroup(b) ?? Number.MAX_SAFE_INTEGER) || bySeed(a, b),
      load: (a, b) => (loads.get(b.personId) ?? 0) - (loads.get(a.personId) ?? 0),
    };
    // Searching for someone always lists the matches A to Z by name.
    return roundRows.filter(keep).sort((a, b) => (needle ? 0 : order[sortBy](a, b)) || byName(a, b));
  }, [roundRows, issuesByRound, roundId, query, filter, sortBy, loads, segmentFilters]);
  const rowIndex = useMemo(() => new Map(visible.map((item, index) => [item.id, index])), [visible]);
  const currentRules = rules[roundId] ?? fallbackRules(visible);
  // Group totals count the whole round, whatever the filter or search shows.
  const groupCount = Math.max(currentRules.groups, usedGroupCount(roundRows), 1);
  const totals = groupTotals(roundRows, groupCount);
  const laneOrder = useMemo(() => new Map([...laneByKey.keys()].map((key, index) => [key, index])), [laneByKey]);
  const slotOf = (group: number) => roundSlots?.find(item => item.group === group);
  const laneKeyOf = (group: number) => { const slot = slotOf(group); return slot ? targetKey(slot.roomId, slot.stageId) : undefined; };
  const severalLanes = new Set(roundSlots?.map(slot => targetKey(slot.roomId, slot.stageId))).size > 1;
  /** Matrix columns (group numbers) in display order. */
  const columns = (() => {
    const all = Array.from({ length: groupCount }, (_, index) => index + 1);
    if (!severalLanes || columnOrder === "group") return all;
    const position = (group: number) => laneOrder.get(laneKeyOf(group) ?? "") ?? Number.MAX_SAFE_INTEGER;
    return [...all].sort((a, b) => position(a) - position(b) || a - b);
  })();
  // A thick border where a new block starts: a new group number, or a new stage.
  const startsBlock = (index: number) => {
    if (!severalLanes || index === 0) return false;
    const [previous, current] = [columns[index - 1], columns[index]];
    return columnOrder === "group" ? slotOf(previous)?.number !== slotOf(current)?.number : laneKeyOf(previous) !== laneKeyOf(current);
  };
  const extraRoles = EXTRA_ROLES.filter(role => totals.some(total => total.counts[role] > 0) || (role === "delegate" && currentRules.checkDelegates) || (role === "dataentry" && currentRules.checkDataEntry));
  const selected = useMemo(() => new Set(selection), [selection]);
  const currentRound = rounds.find(round => round.id === roundId);
  /** Later rounds show the result in the previous round instead of the official personal best. */
  const laterRound = !/-r1$/.test(roundId);
  const issues = issuesByRound.get(roundId) ?? [];
  const counts = countBySeverity(issues);
  const issueIndex = useMemo(() => {
    const cells = new Map<string, Issue[]>();
    const rows = new Map<string, Issue[]>();
    const groups = new Map<number, Issue[]>();
    const push = <K,>(map: Map<K, Issue[]>, key: K, issue: Issue) => map.set(key, [...(map.get(key) ?? []), issue]);
    for (const issue of issues) {
      if (issue.assignmentId) {
        push(rows, issue.assignmentId, issue);
        if (issue.group !== undefined) push(cells, cellKey(issue.assignmentId, issue.group), issue);
      } else if (issue.group !== undefined) push(groups, issue.group, issue);
    }
    return { cells, rows, groups };
  }, [issues]);

  function rectKeys(from: CellRef, to: CellRef) {
    const a = rowIndex.get(from.id) ?? 0;
    const b = rowIndex.get(to.id) ?? 0;
    const keys: string[] = [];
    for (let row = Math.min(a, b); row <= Math.max(a, b); row += 1) {
      const [x, y] = [columns.indexOf(from.group), columns.indexOf(to.group)];
      for (let position = Math.min(x, y); position <= Math.max(x, y); position += 1) keys.push(cellKey(visible[row].id, columns[position]));
    }
    return keys;
  }

  function selectSingle(cell: CellRef) {
    setAnchor(cell);
    setCursor(cell);
    setSelection([cellKey(cell.id, cell.group)]);
  }

  function selectColumn(group: number) {
    if (!visible.length) return;
    const first = { id: visible[0].id, group };
    setAnchor(first);
    setCursor(first);
    setSelection(rectKeys(first, { id: visible[visible.length - 1].id, group }));
  }

  function clearSelection() {
    setSelection([]);
    setAnchor(undefined);
  }

  function apply(value: CellValue, keys = selection) {
    if (!keys.length) return;
    const result = applyCells([...assignments, ...virtualRows], keys.map(refFromKey), value, { stations: currentRules.stations, fixedStations: currentRules.fixedStations });
    // Listed-only rows are kept once they have a task.
    if (result.changed) dispatch({ type: "commit", next: result.assignments.filter(item => !virtualIds.has(item.id) || item.tasks.length > 0) });
    setStatus(!result.changed ? t("review.statusNoChange") : tp("review.statusUpdated", result.changed, { label: value ? t(keyOf("tasks", value)) : t("review.statusCleared") }));
  }

  function startStationEdit(cell: CellRef, initial?: string) {
    const item = visible.find(row => row.id === cell.id);
    if (!item || cellValue(item, cell.group) !== "competitor") return false;
    selectSingle(cell);
    stationEditOpen.current = true;
    setStationEdit({ ...cell, value: initial ?? (item.station ? String(item.station) : "") });
    return true;
  }

  function finishStationEdit(save: boolean) {
    if (!stationEdit || !stationEditOpen.current) return;
    stationEditOpen.current = false;
    const edit = stationEdit;
    setStationEdit(undefined);
    setFocusRequest(request => request + 1);
    if (!save) return;
    const station = edit.value.trim() === "" ? undefined : Number(edit.value);
    if (station !== undefined && (!Number.isInteger(station) || station < 1)) {
      setStatus(t("review.statusStationInvalid"));
      return;
    }
    const next = setStation(assignments, edit.id, station);
    if (next === assignments) return;
    dispatch({ type: "commit", next });
    const name = assignments.find(item => item.id === edit.id)?.name ?? "";
    setStatus(station ? t("review.statusStationSet", { station, name }) : t("review.statusStationCleared", { name }));
  }

  function undo() {
    if (!history.past.length) return;
    dispatch({ type: "undo" });
    setStatus(t("review.statusUndone"));
  }

  function redo() {
    if (!history.future.length) return;
    dispatch({ type: "redo" });
    setStatus(t("review.statusRedone"));
  }

  function changeRound(id: string) {
    setRoundId(id);
    clearSelection();
    setCursor(undefined);
    setStatus("");
  }

  useLayoutEffect(() => {
    finishDrag.current = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (tool !== "select") apply(tool);
    };
  });

  useEffect(() => {
    const onMouseUp = () => finishDrag.current();
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  useEffect(() => {
    if (!cursor || !focusRequest) return;
    matrixRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${CSS.escape(cellKey(cursor.id, cursor.group))}"]`)?.focus();
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMouseDown(event: React.MouseEvent<HTMLButtonElement>, cell: CellRef) {
    if (event.button !== 0) return;
    // Keeps the browser from selecting text while dragging; focus is moved by hand instead.
    event.preventDefault();
    event.currentTarget.focus();
    setCursor(cell);
    if (event.shiftKey && anchor) {
      setSelection(rectKeys(anchor, cell));
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const key = cellKey(cell.id, cell.group);
      setAnchor(cell);
      setSelection(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
      return;
    }
    selectSingle(cell);
    dragging.current = true;
  }

  function handleMouseEnter(cell: CellRef) {
    if (!dragging.current || !anchor) return;
    setCursor(cell);
    setSelection(rectKeys(anchor, cell));
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
      event.preventDefault();
      if (key === "y" || event.shiftKey) redo(); else undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === "escape") {
      clearSelection();
      return;
    }
    // Typing a number on a competitor cell edits its station; 0 keeps clearing cells.
    if (/^[1-9]$/.test(key) && cursor && startStationEdit(cursor, key)) {
      event.preventDefault();
      return;
    }
    if (HOTKEYS[key] !== undefined) {
      if (!selection.length) return;
      event.preventDefault();
      apply(HOTKEYS[key]);
      return;
    }
    if (!visible.length || !["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
    event.preventDefault();
    const from = cursor ?? { id: visible[0].id, group: 1 };
    const row = rowIndex.get(from.id) ?? 0;
    const next = {
      id: visible[key === "arrowup" ? Math.max(0, row - 1) : key === "arrowdown" ? Math.min(visible.length - 1, row + 1) : row].id,
      group: key === "arrowleft" ? columns[Math.max(0, columns.indexOf(from.group) - 1)] : key === "arrowright" ? columns[Math.min(columns.length - 1, columns.indexOf(from.group) + 1)] : from.group,
    };
    if (event.shiftKey) {
      setCursor(next);
      setSelection(rectKeys(anchor ?? from, next));
      if (!anchor) setAnchor(from);
    } else {
      selectSingle(next);
    }
    setFocusRequest(request => request + 1);
  }

  function focusIssue(issue: Issue) {
    if (issue.assignmentId) {
      const group = issue.group !== undefined && issue.group >= 1 ? issue.group : 1;
      selectSingle({ id: issue.assignmentId, group });
      setFocusRequest(request => request + 1);
    } else if (issue.group !== undefined) {
      selectColumn(issue.group);
    }
  }

  const tabbable = cursor ?? (visible[0] ? { id: visible[0].id, group: 1 } : undefined);

  return <section className="review-panel matrix-review" id="review" onKeyDown={handleKeyDown}>

    <div className="round-tabs" role="tablist" aria-label={t("review.roundTabs")}>
      {pastCount > 0 && <button type="button" className="round-tabs-divider toggle" aria-expanded={showPast} onClick={() => {
        // Hiding the round on screen moves to the first one still to be held.
        if (showPast && pastRounds.has(roundId)) { const next = rounds.find(round => !pastRounds.has(round.id)); if (next) changeRound(next.id); }
        setShowPast(!showPast);
      }}>{showPast ? "▾" : "▸"} {t("review.pastRounds")} ({pastCount})</button>}
      {rounds.filter(round => showPast || !pastRounds.has(round.id) || round.id === roundId).map((round, index, shown) => {
      const roundIssues = issuesByRound.get(round.id) ?? [];
      const worst = worstSeverity(roundIssues);
      const firstUpcoming = pastCount > 0 && !pastRounds.has(round.id) && (index === 0 || pastRounds.has(shown[index - 1].id));
      return <Fragment key={round.id}>{firstUpcoming && showPast && <span className="round-tabs-divider">{t("review.upcomingRounds")}</span>}<button role="tab" aria-selected={roundId === round.id} className={roundId === round.id ? "active" : ""} onClick={() => changeRound(round.id)} title={`${eventName(round.eventId)} · ${round.id}`}><EventIcon eventId={round.eventId} label={eventName(round.eventId)} /><span>{eventName(round.eventId)}<small>{t("rounds.roundNumber", { number: round.id.split("-r").at(-1) ?? "" })}</small></span>{worst && <em className={`tab-issues ${worst}`} title={tp("review.problems", roundIssues.length)}>{roundIssues.length}</em>}</button></Fragment>;
    })}</div>

    <div className="matrix-toolbar">
      <div className="tool-group" role="radiogroup" aria-label={t("review.toolGroup")}><strong>{t("review.click")}</strong>
        <button role="radio" aria-checked={tool === "select"} className={`select ${tool === "select" ? "active" : ""}`} onClick={() => setTool("select")}>{t("review.select")}</button>
        <span className="tool-chips">{VALUES.map(value => {
          const label = value ? t(keyOf("tasks", value)) : t("tasks.clear");
          const description = t("review.toolKey", { label, key: HOTKEY_LABELS[value] });
          return <button key={value || "empty"} role="radio" aria-checked={tool === value} aria-label={description} title={description} className={`tool-chip cell-chip ${value || "empty"} ${tool === value ? "active" : ""}`} onClick={() => setTool(value)}>{value ? TASK_CODES[value] : "∅"}</button>;
        })}</span>
        <span className="tool-current">{tool === "select" ? "" : tool ? t(keyOf("tasks", tool)) : t("tasks.clear")}</span>
      </div>
      <div className="history-actions">
        <label className="photo-toggle compact" title={t("review.photosHelp")}><input type="checkbox" checked={showPhotos} onChange={event => onShowPhotosChange(event.target.checked)} /> {t("review.photos")}</label>
        <span className="help-anchor">
          <button type="button" aria-expanded={showHelp} onClick={() => setShowHelp(value => !value)}>{t("review.help")}</button>
          {showHelp && <div className="help-pop" role="dialog" aria-label={t("review.helpTitle")}>
            <dl>
              <dt>{t("review.helpSelect")}</dt><dd>{t("review.helpSelectText")}</dd>
              <dt>{t("review.helpAssign")}</dt><dd>{t("review.helpAssignText")}</dd>
              <dt>{t("review.helpMove")}</dt><dd>{t("review.helpMoveText")}</dd>
              <dt>{t("review.helpGroup")}</dt><dd>{t("review.helpGroupText")}</dd>
              <dt>{t("review.helpStation")}</dt><dd>{t("review.helpStationText")}</dd>
              <dt>{t("review.helpUndo")}</dt><dd>{t("review.helpUndoText")}</dd>
            </dl>
            <button type="button" className="plain" onClick={() => setShowHelp(false)}>{t("review.close")}</button>
          </div>}
        </span>
        <button onClick={undo} disabled={!history.past.length} title={t("review.undoHelp")}>{t("review.undo")}</button><button onClick={redo} disabled={!history.future.length} title={t("review.redoHelp")}>{t("review.redo")}</button></div>
    </div>


    <div className="issue-bar">
      <div className="issue-counts">{issues.length === 0
        ? <span className="ok">{t("review.noIssues")}</span>
        : (["error", "warning"] as IssueSeverity[]).filter(severity => counts[severity]).map(severity => <button type="button" key={severity} className={`${severity} ${openSeverity === severity ? "open" : ""}`} aria-expanded={openSeverity === severity} title={`${severity === "error" ? t("review.severityErrorHelp") : t("review.severityWarningHelp")}
${openSeverity === severity ? t("review.hideList") : t("review.showList")}`} onClick={() => setOpenSeverity(current => current === severity ? undefined : severity)}>{severityCount(severity, counts[severity])}<i aria-hidden="true">▾</i></button>)}
      </div>
      <span className="review-status" role="status">{status}</span>
      <div className="row-controls">
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("review.search")} aria-label={t("review.search")} />
        <select value={filter} onChange={event => setFilter(event.target.value as RowFilter)} aria-label={t("review.filter")}>{FILTERS.map(key => <option key={key} value={key}>{t(keyOf("review.filters", key))}</option>)}{segmentFilters.length > 0 && <optgroup label={t("segments.title")}>{segmentFilters.map(segment => <option key={segment.id} value={`segment:${segment.id}`}>{segment.name}</option>)}</optgroup>}</select>
        <select value={sortBy} onChange={event => setSortBy(event.target.value as RowSort)} aria-label={t("review.sort")}>{SORTS.map(key => <option key={key} value={key}>{t(keyOf("review.sorts", key))}</option>)}</select>
        {severalLanes && <select value={columnOrder} onChange={event => setColumnOrder(event.target.value as "group" | "stage")} aria-label={t("review.columnOrder")}><option value="group">{t("review.columnsByGroup")}</option><option value="stage">{t("review.columnsByStage")}</option></select>}
      </div>
    </div>
    {openSeverity && issues.some(issue => issue.severity === openSeverity) && <ul className="issue-items">{issues.filter(issue => issue.severity === openSeverity).map(issue => <li key={issue.key}><button className={`issue-${issue.severity}`} onClick={() => focusIssue(issue)}><span>{issue.severity === "error" ? t("review.severityError") : t("review.severityWarning")}</span>{issueText(issue)}</button></li>)}</ul>}

    <div className="assignment-matrix-wrap" ref={matrixRef}><table className="assignment-matrix" aria-label={t("review.matrix")}><thead>
      <tr><th className="rank-column">#</th><th className="name-column">{t("review.columnPerson")}</th><th>{t("review.columnAge")}</th><th>{laterRound ? t("review.columnPrevious") : t("review.columnSeed")}</th><th>{t("review.columnInRound")}</th><th className="groups-heading" colSpan={groupCount}>{roundSlots ? "" : roomName ?? t("review.area")}</th><th className="tasks-column">{t("review.columnTotals")}</th></tr>
      <tr className="group-labels"><th /><th className="name-column" /><th /><th /><th />{columns.map((group, position) => {
        const groupCounts = totals[group - 1].counts;
        const groupIssues = issueIndex.groups.get(group);
        const severity = worstSeverity(groupIssues);
        const extra = group > currentRules.groups;
        // Needed staff per role; undefined when the rules expect none, so only the count shows.
        const needs: Partial<Record<TaskRole, number>> = extra ? {} : {
          scrambler: groupLimits(currentRules, group).scramblers,
          ...(currentRules.checkJudges ? { judge: judgesNeeded(groupCounts.competitor, groupLimits(currentRules, group).stations), runner: groupLimits(currentRules, group).runners } : {}),
          ...(currentRules.checkDelegates ? { delegate: 1 } : {}),
          ...(currentRules.checkDataEntry && !currentRules.dataEntryCovered?.has(group) ? { dataentry: 1 } : {}),
        };
        const roles = (["scrambler", "judge", "runner", ...extraRoles] as TaskRole[]).filter(role => groupCounts[role] > 0 || needs[role]);
        const summary = [tp("review.groupCompetitors", groupCounts.competitor), ...roles.map(role => needs[role] !== undefined ? t("review.roleCountOf", { role: taskLabel(role), count: groupCounts[role], need: needs[role]! }) : t("review.roleCount", { role: taskLabel(role), count: groupCounts[role] })), ...(groupIssues ?? []).map(issueText)].join("\n");
        return <th key={group} className={`group-head ${severity ? `issue-${severity}` : ""} ${extra ? "out-of-range" : ""} ${startsBlock(position) ? "block-start" : ""}`} title={summary}>
          <button type="button" onClick={() => selectColumn(group)} title={`${t("review.selectColumn", { group: groupLabel(roundId, group) })}\n${summary}`}>G{roundSlots?.find(item => item.group === group)?.number ?? group}{(() => { const slot = roundSlots?.find(item => item.group === group); const number = slot && attemptNumber(roundSlots!, slot); return number ? <span className="group-attempt">{t("review.attempt", { number })}</span> : null; })()}<span className="group-size">{extra ? t("review.groupSurplus") : `· ${groupCounts.competitor}`}</span></button>
          {(() => {
            const slot = roundSlots?.find(item => item.group === group);
            const lane = slot && laneByKey.get(targetKey(slot.roomId, slot.stageId));
            return lane && <span className="group-stage" title={`${lane.name} · G${slot.number} · ${slot.windows[0].start.slice(0, 10)} ${clockOf(slot.windows[0].start)}–${clockOf(slot.windows[0].end)}`}><i style={{ background: lane.color }} />{lane.name} · {clockOf(slot.windows[0].start)}</span>;
          })()}
          <span className="group-chips">{roles.map(role => {
            const need = needs[role];
            const short = need !== undefined && groupCounts[role] < need;
            return <span key={role} className={`cell-chip mini ${role} ${short ? "short" : ""}`}>{TASK_CODES[role]}{short ? ` ${groupCounts[role]}/${need}` : groupCounts[role]}</span>;
          })}</span>
        </th>;
      })}<th /></tr>
    </thead><tbody>{visible.map((item, index) => {
      const rowIssues = issueIndex.rows.get(item.id);
      const rowSeverity = worstSeverity(rowIssues);
      const load = loads.get(item.personId) ?? 0;
      return <tr key={item.id} className={item.inRound ? "" : "staff-row"}>
        <td className="rank-column">{item.inRound ? index + 1 : ""}</td>
        <td className="name-column">{rowSeverity && <i className={`issue-dot ${rowSeverity}`} title={rowIssues?.map(issueText).join("\n")} />}<div className="person-cell">{showPhotos && <PersonAvatar name={item.name} url={photos[item.personId]} />}<div><button type="button" className="person-link" onClick={() => setCardPersonId(item.personId)} title={t("review.openCard")}>{item.name}</button>{item.featured && <span className="featured-star" title={t("sets.featuredHelp")} aria-label={t("sets.featured")}>★</span>}<small>{item.wcaId ?? <NewcomerBadge withLabel />}</small></div></div></td>
        <td>{ageFromBirthdate(item.birthdate)}</td>
        <td title={item.roundRank ? t("review.previousPlace", { place: item.roundRank }) : undefined}>{laterRound && (item.inRound || item.roundRank) ? (item.roundRank ? <><span className="previous-place">{item.roundRank}.</span> {formatResult(item.roundResult, item.eventId)}</> : "") : formatResult(item.seedResult, item.eventId)}</td>
        <td>{item.inRound ? <span className="registered-check" aria-label={t("review.competesHere")}>✓</span> : <span className="muted-mark" aria-label={t("review.onlyWorks")}>—</span>}</td>
        {columns.map((group, position) => {
          const cell = { id: item.id, group };
          const key = cellKey(item.id, group);
          const value = cellValue(item, group);
          const cellIssues = issueIndex.cells.get(key);
          const severity = worstSeverity(cellIssues);
          const isCursor = cursor?.id === item.id && cursor.group === group;
          // Data entry in a room with stages is for the whole room at that time, not this stage.
          const task = item.tasks.find(own => own.group === group);
          const columnSlot = roundSlots?.find(slot => slot.group === group);
          const wholeRoom = !!task && isWholeRoomTask(task, columnSlot);
          const classes = [value || "empty", wholeRoom && "whole-room", isCursor && "cursor", selected.has(key) && "in-selection", severity && `issue-${severity}`].filter(Boolean).join(" ");
          const why = whyOf(item, group);
          const description = `${taskLabel(value)}${wholeRoom ? ` · ${t("review.wholeRoom", { room: rooms?.find(room => room.id === columnSlot?.roomId)?.name ?? "" })}` : ""} · G${groupLabel(roundId, group)}${why ? `\n${whyText(why)}` : ""}${cellIssues ? `\n${cellIssues.map(issueText).join("\n")}` : ""}`;
          if (stationEdit?.id === item.id && stationEdit.group === group) {
            return <td key={group} className={`matrix-cell ${startsBlock(position) ? "block-start" : ""}`}><input
              className="station-input"
              autoFocus
              inputMode="numeric"
              aria-label={t("review.stationLabel", { name: item.name, group })}
              value={stationEdit.value}
              onChange={event => setStationEdit({ ...stationEdit, value: event.target.value.replace(/\D/g, "").slice(0, 3) })}
              onKeyDown={event => {
                event.stopPropagation();
                if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); finishStationEdit(true); }
                else if (event.key === "Escape") { event.preventDefault(); finishStationEdit(false); }
              }}
              onBlur={() => finishStationEdit(true)}
            /></td>;
          }
          return <td key={group} className={`matrix-cell ${startsBlock(position) ? "block-start" : ""}`}><button
            data-cell={key}
            className={classes}
            tabIndex={tabbable?.id === item.id && tabbable.group === group ? 0 : -1}
            aria-label={t("review.cellLabel", { name: item.name, group, description })}
            title={description}
            onMouseDown={event => handleMouseDown(event, cell)}
            onMouseEnter={() => handleMouseEnter(cell)}
            onDoubleClick={() => startStationEdit(cell)}
            onClick={event => {
              // Only keyboard activation (Enter/Space) arrives with detail 0; mouse clicks are handled on mouse down/up.
              if (event.detail !== 0) return;
              if (tool === "select" && startStationEdit(cell)) return;
              selectSingle(cell);
              if (tool !== "select") apply(tool, [key]);
            }}
          ><strong>{TASK_CODES[value]}</strong>{value === "competitor" && item.station && <small>P{item.station}</small>}</button></td>;
        })}
        <td className="tasks-column">
          {load === 0 ? <span className="muted-mark">—</span> : (() => {
            const roles = DUTY_ROLES.filter(role => (roleTotals.get(item.personId)?.[role] ?? 0) > 0);
            return <span className="task-totals" title={tp("review.totalTasks", load)}>{roles.map(role => <span key={role} className={`cell-chip mini ${role}`}>{TASK_CODES[role]}{roleTotals.get(item.personId)![role]}</span>)}{roles.length > 1 && <b>· {load}</b>}</span>;
          })()}
        </td>
      </tr>;
    })}</tbody></table></div>

    {selection.length > 1 && <div className="selection-float" role="toolbar" aria-label={t("review.assignSelection")}>
      <strong>{tp("review.selectionCount", selection.length)}</strong>
      {VALUES.map(value => <button key={value || "empty"} className={`cell-chip ${value || "empty"}`} onClick={() => apply(value)} title={value ? t(keyOf("tasks", value)) : t("tasks.clear")}>{value ? TASK_CODES[value] : "∅"}</button>)}
      <button className="plain" onClick={clearSelection}>{t("review.clearSelection")} <kbd>Esc</kbd></button>
    </div>}

    {cardPersonId && <PersonCard
      rows={assignments.filter(item => item.personId === cardPersonId)}
      roundOrder={rounds.map(round => round.id)}
      photo={showPhotos ? photos[cardPersonId] : undefined}
      roles={roleLabels[cardPersonId] ?? []}
      issues={[...issuesByRound.values()].flat()}
      groupLabel={groupLabel}
      onClose={() => setCardPersonId(undefined)}
      onGoTo={(targetRound, group) => {
        if (targetRound !== roundId) changeRound(targetRound);
        setQuery("");
        setFilter("all");
        const row = assignments.find(item => item.roundId === targetRound && item.personId === cardPersonId);
        if (row) {
          selectSingle({ id: row.id, group });
          setFocusRequest(request => request + 1);
        }
      }}
    />}

    <div className="review-footer"><span><strong>{tp("review.footerCompetitors", visible.filter(item => item.inRound).length)}</strong>{visible.some(item => !item.inRound) && ` · ${tp("review.footerStaffOnly", visible.filter(item => !item.inRound).length)}`} · {issues.length ? (["error", "warning"] as IssueSeverity[]).map(severity => severityCount(severity, counts[severity])).join(" · ") : t("review.noIssuesShort")}</span><span className="review-saved">{t("review.footerSaved")}</span></div>
  </section>;
}
