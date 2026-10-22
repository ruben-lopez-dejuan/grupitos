"use client";

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { applyCells, cellValue, dutyLoads, groupTotals, normalizeAssignments, usedGroupCount, type CellRef, type CellValue, type GeneratedAssignment } from "@/lib/assignments";
import { judgesNeeded } from "@/lib/rounds";
import { countBySeverity, SEVERITY_ORDER, validateRound, type Issue, type IssueSeverity, type RoundRules } from "@/lib/validation";

type Tool = CellValue | "select";
type History = { past: GeneratedAssignment[][]; present: GeneratedAssignment[]; future: GeneratedAssignment[][] };
type HistoryAction = { type: "commit"; next: GeneratedAssignment[] } | { type: "undo" } | { type: "redo" };

const HISTORY_LIMIT = 200;
const VALUES: CellValue[] = ["competitor", "judge", "scrambler", "runner", ""];
const CELL_LABELS: Record<CellValue, string> = { "": "Vacío", competitor: "Compite", judge: "Juez", scrambler: "Mezclador", runner: "Runner" };
const CELL_CODES: Record<CellValue, string> = { "": "", competitor: "C", judge: "J", scrambler: "M", runner: "R" };
const HOTKEY_LABELS: Record<CellValue, string> = { "": "0", competitor: "C", judge: "J", scrambler: "M / S", runner: "R" };
const HOTKEYS: Record<string, CellValue> = { c: "competitor", j: "judge", m: "scrambler", s: "scrambler", r: "runner", "0": "", delete: "", backspace: "" };
const SEVERITY_LABELS: Record<IssueSeverity, string> = { error: "Error", warning: "Aviso", preference: "Preferencia" };
const SEVERITY_COUNTS: Record<IssueSeverity, [string, string]> = { error: ["error", "errores"], warning: ["aviso", "avisos"], preference: ["preferencia no cumplida", "preferencias no cumplidas"] };
const SEVERITY_HELP: Record<IssueSeverity, string> = {
  error: "Incumple una regla obligatoria. Hay que corregirlo antes de publicar.",
  warning: "La propuesta no llega a lo configurado.",
  preference: "Se intentó evitar, pero no fue posible con las personas disponibles.",
};

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

