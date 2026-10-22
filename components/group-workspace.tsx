"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { GroupReview } from "@/components/group-review";
import { PeoplePanel } from "@/components/people-panel";
import { PrintingPanel } from "@/components/printing-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import type { GeneratedAssignment } from "@/lib/assignments";
import { getCompetition, type StoredCompetition } from "@/lib/competition-store";
import { draftStorageKey, generationSignature, parseDraft, type Draft, type WorkspaceSettings } from "@/lib/draft";
import { DEFAULT_OPTIONS, generateAssignments, type AssignmentOptions } from "@/lib/group-generator";
import { isDelegate, peopleFromWcif } from "@/lib/people";
import { acceptedPeople, EVENT_NAMES, initialRounds, resuggestRounds, usesFixedStations, type RoundConfig, type SortingRule, type ZoneMode } from "@/lib/rounds";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import type { RoundRules } from "@/lib/validation";

const DEFAULT_STATIONS = 12;

const ZONE_MODES: Array<{ id: ZoneMode; label: string; help: string }> = [
  { id: "fixed", label: "Puestos fijos", help: "Cada competidor tiene un número de estación y cada grupo cabe en las estaciones." },
  { id: "waiting", label: "Sala de espera", help: "Grupos más grandes; los competidores entran cuando queda una estación libre." },
  { id: "mixed", label: "Espera en primeras rondas", help: "Sala de espera en las primeras rondas y puestos fijos en las siguientes." },
];

const SORTING_RULES: Array<{ id: SortingRule; label: string; help: string; recommended?: boolean }> = [
  { id: "scrambler-safe", label: "Mezcladores garantizados", recommended: true, help: "Simétrico y además estricto: solo mezclan personas con resultados oficiales en la prueba o de confianza, y los más rápidos repiten antes que poner a alguien sin experiencia." },
  { id: "symmetric", label: "Simétrico", help: "Pone a los mejores en grupos distintos, para que haya buenos mezcladores en cada grupo." },
  { id: "balanced", label: "Equilibrado", help: "Por ranking en 3×3, 2×2, OH, a ciegas, con los pies, Pyraminx, Skewb, Clock y Square-1; simétrico en el resto." },
  { id: "ranks", label: "Por ranking", help: "Del peor al mejor: los mejores compiten en el último grupo." },
  { id: "name-optimised", label: "Separar nombres repetidos", help: "Separa a quienes comparten nombre de pila, para evitar confusiones al llamar a los grupos." },
];

type OptionKey = Exclude<keyof AssignmentOptions, "sortingRule">;
const MAIN_OPTIONS: Array<{ key: OptionKey; label: string; help: string }> = [
  { key: "assignJudges", label: "Asignar jueces y runners", help: "Un juez por estación ocupada y los runners indicados en cada ronda. Si se desactiva, solo se asignan mezcladores." },
  { key: "avoidBeforeOwnGroup", label: "No favorecer trabajar justo antes de competir", help: "Se permite, pero se elige a otra persona cuando hay alternativa con la misma carga." },
  { key: "spreadDelegates", label: "Delegados en grupos distintos", help: "Reparte a delegados y delegados en prácticas para que no compitan todos a la vez." },
  { key: "normalTasksForDelegatesAndOrganizers", label: "Tareas normales a delegados y organizadores", help: "Si está desactivado, no juzgan, mezclan ni hacen de runner." },
  { key: "assignDelegateDuties", label: "Asignar tareas de delegado", help: "Un delegado de turno por grupo, entre los marcados en Personas y roles." },
  { key: "assignDataEntry", label: "Asignar data entry", help: "Una persona de data entry por grupo, entre quienes tienen ese rol." },
];
const MORE_OPTIONS: Array<{ key: OptionKey; label: string; help: string }> = [
  { key: "noTasksForNewcomers", label: "No asignar tareas a newcomers", help: "Solo se les asignan si no queda nadie más." },
  { key: "tasksForOwnEventsOnly", label: "Tareas solo en pruebas en las que se inscribió", help: "Jueces y runners: solo otras pruebas si no queda nadie más." },
  { key: "noRunningForForeigners", label: "No asignar runner a extranjeros", help: "Solo si no queda nadie más. Se compara con el país del recinto." },
];

