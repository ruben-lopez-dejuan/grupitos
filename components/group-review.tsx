"use client";

import { useMemo, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import type { AssignedDuty, DutyRole, GeneratedAssignment } from "@/lib/group-generator";

type CellValue = "competitor" | Exclude<DutyRole, ""> | "";
type SelectedCell = { id: string; group: number };

const CELL_LABELS: Record<CellValue, string> = { "": "Vacío", competitor: "Compite", judge: "Juez", scrambler: "Mezclador", runner: "Runner" };
const CELL_CODES: Record<CellValue, string> = { "": "", competitor: "C", judge: "J", scrambler: "M", runner: "R" };

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

function normalizeAssignments(assignments: GeneratedAssignment[]) {
  return assignments.map(item => ({
    ...item,
    duties: item.duties ?? (item.dutyGroup && item.dutyRole ? [{ group: item.dutyGroup, role: item.dutyRole as Exclude<DutyRole, ""> }] : []),
  }));
}

function cellValue(item: GeneratedAssignment, group: number): CellValue {
  if (item.group === group) return "competitor";
  return item.duties.find(duty => duty.group === group)?.role ?? "";
}

export function GroupReview({ initialAssignments, eventNames, draftKey, roomName = "Área de competición" }: {
  initialAssignments: GeneratedAssignment[];
  eventNames: Record<string, string>;
  draftKey: string;
  roomName?: string;
}) {
  const [assignments, setAssignments] = useState(() => normalizeAssignments(initialAssignments));
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [activeTool, setActiveTool] = useState<CellValue>("scrambler");
  const [selectedCell, setSelectedCell] = useState<SelectedCell>();
  const rounds = useMemo(() => Array.from(new Map(initialAssignments.map(item => [item.roundId, { id: item.roundId, eventId: item.eventId }])).values()), [initialAssignments]);
  const [roundId, setRoundId] = useState(rounds[0]?.id ?? "");
  const visible = assignments.filter(item => item.roundId === roundId).sort((a, b) => (a.seedResult ?? Number.MAX_SAFE_INTEGER) - (b.seedResult ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
  const groupCount = Math.max(1, ...visible.map(item => item.group), ...visible.flatMap(item => item.duties.map(duty => duty.group)));
  const currentRound = rounds.find(round => round.id === roundId);

  function updateAssignment(id: string, change: (item: GeneratedAssignment) => GeneratedAssignment) {
    setAssignments(current => current.map(item => item.id === id ? change(item) : item));
    setSaveState("idle");
  }

  function assignCell(id: string, group: number, value: CellValue) {
    updateAssignment(id, item => {
      const duties = item.duties.filter(duty => duty.group !== group);
      if (value === "competitor") return { ...item, group, duties };
      if (group === item.group) return item;
      if (!value) return { ...item, duties };
      return { ...item, duties: [...duties, { group, role: value } as AssignedDuty].sort((a, b) => a.group - b.group) };
    });
    setSelectedCell({ id, group });
  }

  function handleCellClick(id: string, group: number) {
    setSelectedCell({ id, group });
    assignCell(id, group, activeTool);
  }

  function handleHotkey(event: React.KeyboardEvent) {
    if (!selectedCell) return;
    const key = event.key.toLowerCase();
    const tools: Record<string, CellValue> = { c: "competitor", j: "judge", m: "scrambler", s: "scrambler", r: "runner", "0": "" };
    if (tools[key] !== undefined) {
      event.preventDefault();
      setActiveTool(tools[key]);
      assignCell(selectedCell.id, selectedCell.group, tools[key]);
      return;
    }
    const rowIndex = visible.findIndex(item => item.id === selectedCell.id);
    let nextRow = rowIndex;
    let nextGroup = selectedCell.group;
    if (key === "arrowleft") nextGroup = Math.max(1, nextGroup - 1);
    else if (key === "arrowright") nextGroup = Math.min(groupCount, nextGroup + 1);
    else if (key === "arrowup") nextRow = Math.max(0, rowIndex - 1);
    else if (key === "arrowdown") nextRow = Math.min(visible.length - 1, rowIndex + 1);
    else return;
    event.preventDefault();
    setSelectedCell({ id: visible[nextRow].id, group: nextGroup });
  }

  function saveDraft() {
    localStorage.setItem(`wca-easy-groups:draft:${draftKey}`, JSON.stringify(assignments));
    setSaveState("saved");
  }

  return <section className="review-panel matrix-review" id="review" tabIndex={0} onKeyDown={handleHotkey}>
    <div className="review-head"><div><p className="kicker">Propuesta generada</p><h2>{currentRound ? `${eventNames[currentRound.eventId] ?? currentRound.eventId} · ${currentRound.id.split("-").at(-1)?.toUpperCase()}` : "Revisar asignaciones"}</h2><p>Selecciona una tarea y haz clic en las celdas. También puedes usar el teclado.</p></div><div className="matrix-legend"><span className="cell-chip competitor">C <small>Compite</small></span><span className="cell-chip judge">J <small>Juez</small></span><span className="cell-chip scrambler">M <small>Mezclador</small></span><span className="cell-chip runner">R <small>Runner</small></span></div></div>
    <div className="round-tabs" role="tablist" aria-label="Rondas">{rounds.map(round => <button key={round.id} className={roundId === round.id ? "active" : ""} onClick={() => { setRoundId(round.id); setSelectedCell(undefined); }}><EventIcon eventId={round.eventId} label={eventNames[round.eventId] ?? round.eventId} /><span>{eventNames[round.eventId] ?? round.eventId}<small>{round.id}</small></span></button>)}</div>
    <div className="matrix-toolbar"><div><strong>Asignar con clic</strong>{(["competitor", "judge", "scrambler", "runner", ""] as CellValue[]).map(tool => <button key={tool || "empty"} className={`${tool || "empty"} ${activeTool === tool ? "active" : ""}`} onClick={() => setActiveTool(tool)}><kbd>{tool === "scrambler" ? "M / S" : tool === "" ? "0" : CELL_CODES[tool]}</kbd>{CELL_LABELS[tool]}</button>)}</div><p><kbd>↑↓←→</kbd> mover selección</p></div>
    <div className="assignment-matrix-wrap"><table className="assignment-matrix"><thead><tr><th className="rank-column">#</th><th className="name-column">Competidor</th><th>Edad</th><th>Seed</th><th>Inscrito</th><th className="groups-heading" colSpan={groupCount}>{roomName}</th><th className="tasks-column">Tareas en esta ronda</th></tr><tr className="group-labels"><th /><th /><th /><th /><th />{Array.from({ length: groupCount }, (_, index) => <th key={index}>G{index + 1}</th>)}<th /></tr></thead><tbody>{visible.map((item, index) => <tr key={item.id}><td className="rank-column">{index + 1}</td><td className="name-column"><strong>{item.name}</strong><small>{item.wcaId ?? "Sin WCA ID"}</small></td><td>{ageFromBirthdate(item.birthdate)}</td><td>{formatSeed(item.seedResult, item.eventId)}</td><td><span className="registered-check" aria-label="Inscrito">✓</span></td>{Array.from({ length: groupCount }, (_, groupIndex) => { const group = groupIndex + 1; const value = cellValue(item, group); const selected = selectedCell?.id === item.id && selectedCell.group === group; return <td key={group} className="matrix-cell"><button className={`${value || "empty"} ${selected ? "selected" : ""}`} aria-label={`${item.name}, grupo ${group}: ${CELL_LABELS[value]}`} title={`${CELL_LABELS[value]} · G${group}`} onClick={() => handleCellClick(item.id, group)}><strong>{CELL_CODES[value]}</strong>{value === "competitor" && item.station && <small>P{item.station}</small>}</button></td>; })}<td className="tasks-column">{item.duties.length ? item.duties.map(duty => `G${duty.group} ${CELL_CODES[duty.role]}`).join(" · ") : "—"}</td></tr>)}</tbody></table></div>
    <div className="review-footer"><span><strong>Asignando: {CELL_LABELS[activeTool]}</strong> · {visible.length} personas · cambios sin publicar</span><button className="button primary" type="button" onClick={saveDraft}>{saveState === "saved" ? "Borrador guardado" : "Guardar borrador"}</button></div>
  </section>;
}
