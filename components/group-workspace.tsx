"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { GroupReview } from "@/components/group-review";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCompetition, type StoredCompetition } from "@/lib/competition-store";
import { generateAssignments, type GeneratedAssignment } from "@/lib/group-generator";

const EVENT_NAMES: Record<string, string> = {
  "222": "2×2×2", "333": "3×3×3", "444": "4×4×4", "555": "5×5×5", "666": "6×6×6", "777": "7×7×7",
  "333bf": "3×3 a ciegas", "333fm": "3×3 FMC", "333oh": "3×3 una mano", clock: "Clock", minx: "Megaminx",
  pyram: "Pyraminx", skewb: "Skewb", sq1: "Square-1", "444bf": "4×4 a ciegas", "555bf": "5×5 a ciegas", "333mbf": "3×3 multi-ciegas"
};

type RoundConfig = { id: string; eventId: string; label: string; competitors: number; groups: number; scramblers: number; enabled: boolean };
type Preset = "simple" | "scrambler-safe" | "custom";
type FlowMode = "fixed" | "waiting";

function acceptedPeople(competition: StoredCompetition) {
  return (competition.persons ?? []).filter(person => person.registration?.status === "accepted" && person.registration.isCompeting !== false);
}

function initialRounds(competition: StoredCompetition, stations: number): RoundConfig[] {
  const people = acceptedPeople(competition);
  return (competition.events ?? []).flatMap(event => (event.rounds ?? []).map((round, index) => {
    const competitors = people.filter(person => person.registration?.eventIds?.includes(event.id)).length;
    const groups = Math.max(1, Math.ceil(Math.max(competitors, 1) / Math.max(stations * 1.7, 1)));
    const groupSize = Math.ceil(competitors / groups);
    const scramblers = Math.max(1, Math.floor(1 + (Math.min(groupSize, stations) - 1) / 5));
    return { id: round.id, eventId: event.id, label: `${EVENT_NAMES[event.id] ?? event.id} · Ronda ${index + 1}`, competitors: index === 0 ? competitors : 0, groups, scramblers, enabled: index === 0 };
  }));
}

