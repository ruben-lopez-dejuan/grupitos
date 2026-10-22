"use client";

import { useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { Hint } from "@/components/hint";
import { useEventName, useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import type { GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import type { RoundConfig, ZoneMode } from "@/lib/rounds";
import type { PrintingOptions } from "@/lib/scorecards/options";
import { UNSUPPORTED_SCORECARD_LANGUAGES } from "@/lib/scorecards/scorecards";
import { SCORECARD_LANGUAGES } from "@/lib/scorecards/translations";

type OptionKey = Exclude<{ [K in keyof PrintingOptions]: PrintingOptions[K] extends boolean ? K : never }[keyof PrintingOptions], undefined>;

const CONTENT_OPTIONS: OptionKey[] = ["coverSheets", "localNamesFirst", "printOneName"];
/** Where the scramble checker box is printed. */
const CHECKER_OPTIONS: OptionKey[] = ["scrambleCheckerTopRanked", "scrambleCheckerFinalRounds", "scrambleCheckerBlank", "scrambleCheckerBigCubes"];

export function PrintingPanel({ competition, rounds, assignments, stations, zoneMode, printing, onChange }: {
  competition: StoredCompetition;
  rounds: RoundConfig[];
  assignments: GeneratedAssignment[];
  stations: number;
  zoneMode: ZoneMode;
  printing: PrintingOptions;
  onChange: (printing: PrintingOptions) => void;
}) {
  const { t, tp } = useI18n();
  const eventName = useEventName();
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

  const checkbox = (key: OptionKey) => {
    const help = t(keyOf("printing.options", `${key}.help`));
    return <label key={key}><input type="checkbox" checked={printing[key]} onChange={event => set(key, event.target.checked)} /><span><strong>{t(keyOf("printing.options", `${key}.label`))}{help && <Hint text={help} />}</strong></span></label>;
  };

  async function download(kind: "rounds" | "blank") {
    setBusy(kind);
    setMessage("");
    try {
      const { downloadBlankScorecards, downloadRoundScorecards } = await import("@/lib/scorecards/download");
      if (kind === "rounds") await downloadRoundScorecards(source, selectedIds, `${competition.id}-scorecards.pdf`);
      else await downloadBlankScorecards(source, `${competition.id}-blank-scorecards.pdf`);
      setMessage(t("printing.done"));
    } catch (error) {
      setMessage(error instanceof Error ? t("printing.failedWith", { error: error.message }) : t("printing.failed"));
    } finally {
      setBusy(undefined);
    }
  }

  return <section className="printing-panel" id="print">
    <div className="setup-heading"><h2>{t("printing.title")} <Hint align="start" text={t("printing.hint")} /></h2></div>
    <h3 className="panel-subheading">{t("printing.format")}</h3>
    <div className="printing-grid">
      <label className="field"><span>{t("printing.language")}</span><select value={printing.language} onChange={event => set("language", event.target.value)}>{SCORECARD_LANGUAGES.filter(language => !UNSUPPORTED_SCORECARD_LANGUAGES.includes(language.code)).map(language => <option key={language.code} value={language.code}>{language.originalName}</option>)}</select></label>
      <label className="field"><span>{t("printing.paper")}</span><select value={printing.paperSize} onChange={event => set("paperSize", event.target.value as PrintingOptions["paperSize"])}><option value="a4">{t("printing.paperA4")}</option><option value="a6">{t("printing.paperA6")}</option><option value="letter">{t("printing.paperLetter")}</option></select></label>
      <label className="field"><span>{t("printing.order")}</span><select value={printing.order} onChange={event => set("order", event.target.value as PrintingOptions["order"])}><option value="natural">{t("printing.orderNatural")}</option><option value="stacked">{t("printing.orderStacked")}</option></select></label>
      <label className="field"><span>{t("printing.background")} <Hint text={t("printing.backgroundHelp")} /></span><input type="url" value={printing.backgroundUrl} placeholder="https://…" onChange={event => set("backgroundUrl", event.target.value)} /></label>
    </div>
    <h3 className="panel-subheading">{t("printing.content")}</h3>
    <div className="option-list printing-options">{CONTENT_OPTIONS.map(checkbox)}</div>
    <h3 className="panel-subheading">{t("printing.checker")} <Hint align="start" text={t("printing.checkerHelp")} /></h3>
    <div className="option-list printing-options four">{CHECKER_OPTIONS.map(checkbox)}</div>
    <h3 className="panel-subheading">{t("printing.what")}</h3>
    <div className="print-rounds">
      <div className="print-rounds-head"><strong>{t("printing.roundsTitle")} <Hint align="start" text={t("printing.roundsHelp")} /></strong><button className="plain" type="button" onClick={() => setChosen(selectedIds.length === printable.length ? [] : printable.map(round => round.id))}>{selectedIds.length === printable.length ? t("printing.selectNone") : t("printing.selectAll")}</button></div>
      <table className="print-table">
        <thead><tr><th>{t("printing.columnEvent")}</th>{roundNumbers.map(number => <th key={number}>{t("printing.roundNumber", { number })}</th>)}</tr></thead>
        <tbody>{eventIds.map(eventId => <tr key={eventId}>
          <th scope="row"><EventIcon eventId={eventId} label={eventName(eventId)} /><span>{eventName(eventId)}</span></th>
          {roundNumbers.map(number => {
            const round = rounds.find(item => item.eventId === eventId && item.roundNumber === number);
            if (!round) return <td key={number} className="none" />;
            const canPrint = printable.some(item => item.id === round.id);
            if (!canPrint) return <td key={number} className="none" title={t("printing.noProposal")}>—</td>;
            return <td key={number}><label><input type="checkbox" checked={chosen.includes(round.id)} onChange={event => setChosen(current => event.target.checked ? [...current, round.id] : current.filter(id => id !== round.id))} /><span>{withAssignments.has(round.id) ? t("printing.generated") : t("printing.notGenerated")}</span></label></td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="print-actions">
      <button className="button primary" type="button" disabled={!selectedIds.length || !!busy} onClick={() => download("rounds")}><ScorecardIcon filled />{busy === "rounds" ? t("printing.generating") : tp("printing.download", selectedIds.length)}</button>
      <button className="button secondary" type="button" disabled={!!busy} onClick={() => download("blank")}><ScorecardIcon />{busy === "blank" ? t("printing.generating") : t("printing.blank")}</button>
      <span role="status">{message}</span>
    </div>
  </section>;
}

/** A small scorecard: name line and filled attempt rows, or an empty card. */
function ScorecardIcon({ filled = false }: { filled?: boolean }) {
  return <svg className="scorecard-icon" viewBox="0 0 16 20" width="14" height="18" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="14" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    {[8, 11, 14].map(y => <rect key={y} x="4" y={y} width="8" height="1.6" rx="0.8" fill="currentColor" opacity={filled ? 1 : 0.35} />)}
    <rect x="4" y="4" width={filled ? 8 : 5} height="2" rx="1" fill="currentColor" opacity={filled ? 1 : 0.35} />
  </svg>;
}