function defaultSettings(competition: StoredCompetition): WorkspaceSettings {
  return {
    stations: DEFAULT_STATIONS,
    zoneMode: "waiting",
    rounds: initialRounds(competition, DEFAULT_STATIONS, "waiting"),
    options: DEFAULT_OPTIONS,
    people: peopleFromWcif(competition),
    printing: DEFAULT_PRINTING,
  };
}

export function GroupWorkspace({ competitionId, userName }: { competitionId: string; userName: string }) {
  const [competition, setCompetition] = useState<StoredCompetition>();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WorkspaceSettings>();
  const [proposal, setProposal] = useState<GeneratedAssignment[]>([]);
  const [generatedWith, setGeneratedWith] = useState<string>();
  /** Remounts the review (and resets its undo history) only when a new proposal is generated. */
  const [proposalVersion, setProposalVersion] = useState(0);
  const [roundTab, setRoundTab] = useState<"first" | "later">("first");
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  useEffect(() => {
    getCompetition(competitionId).then(data => {
      setCompetition(data);
      if (!data) return;
      const draft = parseDraft(localStorage.getItem(draftStorageKey(data.id)));
      const defaults = defaultSettings(data);
      setSettings(draft?.settings ? { ...defaults, ...draft.settings, options: { ...defaults.options, ...draft.settings.options }, printing: { ...defaults.printing, ...draft.settings.printing } } : defaults);
      if (draft) {
        setProposal(draft.assignments);
        setGeneratedWith(draft.generatedWith);
      }
    }).finally(() => setLoading(false));
  }, [competitionId]);

  useEffect(() => {
    if (!competition || !settings) return;
    const draft: Draft = { version: 3, settings, generatedWith, assignments: proposal };
    try {
      localStorage.setItem(draftStorageKey(competition.id), JSON.stringify(draft));
    } catch {
      // Storage can be full or blocked; the work stays in memory for this session.
    }
  }, [competition, settings, generatedWith, proposal]);

  const people = useMemo(() => competition ? acceptedPeople(competition) : [], [competition]);
  const signature = useMemo(() => settings ? generationSignature(settings) : "", [settings]);
  const roundRules = useMemo(() => {
    if (!settings) return {};
    const { people: roles, options, stations, zoneMode } = settings;
    const noNormalTasks = new Set([...(roles.roles.dataentry ?? []), ...(options.normalTasksForDelegatesAndOrganizers ? [] : [...(roles.roles.delegate ?? []), ...(roles.roles["trainee-delegate"] ?? []), ...(roles.roles.organizer ?? [])])]);
    return Object.fromEntries(settings.rounds.map(round => {
      const competitors = proposal.filter(item => item.roundId === round.id && item.inRound).length || round.competitors;
      return [round.id, {
        groups: round.groups,
        scramblers: round.scramblers,
        runners: round.runners,
        stations,
        fixedStations: usesFixedStations(round.roundNumber, competitors, stations, zoneMode),
        checkJudges: options.assignJudges,
        checkDelegates: options.assignDelegateDuties,
        checkDataEntry: options.assignDataEntry,
        noNormalTasks,
      } satisfies RoundRules];
    }));
  }, [settings, proposal]);
  const handleReviewChange = useCallback((next: GeneratedAssignment[]) => setProposal(next), []);

  if (loading) return <main className="workspace-loading"><div /><p>Cargando datos de la competición…</p></main>;
  if (!competition || !settings) return <main className="missing-competition"><div><p className="kicker">No está importada</p><h1>No encontramos esta competición en el navegador</h1><p>Vuelve a la lista e importa el WCIF para empezar a crear los grupos.</p><Link className="button primary" href="/dashboard">Volver a competiciones</Link></div></main>;

  const { stations, zoneMode, rounds, options } = settings;
  const update = (change: Partial<WorkspaceSettings>) => setSettings(current => current && { ...current, ...change });
  const setOption = (key: OptionKey, value: boolean) => update({ options: { ...options, [key]: value } });
  const changeZone = (next: { stations?: number; zoneMode?: ZoneMode }) => {
    const nextStations = next.stations ?? stations;
    const nextMode = next.zoneMode ?? zoneMode;
    update({ stations: nextStations, zoneMode: nextMode, rounds: resuggestRounds(rounds, nextStations, nextMode) });
  };
  const updateRound = (id: string, change: Partial<RoundConfig>) => update({ rounds: rounds.map(round => round.id === id ? { ...round, ...change } : round) });

  const activeRounds = rounds.filter(round => round.enabled);
  const firstRounds = rounds.filter(round => round.roundNumber === 1);
  const laterRounds = rounds.filter(round => round.roundNumber > 1);
  const totalGroups = activeRounds.reduce((sum, round) => sum + round.groups, 0);
  const roomCount = competition.schedule?.venues?.reduce((sum, venue) => sum + (venue.rooms?.length ?? 0), 0) ?? 0;
  const proposalOutdated = proposal.length > 0 && generatedWith !== undefined && generatedWith !== signature;
  const delegatesWithoutDuties = options.assignDelegateDuties && !settings.people.delegateDutyIds.some(key => isDelegate(settings.people, key));

  function createProposal() {
    if (!competition || !settings) return;
    if (proposal.length && !window.confirm("Se sustituirá la propuesta actual, incluidos los cambios hechos a mano. ¿Continuar?")) return;
    setProposal(generateAssignments({ competition, rounds: activeRounds, stations, zoneMode, people: settings.people, options }));
    setGeneratedWith(signature);
    setProposalVersion(version => version + 1);
    setTimeout(() => document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const shownRounds = roundTab === "first" ? firstRounds : laterRounds;

  return <main className="workspace-shell">
    <aside className="workspace-sidebar">
      <Link className="product-mark" href="/dashboard"><span>EG</span><strong>Easy Groups</strong></Link>
      <div className="competition-switcher"><small>COMPETICIÓN ACTIVA</small><strong>{competition.shortName ?? competition.name}</strong><span>{competition.id}</span></div>
      <nav className="workspace-nav" aria-label="Secciones de la competición">
        <a className="done" href="#summary"><span>✓</span> Datos WCA</a>
        <a className={proposal.length ? "done" : "active"} href="#setup"><span>{proposal.length ? "✓" : "2"}</span> Configurar grupos</a>
        {proposal.length ? <a className="active" href="#review"><span>3</span> Revisar y validar</a> : <span className="nav-pending"><span>3</span> Revisar y validar</span>}
        <a href="#print"><span>4</span> Hojas de tiempos</a>
        <span className="nav-pending" title="Todavía no disponible"><span>5</span> Publicar WCIF <small>Próximamente</small></span>
      </nav>
      <div className="sidebar-help"><strong>¿Algo no encaja?</strong><p>Puedes cambiar cada ronda de forma independiente.</p></div>
      <div className="sidebar-user"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>Cuenta WCA</small></div></div>
    </aside>

    <section className="workspace-main">
      <header className="workspace-topbar"><div><Link href="/dashboard">Competiciones</Link><span>/</span><strong>{competition.name}</strong></div><div className="workspace-topbar-actions"><div className="sync-state"><i /> Guardado en este dispositivo</div><ThemeToggle compact /></div></header>
      <div className="workspace-content">
        <div className="page-title" id="setup"><div><p className="kicker">Paso 2 de 5</p><h1>Configura los grupos</h1><p>Describe la zona de competición, elige cómo repartir y quién hace cada tarea.</p></div></div>

        <section className="data-strip" id="summary">
          <div><small>Competidores aceptados</small><strong>{people.length}</strong></div><div><small>Pruebas</small><strong>{competition.events?.length ?? 0}</strong></div><div><small>Salas en el WCIF</small><strong>{roomCount}</strong></div><div><small>Rondas activas</small><strong>{activeRounds.length}</strong></div>
        </section>

        <section className="setup-panel">
          <div className="setup-heading"><div><h2>Zona de competición</h2><p>Cambiar estos valores recalcula los grupos sugeridos de cada ronda.</p></div></div>
          <div className="setup-grid">
            <label><span>Estaciones</span><div className="number-field"><button aria-label="Quitar una estación" onClick={() => changeZone({ stations: Math.max(1, stations - 1) })}>−</button><strong>{stations}</strong><button aria-label="Añadir una estación" onClick={() => changeZone({ stations: stations + 1 })}>+</button></div><small>Mesas disponibles a la vez</small></label>
            <div className="preset-field"><span>Entrada de competidores</span><div className="segmented three">{ZONE_MODES.map(mode => <button key={mode.id} className={zoneMode === mode.id ? "selected" : ""} onClick={() => changeZone({ zoneMode: mode.id })}>{mode.label}</button>)}</div><small>{ZONE_MODES.find(mode => mode.id === zoneMode)?.help} Una ronda con tantos competidores como estaciones, o menos, usa siempre puestos fijos.</small></div>
          </div>
          {roomCount > 1 && <p className="setup-note">El WCIF tiene {roomCount} salas. Por ahora todos los grupos se generan para una única zona de competición.</p>}
        </section>

        <section className="rules-panel">
          <div className="setup-heading"><div><h2>Reglas de asignación</h2><p>Basadas en Groupifier. El reparto solo afecta a primeras rondas; las siguientes se ordenan por la ronda anterior.</p></div></div>
          <div className="sorting-rules" role="radiogroup" aria-label="Reparto de competidores">{SORTING_RULES.map(rule => <button key={rule.id} role="radio" aria-checked={options.sortingRule === rule.id} className={options.sortingRule === rule.id ? "selected" : ""} onClick={() => update({ options: { ...options, sortingRule: rule.id } })}><span className="preset-radio" /><span><strong>{rule.label}{rule.recommended && <em className="recommended">Recomendado</em>}</strong><small>{rule.help}</small></span></button>)}</div>
          <div className="option-list">{MAIN_OPTIONS.map(({ key, label, help }) => <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOption(key, event.target.checked)} /><span><strong>{label}</strong><small>{help}</small></span></label>)}</div>
          {delegatesWithoutDuties && <p className="setup-note warning-note">No hay ningún delegado marcado para hacer tareas de delegado. Márcalos en Personas y roles.</p>}
          <button className="plain more-toggle" type="button" aria-expanded={showMoreOptions} onClick={() => setShowMoreOptions(value => !value)}>{showMoreOptions ? "Menos opciones" : "Más opciones (Groupifier)"}</button>
          {showMoreOptions && <div className="option-list">{MORE_OPTIONS.map(({ key, label, help }) => <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOption(key, event.target.checked)} /><span><strong>{label}</strong><small>{help}</small></span></label>)}</div>}
        </section>

        <PeoplePanel people={people} settings={settings.people} onChange={next => update({ people: next })} delegateDuties={options.assignDelegateDuties} />

        <section className="round-section" id="groups">
          <div className="section-heading"><div><h2>Grupos por ronda</h2><p>{roundTab === "first" ? "Primeras rondas, con los inscritos de cada prueba." : "Previsión según la condición de clasificación. Se pueden generar cuando el WCIF tiene los clasificados."}</p></div><div className="group-total"><small>Total previsto</small><strong>{totalGroups} grupos</strong></div></div>
          <div className="round-subtabs" role="tablist"><button role="tab" aria-selected={roundTab === "first"} className={roundTab === "first" ? "active" : ""} onClick={() => setRoundTab("first")}>Primeras rondas <span>{firstRounds.length}</span></button><button role="tab" aria-selected={roundTab === "later"} className={roundTab === "later" ? "active" : ""} onClick={() => setRoundTab("later")}>Rondas siguientes <span>{laterRounds.length}</span></button></div>
          {shownRounds.length === 0 ? <p className="setup-note">No hay rondas siguientes en esta competición.</p> : <div className="round-table"><div className="round-table-head"><span>Ronda</span><span>Competidores</span><span>Entrada</span><span>Grupos</span><span>Mezcladores / grupo</span><span>Runners / grupo</span><span>Incluir</span></div>{shownRounds.map(round => {
            const fixed = usesFixedStations(round.roundNumber, round.competitors, stations, zoneMode);
            const canGenerate = round.competitorsKnown && round.competitors > 0;
            // Planned rounds stay readable: their configuration is used for nameless scorecards.
            return <div className={`round-row ${round.enabled || !canGenerate ? "" : "disabled"}`} key={round.id}>
              <div><EventIcon eventId={round.eventId} label={EVENT_NAMES[round.eventId] ?? round.eventId} /><div className="round-name"><strong>{round.label}</strong><small>{round.eventId}</small></div></div>
              <span>{round.competitorsKnown ? round.competitors : `≈ ${round.competitors}`}{!round.competitorsKnown && <small> previstos</small>}</span>
              <span>{fixed ? "Puestos fijos" : "Sala de espera"}</span>
              <Stepper label="grupos" value={round.groups} min={1} onChange={groups => updateRound(round.id, { groups })} />
              <Stepper label="mezcladores" value={round.scramblers} min={0} onChange={scramblers => updateRound(round.id, { scramblers })} />
              <Stepper label="runners" value={round.runners} min={0} disabled={!options.assignJudges} onChange={runners => updateRound(round.id, { runners })} />
              <label className="switch" title={canGenerate ? undefined : "Se podrá generar cuando el WCIF tenga los clasificados. La configuración se usa ya para las hojas de tiempos sin nombres."}><input type="checkbox" aria-label={`Incluir ${round.label}`} checked={round.enabled && canGenerate} disabled={!canGenerate} onChange={event => updateRound(round.id, { enabled: event.target.checked })} /><i /></label>
            </div>;
          })}</div>}
        </section>

        {proposalOutdated && <div className="outdated-note" role="status"><p><strong>La configuración ha cambiado desde que se generó la propuesta.</strong> La matriz se valida con la configuración actual. Vuelve a generar si quieres aplicarla al reparto.</p></div>}
        {proposal.length > 0 && <GroupReview key={proposalVersion} initialAssignments={proposal} rules={roundRules} eventNames={EVENT_NAMES} roomName={competition.schedule?.venues?.[0]?.rooms?.[0]?.name} onChange={handleReviewChange} />}

        <PrintingPanel competition={competition} rounds={rounds} assignments={proposal} stations={stations} zoneMode={zoneMode} printing={settings.printing} onChange={printing => update({ printing })} />
      </div>
      <footer className="workspace-actions"><div><strong>{activeRounds.length} rondas activas</strong><span> · {totalGroups} grupos previstos</span></div><div><Link className="button secondary" href="/dashboard">Cambiar competición</Link><button className="button primary" onClick={createProposal} disabled={!activeRounds.length}>{proposal.length ? "Volver a generar" : "Crear propuesta de grupos"}</button></div></footer>
    </section>
  </main>;
}

function Stepper({ label, value, min, disabled = false, onChange }: { label: string; value: number; min: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <div className="mini-stepper"><button disabled={disabled || value <= min} aria-label={`Quitar ${label}`} onClick={() => onChange(value - 1)}>−</button><strong aria-label={`${value} ${label}`}>{value}</strong><button disabled={disabled} aria-label={`Añadir ${label}`} onClick={() => onChange(value + 1)}>+</button></div>;
}
