"use client";
import { useEffect, useMemo, useState } from "react";
import type { WcaCompetition } from "@/lib/wca";

type State = "idle" | "importing" | "imported" | "error";
type Wcif = { id: string; persons?: Array<{ registration?: { status?: string; isCompeting?: boolean } }>; events?: unknown[] };
const DB = "wca-easy-groups", STORE = "competitions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function save(wcif: Wcif) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put({ ...wcif, importedAt: new Date().toISOString() }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
async function ids() { const db = await openDb(); const result = await new Promise<string[]>((resolve, reject) => { const r = db.transaction(STORE).objectStore(STORE).getAllKeys(); r.onsuccess = () => resolve(r.result.map(String)); r.onerror = () => reject(r.error); }); db.close(); return result; }
function dates(start: string, end: string) { const f = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); const a = f.format(new Date(`${start}T00:00:00Z`)); return start === end ? a : `${a} – ${f.format(new Date(`${end}T00:00:00Z`))}`; }

export function CompetitionList({ competitions }: { competitions: WcaCompetition[] }) {
  const [query, setQuery] = useState(""); const [states, setStates] = useState<Record<string, State>>({}); const [messages, setMessages] = useState<Record<string, string>>({});
  useEffect(() => { ids().then((stored) => setStates(Object.fromEntries(stored.map(id => [id, "imported"])))).catch(() => undefined); }, []);
  const filtered = useMemo(() => competitions.filter(c => `${c.name} ${c.city_name ?? ""} ${c.id}`.toLowerCase().includes(query.toLowerCase().trim())), [competitions, query]);
  async function importCompetition(c: WcaCompetition) {
    setStates(s => ({ ...s, [c.id]: "importing" }));
    try { const response = await fetch(`/api/wca/competitions/${c.id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); await save(data); const competitors = (data as Wcif).persons?.filter(p => p.registration?.status === "accepted" && p.registration.isCompeting !== false).length ?? 0; setStates(s => ({ ...s, [c.id]: "imported" })); setMessages(m => ({ ...m, [c.id]: `${competitors} competidores y ${(data as Wcif).events?.length ?? 0} pruebas importados` })); }
    catch (e) { setStates(s => ({ ...s, [c.id]: "error" })); setMessages(m => ({ ...m, [c.id]: e instanceof Error ? e.message : "No se pudo importar." })); }
  }
  return <>
    <div className="list-head"><div><p className="eyebrow">TUS COMPETICIONES</p><h1>Elige por dónde empezar</h1><p>Solo aparecen competiciones que puedes administrar en la WCA.</p></div><label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar competición" /></label></div>
    {filtered.length === 0 ? <div className="empty"><span>◇</span><h2>No hemos encontrado competiciones</h2><p>{query ? "Prueba con otro término." : "La WCA no ha devuelto ninguna competición administrable."}</p></div> : <div className="grid">{filtered.map(c => { const state = states[c.id] ?? "idle"; return <article className="card" key={c.id}><i className="accent" /><div className="card-top"><span>{c.id}</span>{state === "imported" && <b>✓ Importada</b>}</div><h2>{c.name}</h2><div className="meta"><p>📍 {c.city_name ?? "Ubicación por confirmar"}{c.country_iso2 ? `, ${c.country_iso2}` : ""}</p><p>▣ {dates(c.start_date, c.end_date)}</p></div>{messages[c.id] && <p className={`feedback ${state}`}>{messages[c.id]}</p>}<button className="button card-button" disabled={state === "importing"} onClick={() => importCompetition(c)}>{state === "importing" ? "Importando…" : state === "imported" ? "Actualizar datos" : "Importar competición"}<span>→</span></button></article>; })}</div>}
  </>;
}
