"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { EventIcon } from "@/components/event-icon";
import { LanguageSwitcher, useEventName, useI18n } from "@/components/i18n";
import { GroupReview } from "@/components/group-review";
import { Hint } from "@/components/hint";
import { PeoplePanel } from "@/components/people-panel";
import { PrintingPanel } from "@/components/printing-panel";
import { ProSchedulePanel } from "@/components/pro-schedule-panel";
import { SortingRuleIcon } from "@/components/rule-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { TASK_CODES, type GeneratedAssignment, type TaskRole } from "@/lib/assignments";
import { keyOf } from "@/lib/i18n";
import { getCompetition, type StoredCompetition } from "@/lib/competition-store";
import { draftStorageKey, generationSignature, parseDraft, type Draft, type WorkspaceSettings } from "@/lib/draft";
import { DEFAULT_OPTIONS, generateAssignments, groupSizes, type AssignmentOptions } from "@/lib/group-generator";
import { isDelegate, peopleFromWcif } from "@/lib/people";
import { eventBusyWindows, groupSlots, importSchedule, scheduleLanes, targetKey, withScheduledGroups, type ProSchedule } from "@/lib/pro/schedule";
import { acceptedPeople, personKey, initialRounds, resuggestRounds, usesFixedStations, type RoundConfig, type SortingRule, type ZoneMode } from "@/lib/rounds";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import type { RoundRules } from "@/lib/validation";

const DEFAULT_STATIONS = 12;

type Tab = "zone" | "schedule" | "rules" | "people" | "rounds" | "review" | "print";
const TABS: Tab[] = ["zone", "schedule", "rules", "people", "rounds", "review", "print"];
/** Only in PRO mode. */
const PRO_TABS: Tab[] = ["schedule"];
const PHOTOS_KEY = "wca-easy-groups:show-photos";

const ZONE_MODES: ZoneMode[] = ["fixed", "waiting", "mixed"];
const SORTING_RULES: SortingRule[] = ["scrambler-safe", "symmetric", "balanced", "ranks", "name-optimised"];

