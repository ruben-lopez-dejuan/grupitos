"use client";
import "flag-icons/css/flag-icons.min.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WcaCompetition } from "@/lib/wca";
import { getImportedCompetitionIds, saveCompetition, type StoredCompetition } from "@/lib/competition-store";

type State = "idle" | "importing" | "imported" | "error";
function dates(start: string, end: string) { const f = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); const a = f.format(new Date(`${start}T00:00:00Z`)); return start === end ? a : `${a} – ${f.format(new Date(`${end}T00:00:00Z`))}`; }
const countryNames = new Intl.DisplayNames(["es"], { type: "region" });
/** WCA codes for competitions held in several countries at once. */
const MULTIPLE_COUNTRIES: Record<string, string> = { XA: "Varios países de Asia", XE: "Varios países de Europa", XF: "Varios países de África", XM: "Varios países de América", XN: "Varios países de Norteamérica", XO: "Varios países de Oceanía", XS: "Varios países de Sudamérica", XW: "Varios países del mundo" };
function countryName(iso2?: string) { if (iso2 && MULTIPLE_COUNTRIES[iso2]) return MULTIPLE_COUNTRIES[iso2]; try { return iso2 ? countryNames.of(iso2) ?? iso2 : undefined; } catch { return iso2; } }
/** WCA uses XA, XE… for multi-country competitions; those have no flag. */
const hasFlag = (iso2?: string) => !!iso2 && /^[A-Z]{2}$/.test(iso2) && !iso2.startsWith("X");

export function CompetitionList({ competitions }: { competitions: WcaCompetition[] }) {
  const router = useRouter();
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
    try { const response = await fetch(`/api/wca/competitions/${c.id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); await saveCompetition(data as StoredCompetition); setStates(s => ({ ...s, [c.id]: "imported" })); router.push(`/competition/${c.id}`); }
    catch (e) { setStates(s => ({ ...s, [c.id]: "error" })); setMessages(m => ({ ...m, [c.id]: e instanceof Error ? e.message : "No se pudo importar." })); }
  }
  const row = (c: WcaCompetition) => { const state = states[c.id] ?? "idle"; return <article className="competition-row" key={c.id}><div><strong>{c.name}</strong><small>{hasFlag(c.country_iso2) && <span className={`fi fi-${c.country_iso2!.toLowerCase()} country-flag`} title={countryName(c.country_iso2)} aria-label={countryName(c.country_iso2)} />}{[c.city, countryName(c.country_iso2)].filter(Boolean).join(" · ")}</small></div><span>{dates(c.start_date, c.end_date)}</span><span className={state === "imported" ? "status-ready" : "status-new"}>{state === "imported" ? "Importada" : "Sin importar"}</span>{messages[c.id] && <p className={`feedback ${state}`}>{messages[c.id]}</p>}<button className="button row-button" disabled={state === "importing"} onClick={() => state === "imported" ? router.push(`/competition/${c.id}`) : importCompetition(c)}>{state === "importing" ? "Importando…" : state === "imported" ? "Abrir" : "Importar"}<span>→</span></button></article>; };
  const table = (items: WcaCompetition[]) => <div className="competition-table"><div className="table-labels"><span>Competición</span><span>Fecha</span><span>Estado</span><span /></div>{items.map(row)}</div>;
  return <>
    <div className="list-head"><div><p className="kicker">Competiciones</p><h1>Selecciona una competición</h1></div><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o ciudad" /></label></div>
    {upcoming.length > 0 ? table(upcoming) : <div className="empty"><h2>No hay competiciones próximas</h2><p>{query ? "Prueba con otro término." : "No administras ninguna competición futura."}</p></div>}
    {past.length > 0 && <div className="past-toggle"><button className="button secondary" type="button" aria-expanded={showPast} onClick={() => setShowPast(value => !value)}>{showPast ? "Ocultar competiciones pasadas" : `Ver competiciones pasadas (${past.length})`}</button></div>}
    {showPast && past.length > 0 && table(past)}
  </>;
}
