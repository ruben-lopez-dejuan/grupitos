"use client";

import { useMemo, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import type { DutyRole, GeneratedAssignment } from "@/lib/group-generator";

const ROLE_LABELS: Record<DutyRole, string> = { "": "Sin tarea", judge: "Juez", scrambler: "Mezclador", runner: "Runner" };

export function GroupReview({ initialAssignments, eventNames, draftKey }: { initialAssignments: GeneratedAssignment[]; eventNames: Record<string, string>; draftKey: string }) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const rounds = useMemo(() => Array.from(new Map(initialAssignments.map(item => [item.roundId, { id: item.roundId, eventId: item.eventId }])).values()), [initialAssignments]);
  const [roundId, setRoundId] = useState(rounds[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string>();
  const visible = assignments.filter(item => item.roundId === roundId).sort((a, b) => a.group - b.group || (a.station ?? 999) - (b.station ?? 999) || a.name.localeCompare(b.name));
  const groupCount = Math.max(1, ...visible.map(item => item.group));

  function update(id: string, patch: Partial<GeneratedAssignment>) {
    setAssignments(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    setSaveState("idle");
  }

  function saveDraft() {
    localStorage.setItem(`wca-easy-groups:draft:${draftKey}`, JSON.stringify(assignments));
    setSaveState("saved");
  }

  function handleHotkey(event: React.KeyboardEvent) {
    if (!selectedId || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const roles: Record<string, DutyRole> = { j: "judge", m: "scrambler", r: "runner", "0": "" };
    const role = roles[event.key.toLowerCase()];
    if (role !== undefined) {
      event.preventDefault();
      update(selectedId, { dutyRole: role, dutyGroup: role ? assignments.find(item => item.id === selectedId)?.dutyGroup ?? 1 : undefined });
      return;
    }
    if (/^[1-9]$/.test(event.key) && Number(event.key) <= groupCount) {
      event.preventDefault();
      update(selectedId, { group: Number(event.key) });
    }
  }

  return <section className="review-panel" id="review" tabIndex={0} onKeyDown={handleHotkey}>
    <div className="review-head"><div><p className="kicker">Propuesta generada</p><h2>Revisa las asignaciones</h2><p>Selecciona una fila para usar atajos o modifica cualquier celda.</p></div><div className="hotkey-help"><span><kbd>J</kbd> Juez</span><span><kbd>M</kbd> Mezclador</span><span><kbd>R</kbd> Runner</span><span><kbd>0</kbd> Sin tarea</span><span><kbd>1–9</kbd> Grupo</span></div></div>
    <div className="round-tabs" role="tablist" aria-label="Rondas">{rounds.map(round => <button key={round.id} className={roundId === round.id ? "active" : ""} onClick={() => { setRoundId(round.id); setSelectedId(undefined); }}><EventIcon eventId={round.eventId} label={eventNames[round.eventId] ?? round.eventId} /><span>{eventNames[round.eventId] ?? round.eventId}<small>{round.id}</small></span></button>)}</div>
    <div className="assignment-table-wrap"><table className="assignment-table"><thead><tr><th>Competidor</th><th>Grupo</th><th>Estación</th><th>Tarea</th><th>Grupo de tarea</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}><td><strong>{item.name}</strong><small>{item.wcaId ?? "Sin WCA ID"}</small></td><td><select aria-label={`Grupo de ${item.name}`} value={item.group} onChange={event => update(item.id, { group: Number(event.target.value) })}>{Array.from({ length: groupCount }, (_, index) => <option key={index + 1} value={index + 1}>G{index + 1}</option>)}</select></td><td><input aria-label={`Estación de ${item.name}`} type="number" min="1" value={item.station ?? ""} placeholder="—" onChange={event => update(item.id, { station: event.target.value ? Number(event.target.value) : undefined })} /></td><td><select aria-label={`Tarea de ${item.name}`} value={item.dutyRole} onChange={event => update(item.id, { dutyRole: event.target.value as DutyRole })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td><select aria-label={`Grupo de tarea de ${item.name}`} value={item.dutyGroup ?? ""} onChange={event => update(item.id, { dutyGroup: event.target.value ? Number(event.target.value) : undefined })}><option value="">—</option>{Array.from({ length: groupCount }, (_, index) => <option key={index + 1} value={index + 1}>G{index + 1}</option>)}</select></td></tr>)}</tbody></table></div>
    <div className="review-footer"><span>{saveState === "saved" ? "Borrador guardado en este dispositivo" : `${visible.length} competidores · los cambios todavía no se han publicado en la WCA`}</span><button className="button primary" type="button" onClick={saveDraft}>{saveState === "saved" ? "Guardado" : "Guardar borrador"}</button></div>
  </section>;
}