function countLabel(count: number, [one, many]: [string, string]) {
  return `${count} ${count === 1 ? one : many}`;
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

function formatSeed(value: number | undefined, eventId: string) {
  if (value === undefined) return "—";
  if (eventId === "333fm") return value >= 1000 ? (value / 100).toFixed(2) : String(value);
  if (eventId === "333mbf") return String(value);
  const seconds = value / 100;
  if (seconds < 60) return seconds.toFixed(2);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function describeChange(value: CellValue, changed: number, skipped: number) {
  const parts: string[] = [];
  if (changed) parts.push(`${CELL_LABELS[value]}: ${changed === 1 ? "1 persona actualizada" : `${changed} personas actualizadas`}`);
  if (skipped) parts.push(value === "competitor"
    ? `${skipped === 1 ? "1 celda ignorada" : `${skipped} celdas ignoradas`}: cada persona compite en un solo grupo`
    : `${skipped === 1 ? "1 celda ignorada" : `${skipped} celdas ignoradas`}: la celda de competir solo se puede mover a otro grupo`);
  return parts.join(" · ");
}

function fallbackRules(rows: GeneratedAssignment[]): RoundRules {
  return { groups: Math.max(1, usedGroupCount(rows)), scramblers: 0, runners: 0, stations: Number.MAX_SAFE_INTEGER, fixedStations: false, checkJudges: false, avoidBeforeOwnGroup: false };
}

export function GroupReview({ initialAssignments, rules, eventNames, roomName = "Área de competición", onChange }: {
  initialAssignments: GeneratedAssignment[];
  rules: Record<string, RoundRules>;
  eventNames: Record<string, string>;
  roomName?: string;
  onChange: (assignments: GeneratedAssignment[]) => void;
}) {
  const [history, dispatch] = useReducer(historyReducer, initialAssignments, initial => ({ past: [], present: normalizeAssignments(initial), future: [] }));
  const assignments = history.present;
  const rounds = useMemo(() => Array.from(new Map(initialAssignments.map(item => [item.roundId, { id: item.roundId, eventId: item.eventId }])).values()), [initialAssignments]);
  const [roundId, setRoundId] = useState(rounds[0]?.id ?? "");
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<CellRef>();
  const [cursor, setCursor] = useState<CellRef>();
  const [focusRequest, setFocusRequest] = useState(0);
  const [status, setStatus] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const dragging = useRef(false);
  const finishDrag = useRef(() => {});
  const matrixRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onChange(assignments); }, [assignments]); // eslint-disable-line react-hooks/exhaustive-deps

  const issuesByRound = useMemo(() => new Map(rounds.map(round => {
    const rows = assignments.filter(item => item.roundId === round.id);
    return [round.id, validateRound(round.id, rows, rules[round.id] ?? fallbackRules(rows))];
  })), [assignments, rounds, rules]);

  const visible = useMemo(() => assignments.filter(item => item.roundId === roundId).sort((a, b) => (a.seedResult ?? Number.MAX_SAFE_INTEGER) - (b.seedResult ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)), [assignments, roundId]);
  const rowIndex = useMemo(() => new Map(visible.map((item, index) => [item.id, index])), [visible]);
  const currentRules = rules[roundId] ?? fallbackRules(visible);
  const groupCount = Math.max(currentRules.groups, usedGroupCount(visible), 1);
  const totals = groupTotals(visible, groupCount);
  const loads = useMemo(() => dutyLoads(assignments), [assignments]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const currentRound = rounds.find(round => round.id === roundId);
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
      for (let group = Math.min(from.group, to.group); group <= Math.max(from.group, to.group); group += 1) keys.push(cellKey(visible[row].id, group));
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
    const result = applyCells(assignments, keys.map(refFromKey), value, { stations: currentRules.stations, fixedStations: currentRules.fixedStations });
    if (result.changed) dispatch({ type: "commit", next: result.assignments });
    setStatus(describeChange(value, result.changed, result.skipped));
  }

  function undo() {
    if (!history.past.length) return;
    dispatch({ type: "undo" });
    setStatus("Cambio deshecho");
  }

  function redo() {
    if (!history.future.length) return;
    dispatch({ type: "redo" });
    setStatus("Cambio rehecho");
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
      group: key === "arrowleft" ? Math.max(1, from.group - 1) : key === "arrowright" ? Math.min(groupCount, from.group + 1) : from.group,
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
    if (issue.assignmentId && issue.group !== undefined && issue.group >= 1) {
      selectSingle({ id: issue.assignmentId, group: issue.group });
      setFocusRequest(request => request + 1);
    } else if (issue.group !== undefined) {
      selectColumn(issue.group);
    }
  }

  const tabbable = cursor ?? (visible[0] ? { id: visible[0].id, group: 1 } : undefined);

  return <section className="review-panel matrix-review" id="review" onKeyDown={handleKeyDown}>
    <div className="review-head"><div><p className="kicker">Revisar y validar</p><h2>{currentRound ? `${eventNames[currentRound.eventId] ?? currentRound.eventId} · ${currentRound.id.split("-").at(-1)?.toUpperCase()}` : "Revisar asignaciones"}</h2><p>Selecciona celdas y asígnales una tarea con el teclado o con los botones.</p></div><div className="matrix-legend">{VALUES.filter(Boolean).map(value => <span key={value} className={`cell-chip ${value}`}>{CELL_CODES[value]} <small>{CELL_LABELS[value]}</small></span>)}</div></div>

    <div className="round-tabs" role="tablist" aria-label="Rondas">{rounds.map(round => {
      const roundIssues = (issuesByRound.get(round.id) ?? []).filter(issue => issue.severity !== "preference");
      const worst = worstSeverity(roundIssues);
      return <button key={round.id} role="tab" aria-selected={roundId === round.id} className={roundId === round.id ? "active" : ""} onClick={() => changeRound(round.id)}><EventIcon eventId={round.eventId} label={eventNames[round.eventId] ?? round.eventId} /><span>{eventNames[round.eventId] ?? round.eventId}<small>{round.id}</small></span>{worst && <em className={`tab-issues ${worst}`} title={`${roundIssues.length} problemas`}>{roundIssues.length}</em>}</button>;
    })}</div>

    <div className="matrix-toolbar">
      <div className="tool-group" role="radiogroup" aria-label="Al hacer clic en una celda"><strong>Al hacer clic</strong>
        <button role="radio" aria-checked={tool === "select"} className={`select ${tool === "select" ? "active" : ""}`} onClick={() => setTool("select")}>Solo seleccionar</button>
        {VALUES.map(value => <button key={value || "empty"} role="radio" aria-checked={tool === value} className={`${value || "empty"} ${tool === value ? "active" : ""}`} onClick={() => setTool(value)}><kbd>{HOTKEY_LABELS[value]}</kbd>{value ? CELL_LABELS[value] : "Vaciar"}</button>)}
      </div>
      <div className="history-actions"><button onClick={undo} disabled={!history.past.length} title="Deshacer (Ctrl+Z)">↶ Deshacer</button><button onClick={redo} disabled={!history.future.length} title="Rehacer (Ctrl+Y o Ctrl+Mayús+Z)">↷ Rehacer</button></div>
    </div>

    <div className="selection-bar">{selection.length > 1
      ? <><strong>{selection.length} celdas seleccionadas</strong><span>Asignar:</span>{VALUES.map(value => <button key={value || "empty"} className={`cell-chip ${value || "empty"}`} onClick={() => apply(value)}>{value ? `${CELL_CODES[value]} · ${CELL_LABELS[value]}` : "Vaciar"}</button>)}<button className="plain" onClick={clearSelection}>Quitar selección <kbd>Esc</kbd></button></>
      : <p>Arrastra o usa <kbd>Mayús</kbd> y <kbd>Ctrl</kbd> para seleccionar varias celdas. Pulsa <kbd>C</kbd> <kbd>J</kbd> <kbd>M</kbd> <kbd>R</kbd> o <kbd>0</kbd> para asignar a la selección y <kbd>↑↓←→</kbd> para moverte.</p>}
    </div>

    <div className="issue-bar">
      <div className="issue-counts">{issues.length === 0
        ? <span className="ok">Sin problemas en esta ronda</span>
        : (["error", "warning", "preference"] as IssueSeverity[]).filter(severity => counts[severity]).map(severity => <span key={severity} className={severity} title={SEVERITY_HELP[severity]}>{countLabel(counts[severity], SEVERITY_COUNTS[severity])}</span>)}
      </div>
      <span className="review-status" role="status">{status}</span>
      {issues.length > 0 && <button className="plain" aria-expanded={showIssues} onClick={() => setShowIssues(value => !value)}>{showIssues ? "Ocultar lista" : "Ver lista"}</button>}
    </div>
    {showIssues && issues.length > 0 && <ul className="issue-items">{issues.map(issue => <li key={issue.key}><button className={`issue-${issue.severity}`} onClick={() => focusIssue(issue)}><span>{SEVERITY_LABELS[issue.severity]}</span>{issue.message}</button></li>)}</ul>}

    <div className="assignment-matrix-wrap" ref={matrixRef}><table className="assignment-matrix" aria-label="Matriz de asignaciones"><thead>
      <tr><th className="rank-column">#</th><th className="name-column">Competidor</th><th>Edad</th><th>Seed</th><th>Inscrito</th><th className="groups-heading" colSpan={groupCount}>{roomName}</th><th className="tasks-column">Tareas</th></tr>
      <tr className="group-labels"><th /><th className="name-column" /><th /><th /><th />{totals.map(total => {
        const groupIssues = issueIndex.groups.get(total.group);
        const severity = worstSeverity(groupIssues);
        const extra = total.group > currentRules.groups;
        const judges = judgesNeeded(total.competitors, currentRules.stations);
        const shortClass = (have: number, need: number) => !extra && have < need ? "short" : "";
        return <th key={total.group} className={`group-head ${severity ? `issue-${severity}` : ""} ${extra ? "out-of-range" : ""}`} title={groupIssues?.map(issue => issue.message).join("\n")}>
          <button type="button" onClick={() => selectColumn(total.group)} title={`Seleccionar toda la columna G${total.group}`}>G{total.group}{extra && " · sobra"}</button>
          <span className="group-totals">
            <span title="Competidores">C {total.competitors}</span>
            <span className={shortClass(total.scramblers, currentRules.scramblers)} title="Mezcladores asignados / necesarios">M {total.scramblers}{!extra && `/${currentRules.scramblers}`}</span>
            <span className={currentRules.checkJudges ? shortClass(total.judges, judges) : ""} title="Jueces asignados / necesarios">J {total.judges}{currentRules.checkJudges && !extra && `/${judges}`}</span>
            <span className={currentRules.checkJudges ? shortClass(total.runners, currentRules.runners) : ""} title="Runners asignados / necesarios">R {total.runners}{currentRules.checkJudges && !extra && `/${currentRules.runners}`}</span>
          </span>
        </th>;
      })}<th /></tr>
    </thead><tbody>{visible.map((item, index) => {
      const rowIssues = issueIndex.rows.get(item.id);
      const rowSeverity = worstSeverity(rowIssues);
      const load = loads.get(item.personId) ?? 0;
      return <tr key={item.id}>
        <td className="rank-column">{index + 1}</td>
        <td className="name-column">{rowSeverity && <i className={`issue-dot ${rowSeverity}`} title={rowIssues?.map(issue => issue.message).join("\n")} />}<strong>{item.name}</strong><small>{item.wcaId ?? "Sin WCA ID"}</small></td>
        <td>{ageFromBirthdate(item.birthdate)}</td>
        <td>{formatSeed(item.seedResult, item.eventId)}</td>
        <td><span className="registered-check" aria-label="Inscrito">✓</span></td>
        {Array.from({ length: groupCount }, (_, groupIndex) => {
          const group = groupIndex + 1;
          const cell = { id: item.id, group };
          const key = cellKey(item.id, group);
          const value = cellValue(item, group);
          const cellIssues = issueIndex.cells.get(key);
          const severity = worstSeverity(cellIssues);
          const isCursor = cursor?.id === item.id && cursor.group === group;
          const classes = [value || "empty", isCursor && "cursor", selected.has(key) && "in-selection", severity && `issue-${severity}`].filter(Boolean).join(" ");
          const description = `${CELL_LABELS[value]} · G${group}${cellIssues ? `\n${cellIssues.map(issue => issue.message).join("\n")}` : ""}`;
          return <td key={group} className="matrix-cell"><button
            data-cell={key}
            className={classes}
            tabIndex={tabbable?.id === item.id && tabbable.group === group ? 0 : -1}
            aria-label={`${item.name}, grupo ${group}: ${description}`}
            title={description}
            onMouseDown={event => handleMouseDown(event, cell)}
            onMouseEnter={() => handleMouseEnter(cell)}
            onClick={event => {
              // Only keyboard activation (Enter/Space) arrives with detail 0; mouse clicks are handled on mouse down/up.
              if (event.detail !== 0) return;
              selectSingle(cell);
              if (tool !== "select") apply(tool, [key]);
            }}
          ><strong>{CELL_CODES[value]}</strong>{value === "competitor" && item.station && <small>P{item.station}</small>}</button></td>;
        })}
        <td className="tasks-column">{item.duties.length ? item.duties.map(duty => `G${duty.group} ${CELL_CODES[duty.role]}`).join(" · ") : "—"}{load > 0 && <small>{load === 1 ? "1 tarea" : `${load} tareas`} en total</small>}</td>
      </tr>;
    })}</tbody></table></div>

    <div className="review-footer"><span><strong>{visible.length} personas</strong> · {issues.length ? (["error", "warning"] as IssueSeverity[]).map(severity => countLabel(counts[severity], SEVERITY_COUNTS[severity])).join(" · ") : "sin problemas"}</span><span className="review-saved">Guardado en este dispositivo · sin publicar</span></div>
  </section>;
}
