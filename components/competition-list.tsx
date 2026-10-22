"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { WcaCompetition } from "@/lib/wca";
import { getImportedCompetitionIds, saveCompetition, type StoredCompetition } from "@/lib/competition-store";

type State = "idle" | "importing" | "imported" | "error";
function dates(start: string, end: string) { const f = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); const a = f.format(new Date(`${start}T00:00:00Z`)); return start === end ? a : `${a} – ${f.format(new Date(`${end}T00:00:00Z`))}`; }

export function CompetitionList({ competitions }: { competitions: WcaCompetition[] }) {
  const router = useRouter();
  const [query, setQuery] = useState(""); const [states, setStates] = useState<Record<string, State>>({}); const [messages, setMessages] = useState<Record<string, string>>({});
  useEffect(() => { getImportedCompetitionIds().then((stored) => setStates(Object.fromEntries(stored.map(id => [id, "imported"])))).catch(() => undefined); }, []);
  const filtered = useMemo(() => competitions.filter(c => `${c.name} ${c.city_name ?? ""} ${c.id}`.toLowerCase().includes(query.toLowerCase().trim())), [competitions, query]);
  async function importCompetition(c: WcaCompetition) {
    setStates(s => ({ ...s, [c.id]: "importing" }));
    try { const response = await fetch(`/api/wca/competitions/${c.id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); await saveCompetition(data as StoredCompetition); setStates(s => ({ ...s, [c.id]: "imported" })); router.push(`/competition/${c.id}`); }
    catch (e) { setStates(s => ({ ...s, [c.id]: "error" })); setMessages(m => ({ ...m, [c.id]: e instanceof Error ? e.message : "No se pudo importar." })); }
  }
  return <>
    <div className="list-head"><div><p className="kicker">Competiciones</p><h1>Selecciona una competición</h1><p>Importaremos participantes, pruebas y horario desde la WCA.</p></div><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o ciudad" /></label></div>
    {filtered.length === 0 ? <div className="empty"><h2>No hay competiciones que mostrar</h2><p>{query ? "Prueba con otro término." : "La WCA no ha devuelto ninguna competición administrable."}</p></div> : <div className="competition-table"><div className="table-labels"><span>Competición</span><span>Fecha</span><span>Estado</span><span /></div>{filtered.map(c => { const state = states[c.id] ?? "idle"; return <article className="competition-row" key={c.id}><div><strong>{c.name}</strong><small>{c.city_name ?? "Ubicación por confirmar"}{c.country_iso2 ? ` · ${c.country_iso2}` : ""} · {c.id}</small></div><span>{dates(c.start_date, c.end_date)}</span><span className={state === "imported" ? "status-ready" : "status-new"}>{state === "imported" ? "Importada" : "Sin importar"}</span>{messages[c.id] && <p className={`feedback ${state}`}>{messages[c.id]}</p>}<button className="button row-button" disabled={state === "importing"} onClick={() => state === "imported" ? router.push(`/competition/${c.id}`) : importCompetition(c)}>{state === "importing" ? "Importando…" : state === "imported" ? "Abrir" : "Importar"}<span>→</span></button></article>; })}</div>}
  </>;
}
