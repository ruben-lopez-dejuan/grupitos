"use client";

import { useEffect, useMemo, useState } from "react";
import { Hint } from "@/components/hint";
import { useI18n } from "@/components/i18n";
import type { WcifPerson } from "@/lib/competition-store";
import { keyOf } from "@/lib/i18n";
import type { ProPeople } from "@/lib/pro/people";
import { applySheetImport, guessMapping, IDENTITIES, parseCsv, propertiesTemplate, spreadsheetIdFromUrl, type Identity, type SheetImportResult, type SheetMapping } from "@/lib/pro/sheet-import";

type Source = "google" | "csv";
type Status = { configured: boolean; email?: string } | { error: string };

/** Volunteer form import: read a Google Sheet (server, service account) or pasted CSV, then map columns. */
export function SheetImportPanel({ people, value, onApply }: { people: WcifPerson[]; value: ProPeople; onApply: (value: ProPeople) => void }) {
  const { t, tp } = useI18n();
  const [source, setSource] = useState<Source>("google");
  const [status, setStatus] = useState<Status>();
  const [url, setUrl] = useState("");
  const [range, setRange] = useState("");
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<string[][]>();
  const [mapping, setMapping] = useState<SheetMapping>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const template = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${propertiesTemplate(people, value)}`)}`, [people, value]);

  useEffect(() => {
    if (source !== "google" || status) return;
    fetch("/api/sheets").then(async response => setStatus(response.ok ? await response.json() : { error: response.status === 401 ? "unauthorized" : "google-error" })).catch(() => setStatus({ error: "google-error" }));
  }, [source, status]);

  function load(data: string[][]) {
    if (data.length < 2) return setMessage(t("sheetImport.empty"));
    setRows(data);
    setMapping(guessMapping(data[0]));
    setMessage("");
  }

  async function readGoogle() {
    const id = spreadsheetIdFromUrl(url);
    if (!id) return setMessage(t("sheetImport.badUrl"));
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sheets?${new URLSearchParams({ id, ...(range.trim() ? { range: range.trim() } : {}) })}`);
      const data = await response.json() as { rows?: string[][]; error?: string; email?: string };
      if (!response.ok) return setMessage(t(keyOf("sheetImport.errors", data.error ?? "google-error"), { email: data.email ?? "" }));
      load(data.rows ?? []);
    } catch {
      setMessage(t("sheetImport.errors.google-error", { email: "" }));
    } finally {
      setBusy(false);
    }
  }

  // What the import would do, row by row, before anything changes.
  const preview = useMemo(() => rows && mapping ? applySheetImport(rows, mapping, people, value) : undefined, [rows, mapping, people, value]);

  function apply() {
    if (!preview) return;
    onApply(preview.people);
    setMessage(summary(preview));
    setRows(undefined);
  }

  function summary(result: SheetImportResult) {
    const by = (identity: Identity) => result.outcomes.filter(item => item.result === "matched" && item.by === identity).length;
    return [
      t("sheetImport.matchedBy", { wcaId: by("wcaId"), registrantId: by("registrantId"), email: by("email"), name: by("name") }),
      result.created ? tp("sheetImport.created", result.created) : "",
      result.ambiguous.length ? `${tp("sheetImport.ambiguous", result.ambiguous.length)}: ${result.ambiguous.join(", ")}` : "",
      result.unmatched.length ? `${tp("sheetImport.unmatched", result.unmatched.length)}: ${result.unmatched.slice(0, 12).join(", ")}${result.unmatched.length > 12 ? "…" : ""}` : "",
    ].filter(Boolean).join(" · ");
  }

  const headers = rows?.[0] ?? [];
  const columnName = (index: number) => headers[index]?.trim() || t("sheetImport.column", { number: index + 1 });

  return <div className="sheet-import">
    <div className="sheet-import-head">
      <div className="round-subtabs" role="tablist">{(["google", "csv"] as Source[]).map(item => <button key={item} type="button" role="tab" aria-selected={source === item} className={source === item ? "active" : ""} onClick={() => { setSource(item); setRows(undefined); setMessage(""); }}>{t(keyOf("sheetImport.sources", item))}</button>)}</div>
      <a className="template-link" href={template} download="weights-template.csv">{t("sheetImport.template")}</a>
      <Hint align="end" text={t("sheetImport.templateHelp")} />
    </div>
    {!rows && (source === "google" ? <div className="sheet-source">
      <p className="sheet-status">{!status ? "…" : "error" in status ? t(keyOf("sheetImport.errors", status.error), { email: "" }) : status.configured ? t("sheetImport.shareWith", { email: status.email ?? "" }) : t("sheetImport.errors.not-configured", { email: "" })}</p>
      <form className="volunteer-form" onSubmit={event => { event.preventDefault(); readGoogle(); }}>
        <input className="wide" value={url} onChange={event => setUrl(event.target.value)} placeholder={t("sheetImport.url")} aria-label={t("sheetImport.url")} />
        <input value={range} onChange={event => setRange(event.target.value)} placeholder={t("sheetImport.range")} aria-label={t("sheetImport.range")} title={t("sheetImport.rangeHelp")} />
        <button className="button secondary" type="submit" disabled={busy || !url.trim()}>{busy ? t("sheetImport.reading") : t("sheetImport.read")}</button>
      </form>
    </div> : <div className="sheet-source">
      <textarea value={csv} onChange={event => setCsv(event.target.value)} placeholder={t("sheetImport.csvPlaceholder")} aria-label={t("sheetImport.csvPlaceholder")} rows={5} />
      <div className="volunteer-form">
        <label className="button secondary file-button">{t("sheetImport.file")}<input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={async event => { const file = event.target.files?.[0]; if (file) setCsv(await file.text()); }} /></label>
        <button className="button secondary" type="button" disabled={!csv.trim()} onClick={() => load(parseCsv(csv))}>{t("sheetImport.read")}</button>
      </div>
    </div>)}

    {rows && mapping && <div className="sheet-mapping">
      <p className="sheet-status">{tp("sheetImport.rows", rows.length - 1)}</p>
      <div className="sheet-identity"><strong>{t("sheetImport.matchOrder")} <Hint align="start" text={t("sheetImport.matchOrderHelp")} /></strong>
        {IDENTITIES.map((identity, order) => <label key={identity}><span>{order + 1}. {t(keyOf("sheetImport.match", identity))}</span>
          <select value={mapping.identity[identity] ?? ""} onChange={event => {
            const column = event.target.value === "" ? undefined : Number(event.target.value);
            const { [identity]: _old, ...rest } = mapping.identity;
            setMapping({ ...mapping, identity: column === undefined ? rest : { ...rest, [identity]: column }, propertyColumns: mapping.propertyColumns.filter(item => item !== column) });
          }} aria-label={t(keyOf("sheetImport.match", identity))}><option value="">—</option>{headers.map((_, index) => <option key={index} value={index}>{columnName(index)}</option>)}</select>
        </label>)}
      </div>
      <div className="sheet-columns"><strong>{t("sheetImport.asProperties")} <Hint align="start" text={t("sheetImport.asPropertiesHelp")} /></strong>
        {headers.map((_, index) => Object.values(mapping.identity).includes(index) ? null : <label key={index}><input type="checkbox" checked={mapping.propertyColumns.includes(index)} onChange={event => setMapping({ ...mapping, propertyColumns: event.target.checked ? [...mapping.propertyColumns, index].sort((a, b) => a - b) : mapping.propertyColumns.filter(column => column !== index) })} />{mapping.propertyNames?.[index] ?? columnName(index)}</label>)}
      </div>
      <div className="volunteer-form">
        <label><input type="checkbox" checked={mapping.clearMissing} onChange={event => setMapping({ ...mapping, clearMissing: event.target.checked })} /> {t("sheetImport.clearMissing")}</label>
        <label><input type="checkbox" checked={mapping.createVolunteers} disabled={mapping.identity.name === undefined} onChange={event => setMapping({ ...mapping, createVolunteers: event.target.checked })} /> {t("sheetImport.createVolunteers")}</label>
      </div>
      {preview && <div className="sheet-preview">
        <p className="sheet-status">{summary(preview)}</p>
        {preview.outcomes.some(item => item.result !== "matched" || item.by === "name") && <ul>{preview.outcomes.filter(item => item.result !== "matched" || item.by === "name").map(item => <li key={item.row} className={item.result}><small>{t("sheetImport.rowNumber", { row: item.row })}</small> {item.label} <em>{t(keyOf("sheetImport.outcomes", item.result === "matched" ? "byName" : item.result))}</em></li>)}</ul>}
      </div>}
      <div className="volunteer-form">
        <button className="button primary" type="button" onClick={apply}>{t("sheetImport.apply")}</button>
        <button className="plain" type="button" onClick={() => setRows(undefined)}>{t("sheetImport.cancel")}</button>
      </div>
    </div>}
    {message && <p className="sheet-status" role="status">{message}</p>}
  </div>;
}