type OptionKey = Exclude<keyof AssignmentOptions, "sortingRule">;
const MAIN_OPTIONS: Array<{ key: OptionKey; codes?: TaskRole[] }> = [
  { key: "assignJudges", codes: ["judge", "runner"] },
  { key: "avoidBeforeOwnGroup" },
  { key: "spreadDelegates" },
  { key: "normalTasksForDelegatesAndOrganizers" },
  { key: "assignDelegateDuties", codes: ["delegate"] },
  { key: "assignDataEntry", codes: ["dataentry"] },
];
const MORE_OPTIONS: OptionKey[] = ["noTasksForNewcomers", "tasksForOwnEventsOnly", "noRunningForForeigners"];

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
  const { t, tp } = useI18n();
  const eventName = useEventName();
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
    // Hash changes from outside (typed URL, back/forward) are not seen by the Next router;
    // re-saving the URL keeps it in sync, so a refresh (e.g. switching language) keeps the tab.
    const onHashChange = () => {
      readHash();
      history.replaceState(history.state, "", location.href);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // A PRO tab in the URL while PRO is off shows the first tab.
  useEffect(() => {
    if (settings && !settings.pro?.enabled && PRO_TABS.includes(tab)) setTab("zone");
  }, [settings, tab]);

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
    add(settings.people.roles.delegate, t("people.roleTags.delegate"));
    add(settings.people.roles["trainee-delegate"], t("people.roleTags.trainee-delegate"));
    add(settings.people.roles.organizer, t("people.roleTags.organizer"));
    add(settings.people.roles.staff, t("people.roleTags.staff"));
    add(settings.people.roles.dataentry, t("people.roleTags.dataentry"));
    add(settings.people.trustedIds, t("people.roleTags.trusted"));
    return labels;
  }, [settings, t]);
  const photos = useMemo(() => Object.fromEntries((competition?.persons ?? []).map(person => [personKey(person), person.avatar?.thumbUrl])), [competition]);
  const signature = useMemo(() => settings ? generationSignature(settings) : "", [settings]);
  const pro = settings?.pro?.enabled ? settings.pro : undefined;
  const slots = useMemo(() => pro ? groupSlots(pro.schedule) : undefined, [pro]);
  /** Rounds as generated: in PRO mode, scheduled rounds take their groups from the schedule. */
  const effectiveRounds = useMemo(() => settings ? slots ? withScheduledGroups(settings.rounds, slots) : settings.rounds : [], [settings, slots]);
  const roundRules = useMemo(() => {
    if (!settings) return {};
    const { people: roles, options, stations, zoneMode } = settings;
    const noNormalTasks = new Set([...(roles.roles.dataentry ?? []), ...(options.normalTasksForDelegatesAndOrganizers ? [] : [...(roles.roles.delegate ?? []), ...(roles.roles["trainee-delegate"] ?? []), ...(roles.roles.organizer ?? [])])]);
    return Object.fromEntries(effectiveRounds.map(round => {
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
  }, [settings, proposal, effectiveRounds]);
  const handleReviewChange = useCallback((next: GeneratedAssignment[]) => setProposal(next), []);

  if (loading) return <main className="workspace-loading"><div /><p>{t("workspace.loading")}</p></main>;
  if (!competition || !settings) return <main className="missing-competition"><div><p className="kicker">{t("workspace.missingKicker")}</p><h1>{t("workspace.missingTitle")}</h1><p>{t("workspace.missingText")}</p><Link className="button primary" href="/dashboard">{t("workspace.backToList")}</Link></div></main>;

  const { stations, zoneMode, options } = settings;
  const rounds = effectiveRounds;
  const update = (change: Partial<WorkspaceSettings>) => setSettings(current => current && { ...current, ...change });
  const setOption = (key: OptionKey, value: boolean) => update({ options: { ...options, [key]: value } });
  const changeZone = (next: { stations?: number; zoneMode?: ZoneMode }) => {
    const nextStations = next.stations ?? stations;
    const nextMode = next.zoneMode ?? zoneMode;
    update({ stations: nextStations, zoneMode: nextMode, rounds: resuggestRounds(settings.rounds, nextStations, nextMode) });
  };
  const updateRound = (id: string, change: Partial<RoundConfig>) => update({ rounds: settings.rounds.map(round => round.id === id ? { ...round, ...change } : round) });
  const freshSchedule = (): ProSchedule => importSchedule(competition, roundId => settings.rounds.find(round => round.id === roundId)?.groups ?? 1);
  const setPro = (enabled: boolean) => {
    update({ pro: { enabled, schedule: settings.pro?.schedule ?? freshSchedule() } });
    if (!enabled && PRO_TABS.includes(tab)) changeTab("zone");
  };
  const setSchedule = (schedule: ProSchedule) => update({ pro: { enabled: true, schedule } });

  const activeRounds = rounds.filter(round => round.enabled);
  const firstRounds = rounds.filter(round => round.roundNumber === 1);
  const laterRounds = rounds.filter(round => round.roundNumber > 1);
  const totalGroups = activeRounds.reduce((sum, round) => sum + round.groups, 0);
  const roomCount = competition.schedule?.venues?.reduce((sum, venue) => sum + (venue.rooms?.length ?? 0), 0) ?? 0;
  const proposalOutdated = proposal.length > 0 && generatedWith !== undefined && generatedWith !== signature;
  const delegatesWithoutDuties = options.assignDelegateDuties && !settings.people.delegateDutyIds.some(key => isDelegate(settings.people, key));

  function createProposal() {
    if (!competition || !settings) return;
    if (proposal.length && !window.confirm(t("workspace.confirmReplace"))) return;
    setProposal(generateAssignments({ competition, rounds: activeRounds, stations, zoneMode, people: settings.people, options, slots, eventWindows: pro ? eventBusyWindows(pro.schedule) : undefined }));
    setGeneratedWith(signature);
    setProposalVersion(version => version + 1);
    changeTab("review");
  }

  const shownRounds = roundTab === "first" ? firstRounds : laterRounds;
  // Excluded rounds (known competitors, switched off) go to the bottom, greyed out.
  const isExcluded = (round: RoundConfig) => round.competitorsKnown && round.competitors > 0 && !round.enabled;
  const orderedRounds = [...shownRounds.filter(round => !isExcluded(round)), ...shownRounds.filter(isExcluded)];
  const tabs: Array<{ id: Tab; label: string; done?: boolean; disabled?: boolean }> = TABS.filter(id => pro || !PRO_TABS.includes(id)).map(id => ({
    id,
    label: t(keyOf("tabs", id)),
    ...(id === "review" ? { done: proposal.length > 0, disabled: proposal.length === 0 } : {}),
  }));
  const outdatedNote = proposalOutdated && <div className="outdated-note" role="status"><p><strong>{t("workspace.outdatedTitle")}</strong> {t("workspace.outdatedText")}</p></div>;

  return <main className="workspace-shell">
    <aside className="workspace-sidebar">
      <Link className="product-mark" href="/dashboard"><span>EG</span><strong>Easy Groups</strong></Link>
      <div className="competition-switcher"><small>{t("workspace.activeCompetition")}</small><strong>{competition.shortName ?? competition.name}</strong><span>{competition.id}</span></div>
      <nav className="workspace-nav" aria-label={t("workspace.sections")}>
        {tabs.map((item, index) => <button key={item.id} type="button" className={tab === item.id ? "active" : item.done ? "done" : ""} disabled={item.disabled} aria-current={tab === item.id ? "page" : undefined} onClick={() => changeTab(item.id)}><span>{item.done && tab !== item.id ? "✓" : index + 1}</span> {item.label}</button>)}
        <span className="nav-pending" title={t("workspace.notAvailable")}><span>{tabs.length + 1}</span> {t("workspace.publish")} <small>{t("workspace.soon")}</small></span>
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-user"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>{t("auth.wcaAccount")}</small></div></div>
    </aside>

    <section className="workspace-main">
      <header className="workspace-topbar"><div><Link href="/dashboard">{t("workspace.breadcrumb")}</Link><span>/</span><strong>{competition.name}</strong></div><div className="workspace-topbar-actions"><label className={`pro-switch ${pro ? "on" : ""}`} title={t("pro.toggleHelp")}><input type="checkbox" role="switch" checked={!!pro} onChange={event => setPro(event.target.checked)} /><span>{t("pro.toggle")}</span></label><div className="sync-state"><i /> {t("workspace.savedHere")}</div><LanguageSwitcher compact /><ThemeToggle compact /></div></header>
      <nav className="workspace-tabs" role="tablist" aria-label={t("workspace.sections")}>
        {tabs.map(item => <button key={item.id} role="tab" type="button" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} disabled={item.disabled} title={item.disabled ? t("workspace.generateFirst") : undefined} onClick={() => changeTab(item.id)}>{item.label}</button>)}
      </nav>
      <div className="workspace-content">
        {tab === "zone" && <>
          <section className="data-strip" id="summary">
            <div><small>{t("workspace.stats.accepted")}</small><strong>{people.length}</strong></div><div><small>{t("workspace.stats.events")}</small><strong>{competition.events?.length ?? 0}</strong></div><div><small>{t("workspace.stats.rooms")}</small><strong>{roomCount}</strong></div><div><small>{t("workspace.stats.activeRounds")}</small><strong>{activeRounds.length}</strong></div>
          </section>
          <section className="setup-panel">
            <div className="setup-heading"><h2>{t("zone.title")} <Hint align="start" text={t("zone.hint")} /></h2></div>
            <div className="setup-grid">
              <label><span>{t("zone.stations")}</span><div className="number-field"><button aria-label={t("zone.removeStation")} onClick={() => changeZone({ stations: Math.max(1, stations - 1) })}>−</button><strong>{stations}</strong><button aria-label={t("zone.addStation")} onClick={() => changeZone({ stations: stations + 1 })}>+</button></div></label>
              <div className="preset-field"><span>{t("zone.entry")}</span><div className="segmented three">{ZONE_MODES.map(mode => <button key={mode} className={zoneMode === mode ? "selected" : ""} title={t(keyOf("zone.modes", `${mode}.help`))} onClick={() => changeZone({ zoneMode: mode })}>{t(keyOf("zone.modes", `${mode}.label`))}</button>)}</div><small>{t(keyOf("zone.modes", `${zoneMode}.help`))}</small></div>
            </div>
            {roomCount > 1 && <p className="setup-note">{t("zone.rooms", { count: roomCount })}</p>}
          </section>
        </>}

        {tab === "schedule" && pro && <ProSchedulePanel schedule={pro.schedule} rounds={settings.rounds} onChange={setSchedule} onReimport={() => setSchedule(freshSchedule())} />}

        {tab === "rules" && <section className="rules-panel">
          <div className="setup-heading"><h2>{t("rules.title")}</h2></div>
          <h3 className="panel-subheading">{t("rules.sortingTitle")} <Hint align="start" text={t("rules.sortingHint")} /></h3>
          <div className="sorting-rules" role="radiogroup" aria-label={t("rules.sortingTitle")}>{SORTING_RULES.map(rule => <button key={rule} role="radio" aria-checked={options.sortingRule === rule} title={t(keyOf("rules.sorting", `${rule}.help`))} className={options.sortingRule === rule ? "selected" : ""} onClick={() => update({ options: { ...options, sortingRule: rule } })}><span className="rule-title"><span className="preset-radio" /><SortingRuleIcon rule={rule} /></span><strong>{t(keyOf("rules.sorting", `${rule}.label`))}</strong><small>{t(keyOf("rules.sorting", `${rule}.short`))}</small>{rule === "scrambler-safe" && <em className="recommended">{t("rules.recommended")}</em>}</button>)}</div>
          <h3 className="panel-subheading">{t("rules.tasksTitle")}</h3>
          <div className="option-list">{MAIN_OPTIONS.map(({ key, codes }) => <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOption(key, event.target.checked)} /><span><strong>{t(keyOf("rules.options", `${key}.label`))}{codes?.map(code => <i key={code} className={`cell-chip mini ${code}`} aria-hidden="true">{TASK_CODES[code]}</i>)}<Hint text={t(keyOf("rules.options", `${key}.help`))} /></strong></span></label>)}</div>
          {delegatesWithoutDuties && <p className="setup-note warning-note">{t("rules.noDelegateDuties")}</p>}
          <button className="plain more-toggle" type="button" aria-expanded={showMoreOptions} onClick={() => setShowMoreOptions(value => !value)}>{showMoreOptions ? t("rules.lessOptions") : t("rules.moreOptions")}</button>
          {showMoreOptions && <div className="option-list">{MORE_OPTIONS.map(key => <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOption(key, event.target.checked)} /><span><strong>{t(keyOf("rules.options", `${key}.label`))}<Hint text={t(keyOf("rules.options", `${key}.help`))} /></strong></span></label>)}</div>}
        </section>}

        {tab === "people" && <PeoplePanel people={people} settings={settings.people} onChange={next => update({ people: next })} delegateDuties={options.assignDelegateDuties} showPhotos={showPhotos} onShowPhotosChange={changeShowPhotos} />}

        {tab === "rounds" && <>
          {outdatedNote}
          <section className="round-section" id="groups">
            <div className="section-heading"><div><h2>{t("rounds.title")} {roundTab === "later" && <Hint align="start" text={t("rounds.laterHint")} />}</h2></div><div className="group-total"><small>{t("rounds.plannedTotal")}</small><strong>{tp("rounds.groups", totalGroups)}</strong></div></div>
            <div className="round-subtabs" role="tablist"><button role="tab" aria-selected={roundTab === "first"} className={roundTab === "first" ? "active" : ""} onClick={() => setRoundTab("first")}>{t("rounds.firstRounds")} <span>{firstRounds.length}</span></button><button role="tab" aria-selected={roundTab === "later"} className={roundTab === "later" ? "active" : ""} onClick={() => setRoundTab("later")}>{t("rounds.laterRounds")} <span>{laterRounds.length}</span></button></div>
            {shownRounds.length === 0 ? <p className="setup-note">{t("rounds.noLater")}</p> : <div className="round-table">
              <div className="round-table-head"><span>{t("rounds.columnRound")}</span><span>{t("rounds.columnCompetitors")}</span><span>{t("rounds.columnEntry")}</span><span>{t("rounds.columnGroups")}</span><span><i className="cell-chip mini scrambler">{TASK_CODES.scrambler}</i> {t("rounds.columnScramblers")}</span><span><i className="cell-chip mini runner">{TASK_CODES.runner}</i> {t("rounds.columnRunners")}</span><span /></div>
              {orderedRounds.map((round, index) => {
                const fixed = usesFixedStations(round.roundNumber, round.competitors, stations, zoneMode);
                const canGenerate = round.competitorsKnown && round.competitors > 0;
                const excluded = isExcluded(round);
                const sizes = groupSizes(round.competitors, round.groups).filter(size => size > 0);
                const perGroup = sizes.length ? `${round.competitorsKnown ? "" : "≈ "}${t("rounds.perGroup", { size: Math.min(...sizes) === Math.max(...sizes) ? sizes[0] : `${Math.min(...sizes)}–${Math.max(...sizes)}` })}` : "";
                const roundName = `${eventName(round.eventId)} · ${t("rounds.roundNumber", { number: round.roundNumber })}`;
                const firstExcluded = excluded && (index === 0 || !isExcluded(orderedRounds[index - 1]));
                return <Fragment key={round.id}>
                  {firstExcluded && <div className="round-divider">{t("rounds.excluded")}</div>}
                  <div className={`round-row ${excluded ? "excluded" : ""}`}>
                    <div><EventIcon eventId={round.eventId} label={eventName(round.eventId)} /><div className="round-name"><strong>{eventName(round.eventId)}</strong><small>{t("rounds.roundNumber", { number: round.roundNumber })} · {round.eventId}</small></div></div>
                    <span className="round-number">{round.competitorsKnown ? round.competitors : `≈ ${round.competitors}`}</span>
                    <span>{fixed ? t("rounds.fixed") : t("rounds.waiting")}</span>
                    <div className="group-cell">{slots?.has(round.id)
                      ? <button type="button" className="scheduled-groups" title={t("rounds.fromSchedule")} onClick={() => changeTab("schedule")}><strong>{round.groups}</strong><span>{scheduleLanes(pro!.schedule).filter(lane => slots.get(round.id)!.some(slot => targetKey(slot.roomId, slot.stageId) === lane.key)).map(lane => <i key={lane.key} style={{ background: lane.color }} title={`${lane.name}: ${slots.get(round.id)!.filter(slot => targetKey(slot.roomId, slot.stageId) === lane.key).length}`} />)}</span></button>
                      : <Stepper label={t("rounds.stepperGroups")} value={round.groups} min={1} big disabled={excluded} onChange={groups => updateRound(round.id, { groups })} />}<small>{perGroup}</small></div>
                    <Stepper label={t("rounds.stepperScramblers")} variant="scrambler" value={round.scramblers} min={0} disabled={excluded} onChange={scramblers => updateRound(round.id, { scramblers })} />
                    <Stepper label={t("rounds.stepperRunners")} variant="runner" value={round.runners} min={0} disabled={excluded || !options.assignJudges} onChange={runners => updateRound(round.id, { runners })} />
                    {!canGenerate
                      ? <span className="round-planned" title={t("rounds.plannedHelp")}>{t("rounds.planned")}</span>
                      : excluded
                        ? <button type="button" className="round-action include" onClick={() => updateRound(round.id, { enabled: true })} title={t("rounds.includeHelp")}>{t("rounds.include")}</button>
                        : <button type="button" className="round-action exclude" onClick={() => updateRound(round.id, { enabled: false })} title={t("rounds.exclude")} aria-label={t("rounds.excludeLabel", { round: roundName })}>×</button>}
                  </div>
                </Fragment>;
              })}
            </div>}
          </section>
        </>}

        {tab === "review" && <>
          {outdatedNote}
          {proposal.length > 0 && <GroupReview key={proposalVersion} initialAssignments={proposal} rules={roundRules} roomName={competition.schedule?.venues?.[0]?.rooms?.[0]?.name} onChange={handleReviewChange} photos={photos} showPhotos={showPhotos} onShowPhotosChange={changeShowPhotos} roleLabels={roleLabels} slots={slots} rooms={pro?.schedule.rooms} />}
        </>}

        {tab === "print" && <PrintingPanel key={proposalVersion} competition={competition} rounds={rounds} assignments={proposal} stations={stations} zoneMode={zoneMode} printing={settings.printing} onChange={printing => update({ printing })} />}
      </div>
      <footer className="workspace-actions"><div><strong>{tp("workspace.activeRounds", activeRounds.length)}</strong><span> · {tp("workspace.plannedGroups", totalGroups)}</span></div><div><Link className="button secondary" href="/dashboard">{t("workspace.changeCompetition")}</Link><button className="button primary" onClick={createProposal} disabled={!activeRounds.length}>{proposal.length ? t("workspace.regenerate") : t("workspace.create")}</button></div></footer>
    </section>
  </main>;
}

function Stepper({ label, value, min, disabled = false, big = false, variant, onChange }: { label: string; value: number; min: number; disabled?: boolean; big?: boolean; variant?: "scrambler" | "runner"; onChange: (value: number) => void }) {
  const { t } = useI18n();
  return <div className={["mini-stepper", big && "big", variant].filter(Boolean).join(" ")}><button disabled={disabled || value <= min} aria-label={t("rounds.remove", { thing: label })} onClick={() => onChange(value - 1)}>−</button><strong aria-label={`${value} ${label}`}>{value}</strong><button disabled={disabled} aria-label={t("rounds.add", { thing: label })} onClick={() => onChange(value + 1)}>+</button></div>;
}
