"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCompetition, type StoredCompetition } from "@/lib/competition-store";

const EVENT_NAMES: Record<string, string> = {
  "222": "2×2×2", "333": "3×3×3", "444": "4×4×4", "555": "5×5×5", "666": "6×6×6", "777": "7×7×7",
  "333bf": "3×3 a ciegas", "333fm": "3×3 FMC", "333oh": "3×3 una mano", clock: "Clock", minx: "Megaminx",
  pyram: "Pyraminx", skewb: "Skewb", sq1: "Square-1", "444bf": "4×4 a ciegas", "555bf": "5×5 a ciegas", "333mbf": "3×3 multi-ciegas"
};

type RoundConfig = { id: string; eventId: string; label: string; competitors: number; groups: number; enabled: boolean };
type Preset = "simple" | "balanced" | "large";

function acceptedPeople(competition: StoredCompetition) {
  return (competition.persons ?? []).filter(person => person.registration?.status === "accepted" && person.registration.isCompeting !== false);
}

function initialRounds(competition: StoredCompetition, stations: number): RoundConfig[] {
  const people = acceptedPeople(competition);
  return (competition.events ?? []).flatMap(event => (event.rounds ?? []).map((round, index) => {
    const competitors = people.filter(person => person.registration?.eventIds?.includes(event.id)).length;
    return { id: round.id, eventId: event.id, label: `${EVENT_NAMES[event.id] ?? event.id} · Ronda ${index + 1}`, competitors: index === 0 ? competitors : 0, groups: Math.max(1, Math.ceil(Math.max(competitors, 1) / Math.max(stations * 2, 1))), enabled: index === 0 };
  }));
}

