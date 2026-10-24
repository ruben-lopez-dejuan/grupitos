"use client";
import "flag-icons/css/flag-icons.min.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import type { WcaCompetition } from "@/lib/wca";
import { getImportedCompetitionIds, saveCompetition, type StoredCompetition } from "@/lib/competition-store";
import { draftStorageKey } from "@/lib/draft";
import { ResumeFromFile, storeSession, type ReadFile } from "@/components/resume-from-file";

type State = "idle" | "importing" | "imported" | "error";
function dates(start: string, end: string, locale: string) { const f = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); const a = f.format(new Date(`${start}T00:00:00Z`)); return start === end ? a : `${a} – ${f.format(new Date(`${end}T00:00:00Z`))}`; }
/** WCA codes for competitions held in several countries at once. */
const MULTIPLE_COUNTRIES = ["XA", "XE", "XF", "XM", "XN", "XO", "XS", "XW"];
/** WCA uses XA, XE… for multi-country competitions; those have no flag. */
const hasFlag = (iso2?: string) => !!iso2 && /^[A-Z]{2}$/.test(iso2) && !iso2.startsWith("X");

export function CompetitionList({ competitions }: { competitions: WcaCompetition[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const countryName = (iso2?: string) => {
    if (!iso2) return undefined;
    if (MULTIPLE_COUNTRIES.includes(iso2)) return t(keyOf("competitions.multiCountry", iso2));
    try { return new Intl.DisplayNames([locale], { type: "region" }).of(iso2) ?? iso2; } catch { return iso2; }
  };
  const [query, setQuery] = useState(""); const [states, setStates] = useState<Record<string, State>>({}); const [messages, setMessages] = useState<Record<string, string>>({});
  const [showPast, setShowPast] = useState(false);
  useEffect(() => { getImportedCompetitionIds().then((stored) => setStates(Object.fromEntries(stored.map(id => [id, "imported"])))).catch(() => undefined); }, []);
  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => competitions.filter(c => `${c.name} ${c.city ?? ""} ${c.id}`.toLowerCase().includes(query.toLowerCase().trim())), [competitions, query]);
  // Upcoming (and ongoing) competitions, soonest first; past ones, most recent first, on demand.
  const upcoming = filtered.filter(c => c.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = filtered.filter(c => c.end_date < today).sort((a, b) => b.start_date.localeCompare(a.start_date));
  async function importCompetition(c: WcaCompetition) {
    setStates(s => ({ ...s, [c.id]: "importing" }));
    try { const response = await fetch(`/api/wca/competitions/${c.id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error === "wca-status" ? t("competitions.errors.wcaStatus", { status: data.status }) : data.error === "unauthorized" ? t("competitions.errors.unauthorized") : data.error === "invalid-id" ? t("competitions.errors.invalidId") : t("competitions.errors.importFailed")); await saveCompetition(data as StoredCompetition); setStates(s => ({ ...s, [c.id]: "imported" })); router.push(`/competition/${c.id}`); }
    catch (e) { setStates(s => ({ ...s, [c.id]: "error" })); setMessages(m => ({ ...m, [c.id]: e instanceof Error ? e.message : t("competitions.errors.importFailed") })); }
  }
  /** A WCIF exported on another device: saved here with its draft, then opened. */
  async function openFromFile(read: ReadFile) {
    let local: string | null = null;
    try { local = localStorage.getItem(draftStorageKey(read.competition.id)); } catch { /* storage blocked */ }
    if (local && !window.confirm(t("resume.confirm"))) return undefined;
    await storeSession(read);
    router.push(`/competition/${read.competition.id}`);
    return undefined;
  }
  const row = (c: WcaCompetition) => { const state = states[c.id] ?? "idle"; return <article className="competition-row" key={c.id}><div><strong>{c.name}</strong><small>{hasFlag(c.country_iso2) && <span className={`fi fi-${c.country_iso2!.toLowerCase()} country-flag`} title={countryName(c.country_iso2)} aria-label={countryName(c.country_iso2)} />}{[c.city, countryName(c.country_iso2)].filter(Boolean).join(" · ")}</small></div><span>{dates(c.start_date, c.end_date, locale)}</span><span className={state === "imported" ? "status-ready" : "status-new"}>{state === "imported" ? t("competitions.imported") : t("competitions.notImported")}</span>{messages[c.id] && <p className={`feedback ${state}`}>{messages[c.id]}</p>}<button className="button row-button" disabled={state === "importing"} onClick={() => state === "imported" ? router.push(`/competition/${c.id}`) : importCompetition(c)}>{state === "importing" ? t("competitions.importing") : state === "imported" ? t("competitions.open") : t("competitions.import")}<span>→</span></button></article>; };
  const table = (items: WcaCompetition[]) => <div className="competition-table"><div className="table-labels"><span>{t("competitions.columnCompetition")}</span><span>{t("competitions.columnDate")}</span><span>{t("competitions.columnStatus")}</span><span /></div>{items.map(row)}</div>;
  return <>
    <div className="list-head"><div><p className="kicker">{t("competitions.kicker")}</p><h1>{t("competitions.title")}</h1></div><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("competitions.search")} /></label></div>
    <ResumeFromFile onRead={openFromFile} />
    {upcoming.length > 0 ? table(upcoming) : <div className="empty"><h2>{t("competitions.emptyTitle")}</h2><p>{query ? t("competitions.emptySearch") : t("competitions.emptyNone")}</p></div>}
    {past.length > 0 && <div className="past-toggle"><button className="button secondary" type="button" aria-expanded={showPast} onClick={() => setShowPast(value => !value)}>{showPast ? t("competitions.hidePast") : t("competitions.showPast", { count: past.length })}</button></div>}
    {showPast && past.length > 0 && table(past)}
  </>;
}
