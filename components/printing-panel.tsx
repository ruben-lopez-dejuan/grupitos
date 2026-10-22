"use client";

import { useState } from "react";
import { EventIcon } from "@/components/event-icon";
import type { GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import { EVENT_NAMES, type RoundConfig, type ZoneMode } from "@/lib/rounds";
import type { PrintingOptions } from "@/lib/scorecards/options";
import { UNSUPPORTED_SCORECARD_LANGUAGES } from "@/lib/scorecards/scorecards";
import { SCORECARD_LANGUAGES } from "@/lib/scorecards/translations";

const CHECKBOXES: Array<{ key: keyof PrintingOptions; label: string; help?: string }> = [
  { key: "coverSheets", label: "Imprimir portadas por grupo", help: "Una hoja de control para el delegado y data entry delante de cada grupo." },
  { key: "localNamesFirst", label: "Nombre local antes que el latino" },
  { key: "printOneName", label: "Solo un nombre", help: "No añade el nombre local o latino entre paréntesis." },
  { key: "scrambleCheckerTopRanked", label: "Casilla de comprobación de mezcla para los mejores", help: "WR50 en single o WR50/NR15 en media." },
  { key: "scrambleCheckerFinalRounds", label: "Casilla de comprobación de mezcla en finales" },
  { key: "scrambleCheckerBlank", label: "Casilla de comprobación de mezcla en hojas en blanco" },
  { key: "scrambleCheckerBigCubes", label: "Casilla de comprobación de mezcla también en 5×5, 6×6, 7×7 y Megaminx", help: "Groupifier nunca la imprime en estas pruebas. Actívalo si las compruebas igualmente." },
];

export function PrintingPanel({ competition, rounds, assignments, stations, zoneMode, printing, onChange }: {
  competition: StoredCompetition;
  rounds: RoundConfig[];
  assignments: GeneratedAssignment[];
  stations: number;
  zoneMode: ZoneMode;
  printing: PrintingOptions;
  onChange: (printing: PrintingOptions) => void;
}) {
  const withAssignments = new Set(assignments.map(item => item.roundId));
  // Rounds with a proposal, plus later rounds whose groups are planned but whose competitors are unknown.
  const printable = rounds.filter(round => withAssignments.has(round.id) || (round.roundNumber > 1 && !round.competitorsKnown && round.competitors > 0));
  const [chosen, setChosen] = useState<string[]>(() => printable.filter(round => withAssignments.has(round.id)).map(round => round.id));
  const [busy, setBusy] = useState<"rounds" | "blank">();
  const [message, setMessage] = useState("");
  const set = <K extends keyof PrintingOptions>(key: K, value: PrintingOptions[K]) => onChange({ ...printing, [key]: value });
  const source = { competition, assignments, rounds, stations, zoneMode, printing };
  const selectedIds = chosen.filter(id => printable.some(round => round.id === id));
  const eventIds = [...new Set(rounds.map(round => round.eventId))];
  const roundNumbers = [...new Set(rounds.map(round => round.roundNumber))].sort((a, b) => a - b);

  async function download(kind: "rounds" | "blank") {
    setBusy(kind);
    setMessage("");
    try {
      const { downloadBlankScorecards, downloadRoundScorecards } = await import("@/lib/scorecards/download");
      if (kind === "rounds") await downloadRoundScorecards(source, selectedIds, `${competition.id}-scorecards.pdf`);
      else await downloadBlankScorecards(source, `${competition.id}-blank-scorecards.pdf`);
      setMessage("PDF generado.");
    } catch (error) {
      setMessage(error instanceof Error ? `No se pudo generar el PDF: ${error.message}` : "No se pudo generar el PDF.");
    } finally {
      setBusy(undefined);
    }
  }

  return <section className="printing-panel" id="print">
    <div className="setup-heading"><div><h2>Hojas de tiempos</h2><p>Mismo formato que Groupifier. Se generan con la propuesta actual, incluidos tus cambios.</p></div></div>
    <h3 className="panel-subheading">Formato</h3>
    <div className="printing-grid">
      <label className="field"><span>Idioma</span><select value={printing.language} onChange={event => set("language", event.target.value)}>{SCORECARD_LANGUAGES.filter(language => !UNSUPPORTED_SCORECARD_LANGUAGES.includes(language.code)).map(language => <option key={language.code} value={language.code}>{language.originalName}</option>)}</select></label>
      <label className="field"><span>Tamaño del papel</span><select value={printing.paperSize} onChange={event => set("paperSize", event.target.value as PrintingOptions["paperSize"])}><option value="a4">A4 (4 por hoja)</option><option value="a6">A6 (1 por hoja)</option><option value="letter">Carta (4 por hoja)</option></select></label>
      <label className="field"><span>Orden</span><select value={printing.order} onChange={event => set("order", event.target.value as PrintingOptions["order"])}><option value="natural">Natural</option><option value="stacked">Apilado (cortar el taco y queda en orden)</option></select></label>
      <label className="field"><span>Imagen de fondo (URL)</span><input type="url" value={printing.backgroundUrl} placeholder="https://…" onChange={event => set("backgroundUrl", event.target.value)} /></label>
    </div>
    <h3 className="panel-subheading">Contenido de las hojas</h3>
    <div className="option-list printing-options">{CHECKBOXES.map(({ key, label, help }) => <label key={key}><input type="checkbox" checked={printing[key] as boolean} onChange={event => set(key, event.target.checked as never)} /><span><strong>{label}</strong>{help && <small>{help}</small>}</span></label>)}</div>
    <p className="setup-note">La imagen de fondo se procesa con images.weserv.nl, como en Groupifier. Los nombres en escrituras no latinas, griegas o cirílicas se imprimen solo con el nombre latino.</p>
    <h3 className="panel-subheading">Qué imprimir</h3>
    <div className="print-rounds">
      <div className="print-rounds-head"><div><strong>Rondas a imprimir</strong><small>Vienen marcadas las rondas generadas. Las rondas sin generar se imprimen con los grupos previstos y sin nombres.</small></div><button className="plain" type="button" onClick={() => setChosen(selectedIds.length === printable.length ? [] : printable.map(round => round.id))}>{selectedIds.length === printable.length ? "Desmarcar todas" : "Marcar todas"}</button></div>
      <table className="print-table">
        <thead><tr><th>Prueba</th>{roundNumbers.map(number => <th key={number}>Ronda {number}</th>)}</tr></thead>
        <tbody>{eventIds.map(eventId => <tr key={eventId}>
          <th scope="row"><EventIcon eventId={eventId} label={EVENT_NAMES[eventId] ?? eventId} /><span>{EVENT_NAMES[eventId] ?? eventId}</span></th>
          {roundNumbers.map(number => {
            const round = rounds.find(item => item.eventId === eventId && item.roundNumber === number);
            if (!round) return <td key={number} className="none" />;
            const canPrint = printable.some(item => item.id === round.id);
            if (!canPrint) return <td key={number} className="none" title="Sin propuesta generada">—</td>;
            return <td key={number}><label><input type="checkbox" checked={chosen.includes(round.id)} onChange={event => setChosen(current => event.target.checked ? [...current, round.id] : current.filter(id => id !== round.id))} /><span>{withAssignments.has(round.id) ? "Generada" : "Sin generar"}</span></label></td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="print-actions">
      <button className="button primary" type="button" disabled={!selectedIds.length || !!busy} onClick={() => download("rounds")}>{busy === "rounds" ? "Generando…" : `Descargar hojas (${selectedIds.length} ${selectedIds.length === 1 ? "ronda" : "rondas"})`}</button>
      <button className="button secondary" type="button" disabled={!!busy} onClick={() => download("blank")}>{busy === "blank" ? "Generando…" : "Hojas en blanco"}</button>
      <span role="status">{message}</span>
    </div>
  </section>;
}
