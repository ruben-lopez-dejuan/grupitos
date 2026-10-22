"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { GroupReview } from "@/components/group-review";
import { Hint } from "@/components/hint";
import { PeoplePanel } from "@/components/people-panel";
import { PrintingPanel } from "@/components/printing-panel";
import { SortingRuleIcon } from "@/components/rule-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { TASK_CODES, type GeneratedAssignment, type TaskRole } from "@/lib/assignments";
import { getCompetition, type StoredCompetition } from "@/lib/competition-store";
import { draftStorageKey, generationSignature, parseDraft, type Draft, type WorkspaceSettings } from "@/lib/draft";
import { DEFAULT_OPTIONS, generateAssignments, groupSizes, type AssignmentOptions } from "@/lib/group-generator";
import { isDelegate, peopleFromWcif } from "@/lib/people";
import { acceptedPeople, EVENT_NAMES, personKey, initialRounds, resuggestRounds, usesFixedStations, type RoundConfig, type SortingRule, type ZoneMode } from "@/lib/rounds";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import type { RoundRules } from "@/lib/validation";

const DEFAULT_STATIONS = 12;

type Tab = "zone" | "rules" | "people" | "rounds" | "review" | "print";
const TABS: Tab[] = ["zone", "rules", "people", "rounds", "review", "print"];
const PHOTOS_KEY = "wca-easy-groups:show-photos";

const ZONE_MODES: Array<{ id: ZoneMode; label: string; help: string }> = [
  { id: "fixed", label: "Puestos fijos", help: "Cada competidor tiene un número de estación y cada grupo cabe en las estaciones." },
  { id: "waiting", label: "Sala de espera", help: "Grupos más grandes; los competidores entran cuando queda una estación libre." },
  { id: "mixed", label: "Espera en primeras rondas", help: "Sala de espera en las primeras rondas y puestos fijos en las siguientes." },
];

const SORTING_RULES: Array<{ id: SortingRule; label: string; short: string; help: string; recommended?: boolean }> = [
  { id: "scrambler-safe", label: "Mezcladores garantizados", short: "Simétrico, con mezcladores expertos", recommended: true, help: "Simétrico y además estricto: solo mezclan personas con resultados oficiales en la prueba o de confianza, y los más rápidos repiten antes que poner a alguien sin experiencia." },
  { id: "symmetric", label: "Simétrico", short: "Los mejores, repartidos", help: "Pone a los mejores en grupos distintos, para que haya buenos mezcladores en cada grupo." },
  { id: "balanced", label: "Equilibrado", short: "Ranking o simétrico según prueba", help: "Por ranking en 3×3, 2×2, OH, a ciegas, con los pies, Pyraminx, Skewb, Clock y Square-1; simétrico en el resto." },
  { id: "ranks", label: "Por ranking", short: "Los mejores, al final", help: "Del peor al mejor: los mejores compiten en el último grupo." },
  { id: "name-optimised", label: "Separar nombres", short: "Nombres repetidos, separados", help: "Separa a quienes comparten nombre de pila, para evitar confusiones al llamar a los grupos." },
];

