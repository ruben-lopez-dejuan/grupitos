"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { GroupReview } from "@/components/group-review";
import { ThemeToggle } from "@/components/theme-toggle";
import type { GeneratedAssignment } from "@/lib/assignments";
import { getCompetition, type StoredCompetition } from "@/lib/competition-store";
import { draftStorageKey, generationSignature, parseDraft, type Draft, type WorkspaceSettings } from "@/lib/draft";
import { generateAssignments } from "@/lib/group-generator";
import { acceptedPeople, EVENT_NAMES, initialRounds, personKey, resuggestRounds, type FlowMode, type Preset, type RoundConfig } from "@/lib/rounds";
import type { RoundRules } from "@/lib/validation";

const DEFAULT_STATIONS = 12;

export function GroupWorkspace({ competitionId, userName }: { competitionId: string; userName: string }) {
  const [competition, setCompetition] = useState<StoredCompetition>();
  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [preset, setPreset] = useState<Preset>("scrambler-safe");
  const [flowMode, setFlowMode] = useState<FlowMode>("waiting");
  const [trustedIds, setTrustedIds] = useState<string[]>([]);
  const [trustedCandidate, setTrustedCandidate] = useState("");
  const [rounds, setRounds] = useState<RoundConfig[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [avoidBeforeOwnGroup, setAvoidBeforeOwnGroup] = useState(true);
  const [assignJudges, setAssignJudges] = useState(true);
  const [proposal, setProposal] = useState<GeneratedAssignment[]>([]);
  const [generatedWith, setGeneratedWith] = useState<string>();
  /** Remounts the review (and resets its undo history) only when a new proposal is generated. */
  const [proposalVersion, setProposalVersion] = useState(0);

  useEffect(() => {
    getCompetition(competitionId).then(data => {
      setCompetition(data);
      if (!data) return;
      const draft = parseDraft(localStorage.getItem(draftStorageKey(data.id)));
      if (draft?.settings) {
        const { settings } = draft;
        setStations(settings.stations);
        setPreset(settings.preset);
        setFlowMode(settings.flowMode);
        setTrustedIds(settings.trustedIds);
        setRounds(settings.rounds);
        setAvoidBeforeOwnGroup(settings.avoidBeforeOwnGroup);
        setAssignJudges(settings.assignJudges);
      } else {
        setRounds(initialRounds(data, DEFAULT_STATIONS, "waiting", "scrambler-safe"));
      }
      if (draft) {
        setProposal(draft.assignments);
        setGeneratedWith(draft.generatedWith);
      }
    }).finally(() => setLoading(false));
  }, [competitionId]);

  const settings: WorkspaceSettings = useMemo(() => ({ stations, flowMode, preset, trustedIds, rounds, avoidBeforeOwnGroup, assignJudges }), [stations, flowMode, preset, trustedIds, rounds, avoidBeforeOwnGroup, assignJudges]);
  const signature = useMemo(() => generationSignature(settings), [settings]);

  useEffect(() => {
    if (!competition) return;
    const draft: Draft = { version: 2, settings, generatedWith, assignments: proposal };
    try {
      localStorage.setItem(draftStorageKey(competition.id), JSON.stringify(draft));
    } catch {
      // Storage can be full or blocked; the work stays in memory for this session.
    }
  }, [competition, settings, generatedWith, proposal]);

  const people = useMemo(() => competition ? acceptedPeople(competition) : [], [competition]);
  const activeRounds = rounds.filter(round => round.enabled);
  const totalGroups = activeRounds.reduce((sum, round) => sum + round.groups, 0);
  const usesTrusted = preset !== "simple";
  const trustedPeople = people.filter(person => trustedIds.includes(personKey(person)));
  const roomCount = competition?.schedule?.venues?.reduce((sum, venue) => sum + (venue.rooms?.length ?? 0), 0) ?? 0;
  const proposalOutdated = proposal.length > 0 && generatedWith !== undefined && generatedWith !== signature;
  const coverageWarnings = activeRounds.filter(round => {
    const experienced = people.filter(person => person.registration?.eventIds?.includes(round.eventId) && person.personalBests?.some(best => best.eventId === round.eventId)).length;
    return experienced < round.scramblers * Math.min(round.groups, 2);
  });
  const roundRules = useMemo(() => Object.fromEntries(rounds.map(round => [round.id, {
    groups: round.groups,
    scramblers: round.scramblers,
    runners: round.runners,
    stations,
    fixedStations: flowMode === "fixed",
    checkJudges: assignJudges,
    avoidBeforeOwnGroup,
  } satisfies RoundRules])), [rounds, stations, flowMode, assignJudges, avoidBeforeOwnGroup]);
  const handleReviewChange = useCallback((next: GeneratedAssignment[]) => setProposal(next), []);

  function changeShape(next: { stations?: number; flowMode?: FlowMode; preset?: Preset }) {
    const nextStations = next.stations ?? stations;
    const nextFlow = next.flowMode ?? flowMode;
    const nextPreset = next.preset ?? preset;
    setStations(nextStations);
    setFlowMode(nextFlow);
    setPreset(nextPreset);
    setRounds(current => resuggestRounds(current, nextStations, nextFlow, nextPreset));
  }

  function updateRound(id: string, change: Partial<RoundConfig>) {
    setRounds(current => current.map(round => round.id === id ? { ...round, ...change } : round));
  }

  function addTrustedPerson() {
    if (!trustedCandidate || trustedIds.includes(trustedCandidate)) return;
    setTrustedIds(current => [...current, trustedCandidate]);
    setTrustedCandidate("");
  }

  function createProposal() {
    if (!competition) return;
    if (proposal.length && !window.confirm("Se sustituirá la propuesta actual, incluidos los cambios hechos a mano. ¿Continuar?")) return;
    const next = generateAssignments({
      competition,
      rounds: activeRounds,
      stations,
      fixedStations: flowMode === "fixed",
      trustedIds: usesTrusted ? trustedIds : [],
      avoidBeforeOwnGroup,
      assignJudges,
    });
    setProposal(next);
    setGeneratedWith(signature);
    setProposalVersion(version => version + 1);
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
        <a className={proposal.length ? "done" : "active"} href="#setup"><span>{proposal.length ? "✓" : "2"}</span> Configurar grupos</a>
        {proposal.length ? <a className="active" href="#review"><span>3</span> Revisar y validar</a> : <span className="nav-pending"><span>3</span> Revisar y validar</span>}
        <span className="nav-pending" title="Todavía no disponible"><span>4</span> Publicar WCIF <small>Próximamente</small></span>
      </nav>
      <div className="sidebar-help"><strong>¿Algo no encaja?</strong><p>Puedes cambiar cada ronda de forma independiente.</p></div>
      <div className="sidebar-user"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>Cuenta WCA</small></div></div>
    </aside>

    <section className="workspace-main">
      <header className="workspace-topbar"><div><Link href="/dashboard">Competiciones</Link><span>/</span><strong>{competition.name}</strong></div><div className="workspace-topbar-actions"><div className="sync-state"><i /> Guardado en este dispositivo</div><ThemeToggle compact /></div></header>
      <div className="workspace-content">
        <div className="page-title" id="setup"><div><p className="kicker">Paso 2 de 4</p><h1>Configura los grupos</h1><p>Indica cómo funciona el recinto y elige las prioridades del reparto.</p></div><button className="button secondary" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? "Ocultar opciones" : "Opciones avanzadas"}</button></div>

        <section className="data-strip" id="summary">
          <div><small>Competidores aceptados</small><strong>{people.length}</strong></div><div><small>Pruebas</small><strong>{competition.events?.length ?? 0}</strong></div><div><small>Salas en el WCIF</small><strong>{roomCount}</strong></div><div><small>Rondas activas</small><strong>{activeRounds.length}</strong></div>
        </section>

        <section className="setup-panel">
          <div className="setup-heading"><div><h2>Funcionamiento del área</h2><p>Estas decisiones sirven como punto de partida para todas las pruebas.</p></div><span>Recalcula los grupos sugeridos</span></div>
          <div className="setup-grid">
            <label><span>Estaciones</span><div className="number-field"><button aria-label="Quitar una estación" onClick={() => changeShape({ stations: Math.max(1, stations - 1) })}>−</button><strong>{stations}</strong><button aria-label="Añadir una estación" onClick={() => changeShape({ stations: stations + 1 })}>+</button></div><small>Mesas disponibles a la vez en el área de competición</small></label>
            <div className="preset-field"><span>Entrada de competidores</span><div className="segmented two"><button className={flowMode === "fixed" ? "selected" : ""} onClick={() => changeShape({ flowMode: "fixed" })}>Puestos fijos</button><button className={flowMode === "waiting" ? "selected" : ""} onClick={() => changeShape({ flowMode: "waiting" })}>Sala de espera</button></div><small>{flowMode === "fixed" ? "Cada competidor tendrá un número de estación y cada grupo cabe en las estaciones." : "Los grupos son más grandes y los competidores entran cuando queda una estación libre."}</small></div>
          </div>
          {roomCount > 1 && <p className="setup-note">El WCIF tiene {roomCount} salas. Por ahora todos los grupos se generan para una única área de competición.</p>}
          {showAdvanced && <div className="advanced-options" id="staff"><label><input type="checkbox" checked={avoidBeforeOwnGroup} onChange={event => setAvoidBeforeOwnGroup(event.target.checked)} /><span><strong>Evitar trabajar justo antes de competir</strong><small>Es una preferencia: se respeta cuando hay alternativas y nunca deja un grupo sin personal.</small></span></label><label><input type="checkbox" checked={assignJudges} onChange={event => setAssignJudges(event.target.checked)} /><span><strong>Asignar jueces y runners</strong><small>Un juez por estación ocupada y los runners indicados en cada ronda. Si se desactiva, solo se asignan mezcladores.</small></span></label></div>}
        </section>

        <section className="rules-panel">
          <div className="setup-heading"><div><h2>Reglas de asignación</h2><p>Empieza con un preset y modifica después lo que necesites.</p></div><span>Aplicado a todas las rondas</span></div>
          <div className="preset-cards">
            <button className={preset === "simple" ? "selected" : ""} onClick={() => changeShape({ preset: "simple" })}><span className="preset-radio" /><strong>Open sencillo</strong><p>Grupos de tamaño parecido y reparto básico de tareas.</p></button>
            <button className={preset === "scrambler-safe" ? "selected featured" : "featured"} onClick={() => changeShape({ preset: "scrambler-safe" })}><span className="preset-radio" /><span className="recommended">Recomendado</span><strong>Mezcladores garantizados</strong><p>Prioriza a quienes tienen buenos resultados y al personal de confianza para mezclar.</p></button>
            <button className={preset === "custom" ? "selected" : ""} onClick={() => { changeShape({ preset: "custom" }); setShowAdvanced(true); }}><span className="preset-radio" /><strong>Personalizado</strong><p>Ajusta tú los grupos, mezcladores, runners y el personal de confianza.</p></button>
          </div>
          {preset === "scrambler-safe" && <div className="rule-explanation"><div><strong>Qué hará el generador</strong><p>Repartirá a los mejores de forma simétrica y podrá asignar tareas antes o después de competir. Evitará, cuando haya alternativas, trabajar en el grupo inmediatamente anterior al propio.</p></div><ul><li>Mejores resultados distribuidos entre grupos</li><li>≈ 1 mezclador por cada 5 estaciones</li><li>Personal de confianza con prioridad para mezclar</li></ul></div>}
        </section>

        {usesTrusted && <section className="trusted-panel">
          <div className="setup-heading"><div><h2>Personal de confianza</h2><p>Estas personas tendrán prioridad para mezclar.</p></div><span>{trustedPeople.length} personas</span></div>
          <div className="trusted-body"><div className="trusted-picker"><select value={trustedCandidate} onChange={event => setTrustedCandidate(event.target.value)} aria-label="Competidor de confianza"><option value="">Selecciona un competidor…</option>{people.filter(person => !trustedIds.includes(personKey(person))).map(person => { const id = personKey(person); return <option key={id} value={id}>{person.name}{person.wcaId ? ` · ${person.wcaId}` : ""}</option>; })}</select><button className="button secondary" onClick={addTrustedPerson} disabled={!trustedCandidate}>Añadir</button></div>{trustedPeople.length > 0 && <div className="trusted-chips">{trustedPeople.map(person => { const id = personKey(person); return <button key={id} onClick={() => setTrustedIds(current => current.filter(value => value !== id))} aria-label={`Quitar a ${person.name}`}>{person.name}<span>×</span></button>; })}</div>}<div className={coverageWarnings.length === 0 ? "coverage-ok" : "coverage-warning"}><strong>{coverageWarnings.length === 0 ? "Experiencia suficiente" : `Revisar ${coverageWarnings.length} rondas`}</strong><p>{coverageWarnings.length === 0 ? "Hay suficientes competidores con resultados oficiales para rotar mezcladores en todos los grupos." : "Hay pruebas con poca gente experimentada. Podrás corregir los mezcladores en la matriz después de generar."}</p></div></div>
        </section>}

        <section className="round-section" id="groups">
          <div className="section-heading"><div><h2>Grupos por ronda</h2><p>Las rondas posteriores se podrán preparar cuando haya resultados de la anterior.</p></div><div className="group-total"><small>Total previsto</small><strong>{totalGroups} grupos</strong></div></div>
          <div className="round-table"><div className="round-table-head"><span>Ronda</span><span>Competidores</span><span>Grupos</span><span>Mezcladores / grupo</span><span>Runners / grupo</span><span>Incluir</span></div>{rounds.map(round => {
            const later = round.roundNumber > 1;
            return <div className={`round-row ${round.enabled ? "" : "disabled"}`} key={round.id}>
              <div><EventIcon eventId={round.eventId} label={EVENT_NAMES[round.eventId] ?? round.eventId} /><div className="round-name"><strong>{round.label}</strong><small>{round.eventId}</small></div></div>
              <span>{later ? "Según resultados" : round.competitors}</span>
              <Stepper label="grupos" value={round.groups} min={1} disabled={!round.enabled} onChange={groups => updateRound(round.id, { groups })} />
              <Stepper label="mezcladores" value={round.scramblers} min={0} disabled={!round.enabled} onChange={scramblers => updateRound(round.id, { scramblers })} />
              <Stepper label="runners" value={round.runners} min={0} disabled={!round.enabled || !assignJudges} onChange={runners => updateRound(round.id, { runners })} />
              <label className="switch" title={later ? "Disponible cuando haya resultados de la ronda anterior" : undefined}><input type="checkbox" aria-label={`Incluir ${round.label}`} checked={round.enabled} disabled={later} onChange={event => updateRound(round.id, { enabled: event.target.checked })} /><i /></label>
            </div>;
          })}</div>
        </section>

        {proposalOutdated && <div className="outdated-note" role="status"><p><strong>La configuración ha cambiado desde que se generó la propuesta.</strong> La matriz se valida con la configuración actual. Vuelve a generar si quieres aplicarla al reparto.</p></div>}
        {proposal.length > 0 && <GroupReview key={proposalVersion} initialAssignments={proposal} rules={roundRules} eventNames={EVENT_NAMES} roomName={competition.schedule?.venues?.[0]?.rooms?.[0]?.name} onChange={handleReviewChange} />}
      </div>
      <footer className="workspace-actions"><div><strong>{activeRounds.length} rondas activas</strong><span> · {totalGroups} grupos previstos</span></div><div><Link className="button secondary" href="/dashboard">Cambiar competición</Link><button className="button primary" onClick={createProposal} disabled={!activeRounds.length}>{proposal.length ? "Volver a generar" : "Crear propuesta de grupos"}</button></div></footer>
    </section>
  </main>;
}

function Stepper({ label, value, min, disabled, onChange }: { label: string; value: number; min: number; disabled: boolean; onChange: (value: number) => void }) {
  return <div className="mini-stepper"><button disabled={disabled || value <= min} aria-label={`Quitar ${label}`} onClick={() => onChange(value - 1)}>−</button><strong aria-label={`${value} ${label}`}>{value}</strong><button disabled={disabled} aria-label={`Añadir ${label}`} onClick={() => onChange(value + 1)}>+</button></div>;
}