export function GroupWorkspace({ competitionId, userName }: { competitionId: string; userName: string }) {
  const [competition, setCompetition] = useState<StoredCompetition>();
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState(12);
  const [rooms, setRooms] = useState(1);
  const [preset, setPreset] = useState<Preset>("scrambler-safe");
  const [flowMode, setFlowMode] = useState<FlowMode>("waiting");
  const [trustedIds, setTrustedIds] = useState<string[]>([]);
  const [trustedCandidate, setTrustedCandidate] = useState("");
  const [rounds, setRounds] = useState<RoundConfig[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [avoidConsecutive, setAvoidConsecutive] = useState(true);
  const [assignJudges, setAssignJudges] = useState(true);
  const [proposal, setProposal] = useState<GeneratedAssignment[]>([]);

  useEffect(() => {
    getCompetition(competitionId).then(data => {
      setCompetition(data);
      if (data) {
        const roomCount = data.schedule?.venues?.reduce((sum, venue) => sum + (venue.rooms?.length ?? 0), 0) ?? 1;
        setRooms(Math.max(roomCount, 1));
        setRounds(initialRounds(data, stations));
        try {
          const savedDraft = localStorage.getItem(`wca-easy-groups:draft:${data.id}`);
          if (savedDraft) setProposal(JSON.parse(savedDraft) as GeneratedAssignment[]);
        } catch {
          localStorage.removeItem(`wca-easy-groups:draft:${data.id}`);
        }
      }
    }).finally(() => setLoading(false));
  }, [competitionId]);

  const people = useMemo(() => competition ? acceptedPeople(competition) : [], [competition]);
  const activeRounds = rounds.filter(round => round.enabled);
  const totalGroups = activeRounds.reduce((sum, round) => sum + round.groups, 0);
  const trustedPeople = people.filter(person => trustedIds.includes(String(person.registrantId ?? person.wcaId ?? person.name)));
  const coverageWarnings = activeRounds.filter(round => {
    const experienced = people.filter(person => person.personalBests?.some(best => best.eventId === round.eventId)).length;
    return experienced < round.scramblers * Math.min(round.groups, 2);
  });

  function updateGroups(id: string, delta: number) {
    setProposal([]);
    setRounds(current => current.map(round => round.id === id ? { ...round, groups: Math.max(1, round.groups + delta) } : round));
  }

  function applyPreset(nextPreset: Preset) {
    setPreset(nextPreset);
    const multiplier = nextPreset === "simple" ? 2.4 : nextPreset === "scrambler-safe" ? 1.7 : 2;
    setRounds(current => current.map(round => {
      const groups = Math.max(1, Math.ceil(Math.max(round.competitors, 1) / Math.max(Math.floor(stations * multiplier), 1)));
      const groupSize = Math.ceil(round.competitors / groups);
      return { ...round, groups, scramblers: Math.max(1, Math.floor(1 + (Math.min(groupSize, stations) - 1) / 5)) };
    }));
    setProposal([]);
  }

  function addTrustedPerson() {
    if (!trustedCandidate || trustedIds.includes(trustedCandidate)) return;
    setTrustedIds(current => [...current, trustedCandidate]);
    setTrustedCandidate("");
  }

  function createProposal() {
    if (!competition) return;
    const next = generateAssignments({
      competition,
      rounds: activeRounds,
      stations,
      fixedStations: flowMode === "fixed",
      trustedIds,
    });
    setProposal(next);
    setTimeout(() => document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  if (loading) return <main className="workspace-loading"><div /><p>Cargando datos de la competición…</p></main>;
  if (!competition) return <main className="missing-competition"><div><p className="kicker">No está importada</p><h1>No encontramos esta competición en el navegador</h1><p>Vuelve a la lista e importa el WCIF para empezar a crear los grupos.</p><Link className="button primary" href="/dashboard">Volver a competiciones</Link></div></main>;

  return <main className="workspace-shell">
    <aside className="workspace-sidebar">
      <Link className="product-mark" href="/dashboard"><span>EG</span><strong>Easy Groups</strong></Link>
      <div className="competition-switcher"><small>COMPETICIÓN ACTIVA</small><strong>{competition.shortName ?? competition.name}</strong><span>{competition.id}</span></div>
      <nav className="workspace-nav" aria-label="Secciones de la competición">
        <a className="done" href="#summary"><span>✓</span> Datos WCA</a>
        <a className={proposal.length ? "done" : "active"} href="#groups"><span>{proposal.length ? "✓" : "2"}</span> Configurar grupos</a>
        <a href="#staff"><span>3</span> Asignar personal</a>
        <a className={proposal.length ? "active" : ""} href="#review"><span>4</span> Revisar</a>
        <a href="#export"><span>5</span> Publicar WCIF</a>
      </nav>
      <div className="sidebar-help"><strong>¿Algo no encaja?</strong><p>Puedes cambiar cada ronda de forma independiente.</p></div>
      <div className="sidebar-user"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>Cuenta WCA</small></div></div>
    </aside>

    <section className="workspace-main">
      <header className="workspace-topbar"><div><Link href="/dashboard">Competiciones</Link><span>/</span><strong>{competition.name}</strong></div><div className="workspace-topbar-actions"><div className="sync-state"><i /> Guardado en este dispositivo</div><ThemeToggle compact /></div></header>
      <div className="workspace-content">
        <div className="page-title"><div><p className="kicker">Paso 2 de 5</p><h1>Configura los grupos</h1><p>Indica cómo funciona el recinto y elige las prioridades del reparto.</p></div><button className="button secondary" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? "Ocultar opciones" : "Opciones avanzadas"}</button></div>

        <section className="data-strip" id="summary">
          <div><small>Competidores aceptados</small><strong>{people.length}</strong></div><div><small>Pruebas</small><strong>{competition.events?.length ?? 0}</strong></div><div><small>Salas en el WCIF</small><strong>{competition.schedule?.venues?.reduce((sum, venue) => sum + (venue.rooms?.length ?? 0), 0) ?? 0}</strong></div><div><small>Rondas iniciales</small><strong>{activeRounds.length}</strong></div>
        </section>

        <section className="setup-panel">
          <div className="setup-heading"><div><h2>Funcionamiento del área</h2><p>Estas decisiones sirven como punto de partida para todas las pruebas.</p></div><span>Se puede cambiar después</span></div>
          <div className="setup-grid">
            <label><span>Estaciones por sala</span><div className="number-field"><button onClick={() => setStations(Math.max(1, stations - 1))}>−</button><strong>{stations}</strong><button onClick={() => setStations(stations + 1)}>+</button></div><small>Mesas disponibles simultáneamente</small></label>
            <label><span>Número de salas</span><div className="number-field"><button onClick={() => setRooms(Math.max(1, rooms - 1))}>−</button><strong>{rooms}</strong><button onClick={() => setRooms(rooms + 1)}>+</button></div><small>Áreas de competición independientes</small></label>
            <div className="preset-field"><span>Entrada de competidores</span><div className="segmented two"><button className={flowMode === "fixed" ? "selected" : ""} onClick={() => setFlowMode("fixed")}>Puestos fijos</button><button className={flowMode === "waiting" ? "selected" : ""} onClick={() => setFlowMode("waiting")}>Sala de espera</button></div><small>{flowMode === "fixed" ? "Cada competidor tendrá un número de estación." : "Los competidores entran cuando queda una estación libre."}</small></div>
          </div>
          {showAdvanced && <div className="advanced-options" id="staff"><label><input type="checkbox" checked={avoidConsecutive} onChange={event => setAvoidConsecutive(event.target.checked)} /><span><strong>Evitar grupos consecutivos</strong><small>Reduce conflictos entre competir y trabajar.</small></span></label><label><input type="checkbox" checked={assignJudges} onChange={event => setAssignJudges(event.target.checked)} /><span><strong>Asignar jueces automáticamente</strong><small>Usa competidores de otros grupos como primera opción.</small></span></label></div>}
        </section>

        <section className="rules-panel">
          <div className="setup-heading"><div><h2>Reglas de asignación</h2><p>Empieza con un preset y modifica después lo que necesites.</p></div><span>Aplicado a todas las rondas</span></div>
          <div className="preset-cards">
            <button className={preset === "simple" ? "selected" : ""} onClick={() => applyPreset("simple")}><span className="preset-radio" /><strong>Open sencillo</strong><p>Grupos de tamaño parecido y reparto básico de tareas.</p></button>
            <button className={preset === "scrambler-safe" ? "selected featured" : "featured"} onClick={() => applyPreset("scrambler-safe")}><span className="preset-radio" /><span className="recommended">Recomendado</span><strong>Mezcladores garantizados</strong><p>Reserva suficientes personas con buenos resultados para mezclar cada grupo.</p></button>
            <button className={preset === "custom" ? "selected" : ""} onClick={() => applyPreset("custom")}><span className="preset-radio" /><strong>Personalizado</strong><p>Control manual de prioridades y excepciones.</p></button>
          </div>
          {preset === "scrambler-safe" && <div className="rule-explanation"><div><strong>Qué hará el generador</strong><p>Repartirá a los mejores de forma simétrica y podrá asignar tareas antes o después de competir. Evitará únicamente trabajar en el grupo inmediatamente anterior al propio.</p></div><ul><li>Mejores resultados distribuidos entre grupos</li><li>≈ 1 mezclador por cada 5 estaciones</li><li>Personal de confianza con prioridad</li></ul></div>}
        </section>

        {preset === "scrambler-safe" && <section className="trusted-panel">
          <div className="setup-heading"><div><h2>Personal de confianza</h2><p>Estas personas tendrán prioridad para las tareas especializadas.</p></div><span>{trustedPeople.length} personas</span></div>
          <div className="trusted-body"><div className="trusted-picker"><select value={trustedCandidate} onChange={event => setTrustedCandidate(event.target.value)}><option value="">Selecciona un competidor…</option>{people.filter(person => !trustedIds.includes(String(person.registrantId ?? person.wcaId ?? person.name))).map(person => { const id = String(person.registrantId ?? person.wcaId ?? person.name); return <option key={id} value={id}>{person.name}{person.wcaId ? ` · ${person.wcaId}` : ""}</option>; })}</select><button className="button secondary" onClick={addTrustedPerson}>Añadir</button></div>{trustedPeople.length > 0 && <div className="trusted-chips">{trustedPeople.map(person => { const id = String(person.registrantId ?? person.wcaId ?? person.name); return <button key={id} onClick={() => setTrustedIds(current => current.filter(value => value !== id))}>{person.name}<span>×</span></button>; })}</div>}<div className={coverageWarnings.length === 0 ? "coverage-ok" : "coverage-warning"}><strong>{coverageWarnings.length === 0 ? "Experiencia suficiente" : `Revisar ${coverageWarnings.length} rondas`}</strong><p>{coverageWarnings.length === 0 ? "Hay suficientes competidores con resultados oficiales para rotar mezcladores en todos los grupos." : "Hay pruebas con poca gente experimentada. Podrás asignar mezcladores manualmente antes de generar."}</p></div></div>
        </section>}

        <section className="round-section" id="groups">
          <div className="section-heading"><div><h2>Grupos por ronda</h2><p>Las rondas posteriores se activarán cuando haya resultados o cupos definidos.</p></div><div className="group-total"><small>Total previsto</small><strong>{totalGroups} grupos</strong></div></div>
          <div className="round-table"><div className="round-table-head"><span>Ronda</span><span>Competidores</span><span>Grupos</span><span>Mezcladores</span><span>Incluir</span></div>{rounds.map(round => <div className={`round-row ${round.enabled ? "" : "disabled"}`} key={round.id}><div><EventIcon eventId={round.eventId} label={EVENT_NAMES[round.eventId] ?? round.eventId} /><div className="round-name"><strong>{round.label}</strong><small>{round.eventId}</small></div></div><span>{round.competitors || "Por definir"}</span><div className="mini-stepper"><button disabled={!round.enabled} onClick={() => updateGroups(round.id, -1)}>−</button><strong>{round.groups}</strong><button disabled={!round.enabled} onClick={() => updateGroups(round.id, 1)}>+</button></div><span>{round.scramblers} / grupo</span><label className="switch"><input type="checkbox" checked={round.enabled} onChange={event => { setRounds(current => current.map(item => item.id === round.id ? { ...item, enabled: event.target.checked } : item)); setProposal([]); }} /><i /></label></div>)}</div>
        </section>

        {proposal.length > 0 && <GroupReview key={proposal.map(item => item.id).join("|")} initialAssignments={proposal} eventNames={EVENT_NAMES} draftKey={competition.id} />}
      </div>
      <footer className="workspace-actions"><div><strong>{activeRounds.length} rondas activas</strong><span> · {totalGroups} grupos previstos</span></div><div><Link className="button secondary" href="/dashboard">Cambiar competición</Link><button className="button primary" onClick={createProposal}>{proposal.length ? "Volver a generar" : "Crear propuesta de grupos"}</button></div></footer>
    </section>
  </main>;
}