type OptionKey = Exclude<keyof AssignmentOptions, "sortingRule">;
const MAIN_OPTIONS: Array<{ key: OptionKey; label: string; help: string; codes?: TaskRole[] }> = [
  { key: "assignJudges", codes: ["judge", "runner"], label: "Jueces y runners", help: "Un juez por estación ocupada y los runners indicados en cada ronda. Si se desactiva, solo se asignan mezcladores." },
  { key: "avoidBeforeOwnGroup", label: "Evitar trabajar justo antes", help: "No favorece trabajar en el grupo inmediatamente anterior al propio. Se permite, pero se elige a otra persona cuando hay alternativa con la misma carga." },
  { key: "spreadDelegates", label: "Delegados en grupos distintos", help: "Reparte a delegados y delegados en prácticas para que no compitan todos a la vez." },
  { key: "normalTasksForDelegatesAndOrganizers", label: "Tareas a delegados y organizadores", help: "Juzgar, mezclar y hacer de runner. Si está desactivado, delegados, delegados en prácticas y organizadores no reciben estas tareas." },
  { key: "assignDelegateDuties", codes: ["delegate"], label: "Delegado de turno", help: "Un delegado de turno por grupo, entre los marcados en Personas y roles." },
  { key: "assignDataEntry", codes: ["dataentry"], label: "Data entry por grupo", help: "Una persona de data entry por grupo, entre quienes tienen ese rol." },
];
const MORE_OPTIONS: Array<{ key: OptionKey; label: string; help: string }> = [
  { key: "noTasksForNewcomers", label: "Evitar tareas a newcomers", help: "Solo se asignan tareas a quien no tiene WCA ID si no queda nadie más." },
  { key: "tasksForOwnEventsOnly", label: "Tareas solo en sus pruebas", help: "Jueces y runners: solo otras pruebas si no queda nadie más." },
  { key: "noRunningForForeigners", label: "Evitar runners extranjeros", help: "Solo si no queda nadie más. Se compara el país de la persona con el del recinto." },
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
  const [tab, setTab] = useState<Tab>("zone");
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

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

  // Showing photos is a per-viewer preference, kept in this browser only.
  useEffect(() => {
    try { setShowPhotos(localStorage.getItem(PHOTOS_KEY) === "1"); } catch { /* storage blocked: photos stay off */ }
  }, []);

  const changeShowPhotos = useCallback((show: boolean) => {
    setShowPhotos(show);
    try { localStorage.setItem(PHOTOS_KEY, show ? "1" : "0"); } catch { /* storage blocked: the choice lasts this visit */ }
  }, []);

  // The open tab lives in the URL hash, so reloading keeps it.
  useEffect(() => {
    const readHash = () => {
      const fromHash = location.hash.slice(1) as Tab;
      if (TABS.includes(fromHash)) setTab(fromHash);
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const changeTab = useCallback((next: Tab) => {
    setTab(next);
    history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0 });
  }, []);

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
  const roleLabels = useMemo(() => {
    const labels: Record<string, string[]> = {};
    if (!settings) return labels;
    const add = (keys: string[] | undefined, label: string) => keys?.forEach(key => { labels[key] = [...(labels[key] ?? []), label]; });
    add(settings.people.roles.delegate, "Delegado");
    add(settings.people.roles["trainee-delegate"], "Delegado en prácticas");
    add(settings.people.roles.organizer, "Organización");
    add(settings.people.roles.staff, "Staff");
    add(settings.people.roles.dataentry, "Data entry");
    add(settings.people.trustedIds, "Confianza");
    return labels;
  }, [settings]);
  const photos = useMemo(() => Object.fromEntries((competition?.persons ?? []).map(person => [personKey(person), person.avatar?.thumbUrl])), [competition]);
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
    changeTab("review");
  }

  const shownRounds = roundTab === "first" ? firstRounds : laterRounds;
  // Excluded rounds (known competitors, switched off) go to the bottom, greyed out.
  const isExcluded = (round: RoundConfig) => round.competitorsKnown && round.competitors > 0 && !round.enabled;
  const orderedRounds = [...shownRounds.filter(round => !isExcluded(round)), ...shownRounds.filter(isExcluded)];
  const tabs: Array<{ id: Tab; label: string; done?: boolean; disabled?: boolean }> = [
    { id: "zone", label: "Zona de competición" },
    { id: "rules", label: "Reglas de asignación" },
    { id: "people", label: "Personas y roles" },
    { id: "rounds", label: "Grupos por ronda" },
    { id: "review", label: "Revisar y validar", done: proposal.length > 0, disabled: proposal.length === 0 },
    { id: "print", label: "Hojas de tiempos" },
  ];
  const outdatedNote = proposalOutdated && <div className="outdated-note" role="status"><p><strong>Has cambiado la configuración.</strong> Vuelve a generar para aplicarla.</p></div>;

  return <main className="workspace-shell">
    <aside className="workspace-sidebar">
      <Link className="product-mark" href="/dashboard"><span>EG</span><strong>Easy Groups</strong></Link>
      <div className="competition-switcher"><small>COMPETICIÓN ACTIVA</small><strong>{competition.shortName ?? competition.name}</strong><span>{competition.id}</span></div>
      <nav className="workspace-nav" aria-label="Secciones de la competición">
        {tabs.map((item, index) => <button key={item.id} type="button" className={tab === item.id ? "active" : item.done ? "done" : ""} disabled={item.disabled} aria-current={tab === item.id ? "page" : undefined} onClick={() => changeTab(item.id)}><span>{item.done && tab !== item.id ? "✓" : index + 1}</span> {item.label}</button>)}
        <span className="nav-pending" title="Todavía no disponible"><span>{tabs.length + 1}</span> Publicar WCIF <small>Próximamente</small></span>
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-user"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>Cuenta WCA</small></div></div>
    </aside>

    <section className="workspace-main">
      <header className="workspace-topbar"><div><Link href="/dashboard">Competiciones</Link><span>/</span><strong>{competition.name}</strong></div><div className="workspace-topbar-actions"><div className="sync-state"><i /> Guardado en este dispositivo</div><ThemeToggle compact /></div></header>
      <nav className="workspace-tabs" role="tablist" aria-label="Secciones">
        {tabs.map(item => <button key={item.id} role="tab" type="button" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} disabled={item.disabled} title={item.disabled ? "Genera una propuesta primero" : undefined} onClick={() => changeTab(item.id)}>{item.label}</button>)}
      </nav>
      <div className="workspace-content">
        {tab === "zone" && <>
          <section className="data-strip" id="summary">
            <div><small>Competidores aceptados</small><strong>{people.length}</strong></div><div><small>Pruebas</small><strong>{competition.events?.length ?? 0}</strong></div><div><small>Salas en el WCIF</small><strong>{roomCount}</strong></div><div><small>Rondas activas</small><strong>{activeRounds.length}</strong></div>
          </section>
          <section className="setup-panel">
            <div className="setup-heading"><h2>Zona de competición <Hint align="start" text="Cambiar estos valores recalcula los grupos sugeridos de cada ronda. Una ronda con tantos competidores como estaciones, o menos, usa siempre puestos fijos." /></h2></div>
            <div className="setup-grid">
              <label><span>Estaciones</span><div className="number-field"><button aria-label="Quitar una estación" onClick={() => changeZone({ stations: Math.max(1, stations - 1) })}>−</button><strong>{stations}</strong><button aria-label="Añadir una estación" onClick={() => changeZone({ stations: stations + 1 })}>+</button></div></label>
              <div className="preset-field"><span>Entrada de competidores</span><div className="segmented three">{ZONE_MODES.map(mode => <button key={mode.id} className={zoneMode === mode.id ? "selected" : ""} title={mode.help} onClick={() => changeZone({ zoneMode: mode.id })}>{mode.label}</button>)}</div><small>{ZONE_MODES.find(mode => mode.id === zoneMode)?.help}</small></div>
            </div>
            {roomCount > 1 && <p className="setup-note">{roomCount} salas en el WCIF: de momento se genera una sola zona.</p>}
          </section>
        </>}

        {tab === "rules" && <section className="rules-panel">
          <div className="setup-heading"><h2>Reglas de asignación</h2></div>
          <h3 className="panel-subheading">Reparto de competidores <Hint align="start" text="Basado en Groupifier. Solo afecta a primeras rondas; las siguientes se ordenan por el resultado de la ronda anterior." /></h3>
          <div className="sorting-rules" role="radiogroup" aria-label="Reparto de competidores">{SORTING_RULES.map(rule => <button key={rule.id} role="radio" aria-checked={options.sortingRule === rule.id} title={rule.help} className={options.sortingRule === rule.id ? "selected" : ""} onClick={() => update({ options: { ...options, sortingRule: rule.id } })}><span className="rule-title"><span className="preset-radio" /><SortingRuleIcon rule={rule.id} /></span><strong>{rule.label}</strong><small>{rule.short}</small>{rule.recommended && <em className="recommended">Recomendado</em>}</button>)}</div>
          <h3 className="panel-subheading">Tareas</h3>
          <div className="option-list">{MAIN_OPTIONS.map(({ key, label, help, codes }) => <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOption(key, event.target.checked)} /><span><strong>{label}{codes?.map(code => <i key={code} className={`cell-chip mini ${code}`} aria-hidden="true">{TASK_CODES[code]}</i>)}<Hint text={help} /></strong></span></label>)}</div>
          {delegatesWithoutDuties && <p className="setup-note warning-note">Ningún delegado marcado para tareas de delegado (ver Personas y roles).</p>}
          <button className="plain more-toggle" type="button" aria-expanded={showMoreOptions} onClick={() => setShowMoreOptions(value => !value)}>{showMoreOptions ? "Menos opciones" : "Más opciones"}</button>
          {showMoreOptions && <div className="option-list">{MORE_OPTIONS.map(({ key, label, help }) => <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOption(key, event.target.checked)} /><span><strong>{label}<Hint text={help} /></strong></span></label>)}</div>}
        </section>}

        {tab === "people" && <PeoplePanel people={people} settings={settings.people} onChange={next => update({ people: next })} delegateDuties={options.assignDelegateDuties} showPhotos={showPhotos} onShowPhotosChange={changeShowPhotos} />}

        {tab === "rounds" && <>
          {outdatedNote}
          <section className="round-section" id="groups">
            <div className="section-heading"><div><h2>Grupos por ronda {roundTab === "later" && <Hint align="start" text="Competidores previstos según la condición de clasificación. Se pueden generar cuando el WCIF tenga los clasificados; mientras tanto, esta configuración se usa para las hojas de tiempos sin nombres." />}</h2></div><div className="group-total"><small>Total previsto</small><strong>{totalGroups} grupos</strong></div></div>
            <div className="round-subtabs" role="tablist"><button role="tab" aria-selected={roundTab === "first"} className={roundTab === "first" ? "active" : ""} onClick={() => setRoundTab("first")}>Primeras rondas <span>{firstRounds.length}</span></button><button role="tab" aria-selected={roundTab === "later"} className={roundTab === "later" ? "active" : ""} onClick={() => setRoundTab("later")}>Rondas siguientes <span>{laterRounds.length}</span></button></div>
            {shownRounds.length === 0 ? <p className="setup-note">No hay rondas siguientes en esta competición.</p> : <div className="round-table">
              <div className="round-table-head"><span>Ronda</span><span>Competidores</span><span>Entrada</span><span>Grupos</span><span><i className="cell-chip mini scrambler">{TASK_CODES.scrambler}</i> Mezcladores</span><span><i className="cell-chip mini runner">{TASK_CODES.runner}</i> Runners</span><span /></div>
              {orderedRounds.map((round, index) => {
                const fixed = usesFixedStations(round.roundNumber, round.competitors, stations, zoneMode);
                const canGenerate = round.competitorsKnown && round.competitors > 0;
                const excluded = isExcluded(round);
                const sizes = groupSizes(round.competitors, round.groups).filter(size => size > 0);
                const perGroup = sizes.length ? `${round.competitorsKnown ? "" : "≈ "}${Math.min(...sizes) === Math.max(...sizes) ? sizes[0] : `${Math.min(...sizes)}–${Math.max(...sizes)}`} por grupo` : "";
                const firstExcluded = excluded && (index === 0 || !isExcluded(orderedRounds[index - 1]));
                return <Fragment key={round.id}>
                  {firstExcluded && <div className="round-divider">Excluidas</div>}
                  <div className={`round-row ${excluded ? "excluded" : ""}`}>
                    <div><EventIcon eventId={round.eventId} label={EVENT_NAMES[round.eventId] ?? round.eventId} /><div className="round-name"><strong>{EVENT_NAMES[round.eventId] ?? round.eventId}</strong><small>Ronda {round.roundNumber} · {round.eventId}</small></div></div>
                    <span className="round-number">{round.competitorsKnown ? round.competitors : `≈ ${round.competitors}`}</span>
                    <span>{fixed ? "Fijos" : "Espera"}</span>
                    <div className="group-cell"><Stepper label="grupos" value={round.groups} min={1} big disabled={excluded} onChange={groups => updateRound(round.id, { groups })} /><small>{perGroup}</small></div>
                    <Stepper label="mezcladores" variant="scrambler" value={round.scramblers} min={0} disabled={excluded} onChange={scramblers => updateRound(round.id, { scramblers })} />
                    <Stepper label="runners" variant="runner" value={round.runners} min={0} disabled={excluded || !options.assignJudges} onChange={runners => updateRound(round.id, { runners })} />
                    {!canGenerate
                      ? <span className="round-planned" title="Se podrá generar cuando el WCIF tenga los clasificados. Su configuración ya se usa para las hojas de tiempos sin nombres.">Prevista</span>
                      : excluded
                        ? <button type="button" className="round-action include" onClick={() => updateRound(round.id, { enabled: true })} title="Volver a incluir esta ronda">↺ Incluir</button>
                        : <button type="button" className="round-action exclude" onClick={() => updateRound(round.id, { enabled: false })} title="Excluir esta ronda" aria-label={`Excluir ${round.label}`}>×</button>}
                  </div>
                </Fragment>;
              })}
            </div>}
          </section>
        </>}

        {tab === "review" && <>
          {outdatedNote}
          {proposal.length > 0 && <GroupReview key={proposalVersion} initialAssignments={proposal} rules={roundRules} eventNames={EVENT_NAMES} roomName={competition.schedule?.venues?.[0]?.rooms?.[0]?.name} onChange={handleReviewChange} photos={photos} showPhotos={showPhotos} onShowPhotosChange={changeShowPhotos} roleLabels={roleLabels} />}
        </>}

        {tab === "print" && <PrintingPanel key={proposalVersion} competition={competition} rounds={rounds} assignments={proposal} stations={stations} zoneMode={zoneMode} printing={settings.printing} onChange={printing => update({ printing })} />}
      </div>
      <footer className="workspace-actions"><div><strong>{activeRounds.length} rondas activas</strong><span> · {totalGroups} grupos previstos</span></div><div><Link className="button secondary" href="/dashboard">Cambiar competición</Link><button className="button primary" onClick={createProposal} disabled={!activeRounds.length}>{proposal.length ? "Volver a generar" : "Crear propuesta de grupos"}</button></div></footer>
    </section>
  </main>;
}

function Stepper({ label, value, min, disabled = false, big = false, variant, onChange }: { label: string; value: number; min: number; disabled?: boolean; big?: boolean; variant?: "scrambler" | "runner"; onChange: (value: number) => void }) {
  return <div className={["mini-stepper", big && "big", variant].filter(Boolean).join(" ")}><button disabled={disabled || value <= min} aria-label={`Quitar ${label}`} onClick={() => onChange(value - 1)}>−</button><strong aria-label={`${value} ${label}`}>{value}</strong><button disabled={disabled} aria-label={`Añadir ${label}`} onClick={() => onChange(value + 1)}>+</button></div>;
}