export function GroupWorkspace({ competitionId, userName }: { competitionId: string; userName: string }) {
  const [competition, setCompetition] = useState<StoredCompetition>();
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState(12);
  const [rooms, setRooms] = useState(1);
  const [preset, setPreset] = useState<Preset>("balanced");
  const [rounds, setRounds] = useState<RoundConfig[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [avoidConsecutive, setAvoidConsecutive] = useState(true);
  const [assignJudges, setAssignJudges] = useState(true);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    getCompetition(competitionId).then(data => {
      setCompetition(data);
      if (data) {
        const roomCount = data.schedule?.venues?.reduce((sum, venue) => sum + (venue.rooms?.length ?? 0), 0) ?? 1;
        setRooms(Math.max(roomCount, 1));
        setRounds(initialRounds(data, stations));
      }
    }).finally(() => setLoading(false));
  }, [competitionId]);

  const people = useMemo(() => competition ? acceptedPeople(competition) : [], [competition]);
  const activeRounds = rounds.filter(round => round.enabled);
  const totalGroups = activeRounds.reduce((sum, round) => sum + round.groups, 0);

  function updateGroups(id: string, delta: number) {
    setGenerated(false);
    setRounds(current => current.map(round => round.id === id ? { ...round, groups: Math.max(1, round.groups + delta) } : round));
  }

  function applyPreset(nextPreset: Preset) {
    setPreset(nextPreset);
    const multiplier = nextPreset === "simple" ? 2.5 : nextPreset === "large" ? 1.35 : 2;
    setRounds(current => current.map(round => ({ ...round, groups: Math.max(1, Math.ceil(Math.max(round.competitors, 1) / Math.max(Math.floor(stations * multiplier), 1))) })));
    setGenerated(false);
  }

  if (loading) return <main className="workspace-loading"><div /><p>Cargando datos de la competición…</p></main>;
  if (!competition) return <main className="missing-competition"><div><p className="kicker">No está importada</p><h1>No encontramos esta competición en el navegador</h1><p>Vuelve a la lista e importa el WCIF para empezar a crear los grupos.</p><Link className="button primary" href="/dashboard">Volver a competiciones</Link></div></main>;

  return <main className="workspace-shell">
    <aside className="workspace-sidebar">
      <Link className="product-mark" href="/dashboard"><span>EG</span><strong>Easy Groups</strong></Link>
      <div className="competition-switcher"><small>COMPETICIÓN ACTIVA</small><strong>{competition.shortName ?? competition.name}</strong><span>{competition.id}</span></div>
      <nav className="workspace-nav" aria-label="Secciones de la competición">
        <a className="done" href="#summary"><span>✓</span> Datos WCA</a>
        <a className="active" href="#groups"><span>2</span> Configurar grupos</a>
        <a href="#staff"><span>3</span> Asignar personal</a>
        <a href="#review"><span>4</span> Revisar</a>
        <a href="#export"><span>5</span> Publicar WCIF</a>
      </nav>
      <div className="sidebar-help"><strong>¿Algo no encaja?</strong><p>Puedes cambiar cada ronda de forma independiente.</p></div>
      <div className="sidebar-user"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>Cuenta WCA</small></div></div>
    </aside>

    <section className="workspace-main">
      <header className="workspace-topbar"><div><Link href="/dashboard">Competiciones</Link><span>/</span><strong>{competition.name}</strong></div><div className="sync-state"><i /> WCIF guardado en este dispositivo</div></header>
      <div className="workspace-content">
        <div className="page-title"><div><p className="kicker">Paso 2 de 5</p><h1>Configura los grupos</h1><p>Define la capacidad del recinto y ajusta solo las rondas que lo necesiten.</p></div><button className="button secondary" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? "Ocultar opciones" : "Opciones avanzadas"}</button></div>

        <section className="data-strip" id="summary">
          <div><small>Competidores aceptados</small><strong>{people.length}</strong></div><div><small>Pruebas</small><strong>{competition.events?.length ?? 0}</strong></div><div><small>Salas en el WCIF</small><strong>{competition.schedule?.venues?.reduce((sum, venue) => sum + (venue.rooms?.length ?? 0), 0) ?? 0}</strong></div><div><small>Rondas iniciales</small><strong>{activeRounds.length}</strong></div>
        </section>

        <section className="setup-panel">
          <div className="setup-heading"><div><h2>Configuración general</h2><p>Estas decisiones sirven como punto de partida para todas las pruebas.</p></div><span>Se puede cambiar después</span></div>
          <div className="setup-grid">
            <label><span>Estaciones por sala</span><div className="number-field"><button onClick={() => setStations(Math.max(1, stations - 1))}>−</button><strong>{stations}</strong><button onClick={() => setStations(stations + 1)}>+</button></div><small>Mesas disponibles simultáneamente</small></label>
            <label><span>Número de salas</span><div className="number-field"><button onClick={() => setRooms(Math.max(1, rooms - 1))}>−</button><strong>{rooms}</strong><button onClick={() => setRooms(rooms + 1)}>+</button></div><small>Áreas de competición independientes</small></label>
            <div className="preset-field"><span>Forma de trabajar</span><div className="segmented"><button className={preset === "simple" ? "selected" : ""} onClick={() => applyPreset("simple")}>Simple</button><button className={preset === "balanced" ? "selected" : ""} onClick={() => applyPreset("balanced")}>Equilibrada</button><button className={preset === "large" ? "selected" : ""} onClick={() => applyPreset("large")}>Gran campeonato</button></div><small>Ajusta el tamaño inicial de los grupos</small></div>
          </div>
          {showAdvanced && <div className="advanced-options" id="staff"><label><input type="checkbox" checked={avoidConsecutive} onChange={event => setAvoidConsecutive(event.target.checked)} /><span><strong>Evitar grupos consecutivos</strong><small>Reduce conflictos entre competir y trabajar.</small></span></label><label><input type="checkbox" checked={assignJudges} onChange={event => setAssignJudges(event.target.checked)} /><span><strong>Asignar jueces automáticamente</strong><small>Usa competidores de otros grupos como primera opción.</small></span></label></div>}
        </section>

        <section className="round-section" id="groups">
          <div className="section-heading"><div><h2>Grupos por ronda</h2><p>Las rondas posteriores se activarán cuando haya resultados o cupos definidos.</p></div><div className="group-total"><small>Total previsto</small><strong>{totalGroups} grupos</strong></div></div>
          <div className="round-table"><div className="round-table-head"><span>Ronda</span><span>Competidores</span><span>Grupos</span><span>Por grupo</span><span>Incluir</span></div>{rounds.map(round => <div className={`round-row ${round.enabled ? "" : "disabled"}`} key={round.id}><div><span className="event-code">{round.eventId}</span><strong>{round.label}</strong></div><span>{round.competitors || "Por definir"}</span><div className="mini-stepper"><button disabled={!round.enabled} onClick={() => updateGroups(round.id, -1)}>−</button><strong>{round.groups}</strong><button disabled={!round.enabled} onClick={() => updateGroups(round.id, 1)}>+</button></div><span>{round.competitors ? `≈ ${Math.ceil(round.competitors / round.groups)}` : "—"}</span><label className="switch"><input type="checkbox" checked={round.enabled} onChange={event => { setRounds(current => current.map(item => item.id === round.id ? { ...item, enabled: event.target.checked } : item)); setGenerated(false); }} /><i /></label></div>)}</div>
        </section>

        {generated && <section className="generated-summary" id="review"><div><span>✓</span><div><strong>Propuesta creada</strong><p>{people.length} competidores distribuidos en {totalGroups} grupos. El siguiente paso será revisar conflictos y asignar personal.</p></div></div><button className="button text-button">Ver propuesta →</button></section>}
      </div>
      <footer className="workspace-actions"><div><strong>{activeRounds.length} rondas activas</strong><span> · {totalGroups} grupos previstos</span></div><div><Link className="button secondary" href="/dashboard">Cambiar competición</Link><button className="button primary" onClick={() => { setGenerated(true); setTimeout(() => document.getElementById("review")?.scrollIntoView({ behavior: "smooth" }), 50); }}>Crear propuesta de grupos</button></div></footer>
    </section>
  </main>;
}
