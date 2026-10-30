"use client";

import { AppMark } from "@/components/app-mark";
import { ResumeFromFile, savedAtText, storeSession, type ReadFile } from "@/components/resume-from-file";
import { readSettings, withPrivateSettings, type SavedSettings } from "@/lib/wca-sync";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AssignmentSetsPanel } from "@/components/assignment-sets-panel";
import { StationRulesPanel } from "@/components/station-rules-panel";
import { EventIcon } from "@/components/event-icon";
import { LanguageSwitcher, useEventName, useI18n } from "@/components/i18n";
import { GroupReview } from "@/components/group-review";
import { Hint } from "@/components/hint";
import { PeoplePanel } from "@/components/people-panel";
import { UnavailabilityPanel } from "@/components/unavailability-panel";
import { PrintingPanel } from "@/components/printing-panel";
import { PublishPanel } from "@/components/publish-panel";
import { ProTemplatePanel } from "@/components/pro-template-panel";
import { ProPeoplePanel } from "@/components/pro-people-panel";
import { ProSchedulePanel } from "@/components/pro-schedule-panel";
import { ProScoringPanel } from "@/components/pro-scoring-panel";
import { ProSegmentsPanel } from "@/components/pro-segments-panel";
import { SortingRuleIcon } from "@/components/rule-icons";
import { TaskOrderPanel } from "@/components/task-order-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { TASK_CODES, type GeneratedAssignment, type TaskRole } from "@/lib/assignments";
import { keyOf } from "@/lib/i18n";
import { getCompetition, saveCompetition, type StoredCompetition } from "@/lib/competition-store";
import { groupsFromWcif, hasWcifGroups, wcifGroupsNeedStages } from "@/lib/wcif-groups";
import { draftStorageKey, generationSignature, parseDraft, withSharedUnavailability, type Draft, type WorkspaceSettings } from "@/lib/draft";
import { TOP_TOGETHER_COUNT, topTogetherCountOf, normalizeOptions, DEFAULT_OPTIONS, generateAssignments, groupSizes, type AssignmentOptions } from "@/lib/group-generator";
import { isDelegate, migrateWcaStaffRoles, nonCompetingStaff, peopleFromWcif, rekeyPeople, staleKeys } from "@/lib/people";
import { fetchWcaNames } from "@/lib/wca-persons";
import { EMPTY_PRO_PEOPLE, everyone, findVolunteerCopies, linkedVolunteers, withWcaNames, importPersonProperties, mergeVolunteerCopies, orphanPropertyKeys, volunteerPerson, type ProPeople } from "@/lib/pro/people";
import { teamClusterId, teamJobExclusions, teamLanes, teamSetups, teamUnavailability, withTeams } from "@/lib/pro/teams";
import { resolveSets, type AssignmentSetConfig } from "@/lib/pro/assignment-sets";
import { previewSets } from "@/lib/pro/sets-preview";
import { applyTemplate, exportTemplate, type ProTemplate } from "@/lib/pro/template";
import { resolveStationRules, type StationRuleConfig } from "@/lib/pro/station-rules";
import { JOB_ROLES, newSegmentId, SEGMENT_TEMPLATES, segmentMembers, type JobEligibility, type JobRole, type Segment } from "@/lib/pro/segments";
import { staffingOf, type LaneStaffing, type ProConfig } from "@/lib/pro/schedule";
import { DEFAULT_SCORING, type ScoringConfig } from "@/lib/pro/scoring";
import { eventBusyWindows, groupSlots, importSchedule, minScheduledGroups, scheduleLanes, setRoundGroups, targetKey, withScheduledGroups, type ProSchedule } from "@/lib/pro/schedule";
import { finalRoundIds, acceptedPeople, personKey, initialRounds, roundHasResults, shapeRound, SORTING_RULES, type GenerationRound, resuggestRounds, suggestRunners, suggestScramblers, usesFixedStations, type RoundConfig, type SortingRule, type ZoneMode } from "@/lib/rounds";
import { normalizeSeating, seatingStations, stationOrder, tablesInRow, type Seating } from "@/lib/seating";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import type { RoundRules } from "@/lib/validation";

const DEFAULT_STATIONS = 12;

type Tab = "zone" | "schedule" | "rules" | "people" | "segments" | "rounds" | "review" | "print" | "publish";
const TABS: Tab[] = ["zone", "schedule", "rules", "people", "segments", "rounds", "review", "print", "publish"];
/** Only in PRO mode. */
const PRO_TABS: Tab[] = ["schedule", "segments"];
const PHOTOS_KEY = "wca-easy-groups:show-photos";

const ZONE_MODES: ZoneMode[] = ["fixed", "waiting", "mixed"];


type OptionKey = Exclude<keyof AssignmentOptions, "sortingRule" | "taskOrder" | "topTogetherCounts">;
const MAIN_OPTIONS: Array<{ key: OptionKey; codes?: TaskRole[] }> = [
  { key: "assignJudges", codes: ["judge", "runner"] },
  { key: "avoidBeforeOwnGroup" },
  { key: "spreadDelegates" },
  { key: "normalTasksForDelegatesAndOrganizers" },
  { key: "assignDelegateDuties", codes: ["delegate"] },
  { key: "assignDataEntry", codes: ["dataentry"] },
];
const MORE_OPTIONS: OptionKey[] = ["noTasksForNewcomers", "tasksForOwnEventsOnly", "tasksOnCompetingDaysOnly", "balanceMinutes", "noRunningForForeigners"];

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

/**
 * Settings and proposal with the groups already in the WCIF: rounds that have them are switched on
 * (in normal mode with their number of groups) and the assignments become the proposal.
 */
function withWcifGroups(competition: StoredCompetition, settings: WorkspaceSettings) {
  const slots = settings.pro?.enabled ? groupSlots(settings.pro.schedule) : undefined;
  const imported = groupsFromWcif(competition, slots, linkedVolunteers(settings.pro?.people));
  const rounds = settings.rounds.map(round => {
    const groups = imported.groupsByRound.get(round.id);
    return groups === undefined ? round : { ...round, enabled: true, ...(slots ? {} : { groups }) };
  });
  return { settings: { ...settings, rounds }, proposal: imported.assignments, unplaced: imported.unplaced };
}

/** Rooms and stages a team can work in, with whether a room has stages. */
function laneChoices(schedule: ProSchedule) {
  return scheduleLanes(schedule).map(lane => ({ key: lane.key, name: lane.name, color: lane.color, hasStages: lane.stageId !== undefined || (schedule.rooms.find(room => room.id === lane.roomId)?.stages.length ?? 0) > 0 }));
}

export function GroupWorkspace({ competitionId, userName, offline = false }: { competitionId: string; userName: string; /** The demo: no WCA to read from or publish to. */ offline?: boolean }) {
  const { t, tp, locale } = useI18n();
  const eventName = useEventName();
  const [competition, setCompetition] = useState<StoredCompetition>();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WorkspaceSettings>();
  const [proposal, setProposal] = useState<GeneratedAssignment[]>([]);
  const [generatedWith, setGeneratedWith] = useState<string>();
  /** Remounts the review (and resets its undo history) only when a new proposal is generated. */
  const [proposalVersion, setProposalVersion] = useState(0);
  /** Groups tab: rounds already held, rounds that can be generated, rounds whose competitors are not known yet. */
  const [roundTab, setRoundTab] = useState<"past" | "ready" | "pending">("ready");
  const [tab, setTab] = useState<Tab>("zone");
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  /** Shown in the review after groups were read from the WCIF. */
  const [wcifNote, setWcifNote] = useState<{ count: number; unplaced: number }>();
  const [restarting, setRestarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Mid-competition messages: what refreshing from the WCA found, which rounds were generated. */
  const [refreshNote, setRefreshNote] = useState<string>();
  /** When the WCA settings this browser last loaded or published were saved. */
  const [remoteSavedAt, setRemoteSavedAt] = useState<string>();
  /** Settings at the WCA newer than this browser's, offered with a button. */
  const [remoteNewer, setRemoteNewer] = useState<{ data: StoredCompetition; saved: SavedSettings }>();

  /** Opens the WCIF's own groups in the review. */
  const openWcifGroups = useCallback((data: StoredCompetition, base: WorkspaceSettings) => {
    const result = withWcifGroups(data, base);
    setSettings(result.settings);
    setProposal(result.proposal);
    setGeneratedWith(undefined);
    setProposalVersion(version => version + 1);
    setWcifNote({ count: result.proposal.length, unplaced: result.unplaced });
    setTab("review");
    history.replaceState(null, "", "#review");
  }, []);

  /** Opens a competition with its draft, or, without one, the WCIF's own groups if it has any. */
  const openCompetition = useCallback((data: StoredCompetition, saved: Draft | undefined) => {
    setCompetition(data);
    // Someone the WCA has registered since (staff with tasks, when publishing) has a new key.
    const draft = saved && rekeyPeople({ ...saved, settings: saved.settings && withSharedUnavailability(saved.settings) }, staleKeys(data));
    const defaults = defaultSettings(data);
    // First time here and the WCIF already has groups: open them for review.
    if (!draft && hasWcifGroups(data)) return openWcifGroups(data, wcifGroupsNeedStages(data) ? { ...defaults, pro: { enabled: true, schedule: importSchedule(data, roundId => defaults.rounds.find(round => round.id === roundId)?.groups ?? 1) } } : defaults);
    setSettings(draft?.settings ? { ...defaults, ...draft.settings, people: migrateWcaStaffRoles(draft.settings.people, data), options: normalizeOptions(draft.settings.options), printing: { ...defaults.printing, ...draft.settings.printing } } : defaults);
    setProposal(draft?.assignments ?? []);
    setGeneratedWith(draft?.generatedWith);
    setRemoteSavedAt(draft?.remoteSavedAt);
  }, [openWcifGroups]);

  /**
   * Settings saved at the WCA (by anyone who manages the competition): the settings, with the
   * WCIF's groups as the proposal. `data` becomes the stored WCIF.
   */
  const openRemote = useCallback(async (data: StoredCompetition, saved: SavedSettings) => {
    await saveCompetition(data);
    setCompetition(data);
    const defaults = defaultSettings(data);
    // The WCA has no personal data (see publicSettings): keep this browser's.
    const remote = rekeyPeople(withSharedUnavailability(withPrivateSettings(saved.settings, parseDraft(localStorage.getItem(draftStorageKey(data.id)))?.settings)), staleKeys(data));
    const base = { ...defaults, ...remote, people: migrateWcaStaffRoles(remote.people, data), options: normalizeOptions(remote.options), printing: { ...defaults.printing, ...remote.printing } };
    const result = hasWcifGroups(data) ? withWcifGroups(data, base) : { settings: base, proposal: [] };
    setSettings(result.settings);
    setProposal(result.proposal);
    setGeneratedWith(saved.generatedWith);
    setRemoteSavedAt(saved.savedAt);
    setProposalVersion(version => version + 1);
    setRemoteNewer(undefined);
    setWcifNote(undefined);
    return result.proposal.length > 0;
  }, []);

  useEffect(() => {
    let active = true;
    getCompetition(competitionId).then(async data => {
      if (!data) return setCompetition(undefined);
      const draft = parseDraft(localStorage.getItem(draftStorageKey(data.id)));
      const stored = await readSettings(data);
      if (!active) return;
      // First time here and the WCA has the app's settings: open them, with the WCIF's groups.
      if (!draft && stored) {
        if (await openRemote(data, stored)) { setTab("review"); history.replaceState(null, "", "#review"); }
        setRefreshNote(remoteText("sync.remoteLoaded", stored));
        return;
      }
      openCompetition(data, draft);
      if (stored && stored.savedAt > (draft?.remoteSavedAt ?? "")) setRemoteNewer({ data, saved: stored });
      // Someone may have saved newer settings since this WCIF was imported: look, quietly.
      if (offline) return;
      const response = await fetch(`/api/wca/competitions/${encodeURIComponent(data.id)}`, { cache: "no-store" }).catch(() => undefined);
      if (!response?.ok || !active) return;
      const fresh = await response.json() as StoredCompetition;
      const saved = await readSettings(fresh);
      if (active && saved && saved.savedAt > (draft?.remoteSavedAt ?? "") && saved.savedAt > (stored?.savedAt ?? "")) setRemoteNewer({ data: fresh, saved });
    }).finally(() => setLoading(false));
    return () => { active = false; };
    // remoteText only formats a message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, openCompetition, openRemote, offline]);

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
    const draft: Draft = { version: 3, settings, generatedWith, assignments: proposal, ...(remoteSavedAt ? { remoteSavedAt } : {}) };
    try {
      localStorage.setItem(draftStorageKey(competition.id), JSON.stringify(draft));
    } catch {
      // Storage can be full or blocked; the work stays in memory for this session.
    }
  }, [competition, settings, generatedWith, proposal, remoteSavedAt]);

  /** "Saved on 24 Oct, 18:40 by Ana" for settings at the WCA. */
  function remoteText(key: "sync.remoteLoaded" | "sync.remoteNewer", saved: SavedSettings) {
    return t(key, { date: savedAtText(saved.savedAt, locale), by: saved.savedBy ? t("sync.remoteBy", { name: saved.savedBy }) : "" });
  }

  /** Loads the newer settings the WCA has, replacing this browser's. */
  async function loadRemoteSettings() {
    if (!remoteNewer) return;
    const { data, saved } = remoteNewer;
    if (await openRemote(data, saved)) changeTab("review");
    setRefreshNote(remoteText("sync.remoteLoaded", saved));
  }

  /** After publishing: the WCIF as the WCA has it now, and the settings saved with it. */
  async function afterPublish(fresh: StoredCompetition, savedAt: string) {
    await saveCompetition(fresh);
    setCompetition(fresh);
    // Staff the WCA has just registered to keep their tasks now have a registrant id as key.
    const aliases = staleKeys(fresh);
    if (aliases.size) {
      setSettings(current => current && rekeyPeople(current, aliases));
      setProposal(current => rekeyPeople(current, aliases));
    }
    setRemoteSavedAt(savedAt);
    setRemoteNewer(undefined);
  }

  const people = useMemo(() => competition ? acceptedPeople(competition) : [], [competition]);
  /** People who can hold a role: competitors and staff who do not compete (organizers without a registration…). */
  const rolePeople = useMemo(() => competition ? [...acceptedPeople(competition), ...nonCompetingStaff(competition)] : [], [competition]);
  // PRO: teams read live from a person property decide part of the roles (lib/pro/teams.ts).
  const teamState = useMemo(() => {
    if (!competition || !settings?.pro?.enabled) return undefined;
    const proPeople = settings.pro.people ?? { ...EMPTY_PRO_PEOPLE, ...importPersonProperties(competition) };
    const { property, setups, values: allValues } = teamSetups(proPeople, proPeople.teams, laneChoices(settings.pro.schedule));
    // Properties left behind by someone who no longer exists do not count.
    const known = new Set(everyone(competition, proPeople).map(personKey));
    const values = new Map([...allValues].filter(([key]) => known.has(key)));
    if (!values.size) return undefined;
    const { settings: people, fromTeam } = withTeams(settings.people, values, setups);
    return { property, setups, values, people, fromTeam, unavailable: teamUnavailability(values, setups), jobExclusions: teamJobExclusions(values, setups), lanes: teamLanes(values, setups) };
  }, [competition, settings]);
  /** Role lists as the generator and the review use them: with teams applied. */
  const rolesInUse = teamState?.people ?? settings?.people;
  const roleLabels = useMemo(() => {
    const labels: Record<string, string[]> = {};
    if (!settings || !rolesInUse) return labels;
    const add = (keys: string[] | undefined, label: string) => keys?.forEach(key => { labels[key] = [...(labels[key] ?? []), label]; });
    add(rolesInUse.roles.delegate, t("people.roleTags.delegate"));
    add(rolesInUse.roles["trainee-delegate"], t("people.roleTags.trainee-delegate"));
    add(rolesInUse.roles.organizer, t("people.roleTags.organizer"));
    add(rolesInUse.roles.staff, t("people.roleTags.staff"));
    add(rolesInUse.roles.dataentry, t("people.roleTags.dataentry"));
    add(rolesInUse.roles.avoid, t("people.roleTags.avoid"));
    add(rolesInUse.roles.notasks, t("people.roleTags.notasks"));
    add(rolesInUse.trustedIds, t("people.roleTags.trusted"));
    teamState?.values.forEach((team, key) => add([key], t("proPeople.teamCluster", { team })));
    if (settings.pro?.enabled) add(settings.pro.people?.volunteers.map(volunteer => volunteer.key), t("proPeople.volunteerTag"));
    return labels;
  }, [settings, rolesInUse, teamState, t]);
  const photos = useMemo(() => Object.fromEntries((competition?.persons ?? []).map(person => [personKey(person), person.avatar?.thumbUrl])), [competition]);
  const signature = useMemo(() => settings ? generationSignature(settings) : "", [settings]);
  const pro = settings?.pro?.enabled ? settings.pro : undefined;
  const slots = useMemo(() => pro ? groupSlots(pro.schedule) : undefined, [pro]);
  /** Without PRO, the WCA schedule's group times: only for unavailabilities. */
  const wcaSchedule = useMemo(() => !pro && competition && settings ? importSchedule(competition, roundId => settings.rounds.find(round => round.id === roundId)?.groups ?? 1) : undefined, [pro, competition, settings]);
  const unavailableInUse = useMemo(() => [...(settings?.people.unavailable ?? []), ...(teamState?.unavailable ?? [])], [settings?.people.unavailable, teamState]);
  const availabilitySlots = useMemo(() => wcaSchedule && settings?.people.unavailable?.length ? groupSlots(wcaSchedule) : undefined, [wcaSchedule, settings?.people.unavailable]);
  /** Rounds as generated: in PRO mode, scheduled rounds take their groups from the schedule. */
  const effectiveRounds = useMemo(() => {
    if (!settings || !competition) return [];
    // Sets and station rules for "finals" need to know each event's last round.
    const finals = finalRoundIds(competition);
    return (slots ? withScheduledGroups(settings.rounds, slots) : settings.rounds).map(round => ({ ...round, final: finals.has(round.id) }));
  }, [settings, slots, competition]);
  const roundRules = useMemo(() => {
    if (!settings) return {};
    const { options, stations, zoneMode } = settings;
    const roles = teamState?.people ?? settings.people;
    // PRO: one data entry per time slot covers every group running then.
    const typingWindows = slots ? proposal.flatMap(item => item.tasks.filter(task => task.role === "dataentry").flatMap(task => slots.get(item.roundId)?.find(slot => slot.group === task.group)?.windows ?? [])) : [];
    const coveredGroups = (roundId: string) => new Set((slots?.get(roundId) ?? []).filter(slot => slot.windows.some(window => typingWindows.some(typing => typing.start < window.end && window.start < typing.end))).map(slot => slot.group));
    const noNormalTasks = new Set([...(roles.roles.dataentry ?? []), ...(roles.roles.notasks ?? []), ...(options.normalTasksForDelegatesAndOrganizers ? [] : [...(roles.roles.delegate ?? []), ...(roles.roles["trainee-delegate"] ?? []), ...(roles.roles.organizer ?? [])])]);
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
        dataEntryCovered: coveredGroups(round.id),
        noNormalTasks,
      } satisfies RoundRules];
    }));
  }, [settings, proposal, effectiveRounds, slots, teamState]);
  const handleReviewChange = useCallback((next: GeneratedAssignment[]) => setProposal(next), []);

  if (loading) return <main className="workspace-loading"><div /><p>{t("workspace.loading")}</p></main>;
  if (!competition || !settings) return <main className="missing-competition"><div><p className="kicker">{t("workspace.missingKicker")}</p><h1>{t("workspace.missingTitle")}</h1><p>{t("workspace.missingText")}</p><Link className="button primary" href="/dashboard">{t("workspace.backToList")}</Link></div></main>;

  const { stations, zoneMode, options } = settings;
  const rounds = effectiveRounds;
  const update = (change: Partial<WorkspaceSettings>) => setSettings(current => current && { ...current, ...change });
  /** Changes part of the PRO setup from the latest state, so several changes in one click all stay. */
  const updatePro = (change: (pro: ProConfig) => Partial<ProConfig>) => setSettings(current => {
    if (!current?.pro) return current;
    return { ...current, pro: { ...current.pro, enabled: true, ...change(current.pro) } };
  });
  const setOption = (key: OptionKey, value: boolean) => update({ options: { ...options, [key]: value } });
  const seating = normalizeSeating(settings.seating);
  const changeZone = (next: { stations?: number; zoneMode?: ZoneMode; seating?: Seating }) => {
    const nextSeating = next.seating ?? settings.seating;
    // Seating from the middle sets the stations: rows × tables × stations per table.
    const nextStations = nextSeating?.order === "center" ? seatingStations(nextSeating) : next.stations ?? stations;
    const nextMode = next.zoneMode ?? zoneMode;
    update({ stations: nextStations, zoneMode: nextMode, ...(nextSeating ? { seating: nextSeating } : {}), rounds: resuggestRounds(settings.rounds, nextStations, nextMode) });
  };
  const updateRound = (id: string, change: Partial<RoundConfig>) => update({ rounds: settings.rounds.map(round => round.id === id ? { ...round, ...change } : round) });
  const freshSchedule = (): ProSchedule => importSchedule(competition, roundId => settings.rounds.find(round => round.id === roundId)?.groups ?? 1);
  const setPro = (enabled: boolean) => {
    update({ pro: { ...settings.pro, enabled, schedule: settings.pro?.schedule ?? freshSchedule() } });
    if (!enabled && PRO_TABS.includes(tab)) changeTab("zone");
  };
  const setSchedule = (schedule: ProSchedule) => updatePro(() => ({ schedule }));
  /**
   * Starts again from the WCIF: downloads it again when possible (registrations and groups as
   * they are now), forgets every setting, volunteer and proposal of this competition, and opens
   * the WCIF's groups if it has any. PRO mode stays on if it was.
   */
  /** Another device's work, from a WCIF this app exported: it replaces what this browser has. */
  async function resumeFromFile(read: ReadFile) {
    if (!window.confirm(t("resume.confirm"))) return undefined;
    await storeSession(read);
    setWcifNote(undefined);
    setRefreshNote(undefined);
    openCompetition(read.competition, read.draft);
    // Shown above every tab, since the review may open.
    if (!read.draft) setRefreshNote(hasWcifGroups(read.competition) ? t("resume.groupsOnly") : t("resume.nothing"));
    else {
      setProposalVersion(version => version + 1);
      if (read.draft.assignments.length) changeTab("review");
      setRefreshNote(t("resume.restored", { date: savedAtText(read.savedAt, locale) }));
    }
    return undefined;
  }

  async function startFromScratch() {
    const [stored, current] = [competition, settings];
    if (!stored || !current || !window.confirm(t("workspace.restartConfirm"))) return;
    setRestarting(true);
    let data: StoredCompetition = stored;
    try {
      const response = await fetch(`/api/wca/competitions/${encodeURIComponent(stored.id)}`);
      if (response.ok) {
        data = await response.json() as StoredCompetition;
        await saveCompetition(data);
      }
    } catch {
      // Offline or a demo: the stored WCIF is used.
    }
    try { localStorage.removeItem(draftStorageKey(data.id)); } catch { /* storage blocked */ }
    setCompetition(data);
    const fresh = defaultSettings(data);
    const base = current.pro?.enabled || (hasWcifGroups(data) && wcifGroupsNeedStages(data)) ? { ...fresh, pro: { enabled: true, schedule: importSchedule(data, roundId => fresh.rounds.find(round => round.id === roundId)?.groups ?? 1) } } : fresh;
    setWcifNote(undefined);
    if (hasWcifGroups(data)) openWcifGroups(data, base);
    else {
      setSettings(base);
      setProposal([]);
      setGeneratedWith(undefined);
      setProposalVersion(version => version + 1);
      changeTab("zone");
    }
    setRestarting(false);
  }
  // Until first edited, PRO people start from the properties already in the WCIF.
  const proPeople: ProPeople = settings.pro?.people ?? { ...EMPTY_PRO_PEOPLE, ...importPersonProperties(competition) };
  const setProPeople = (next: ProPeople) => setSettings(current => {
    if (!current?.pro) return current;
    // A removed volunteer's unavailabilities go with them.
    const gone = new Set((current.pro.people?.volunteers ?? []).map(volunteer => volunteer.key).filter(key => !next.volunteers.some(volunteer => volunteer.key === key)));
    const unavailable = current.people.unavailable?.filter(item => !gone.has(item.personKey) && !gone.has(item.whileCompeting ?? ""));
    return { ...current, people: { ...current.people, ...(unavailable ? { unavailable } : {}) }, pro: { ...current.pro, enabled: true, people: next } };
  });
  /** Volunteers that copy a registered person, and properties of nobody: merged or dropped in one click. */
  const peopleRepair = pro ? { copies: findVolunteerCopies(competition, proPeople).length, orphans: orphanPropertyKeys(competition, proPeople).length } : undefined;
  const repairPeople = () => setSettings(current => {
    if (!current?.pro) return current;
    const merged = mergeVolunteerCopies(competition, current.pro.people ?? proPeople, current.people);
    return { ...current, people: merged.settings, pro: { ...current.pro, people: merged.people } };
  });
  const segments = settings.pro?.segments ?? [];
  const setSegments = (next: Segment[]) => updatePro(() => ({ segments: next }));
  /** Teams can be chosen wherever a cluster is: assignment sets, station rules, job eligibility, review filter. */
  // A saved cluster with the same rule (property = team) already stands for the team.
  const savedAs = (team: string) => segments.some(segment => segment.rules.length === 1 && segment.rules[0].kind === "property" && segment.rules[0].key === teamState?.property && segment.rules[0].op === "eq" && segment.rules[0].value === team && !segment.rules[0].negate);
  const teamClusters = teamState ? [...new Set(teamState.values.values())].sort().filter(team => !savedAs(team)).map(team => ({ id: teamClusterId(team), name: t("proPeople.teamCluster", { team }), members: new Set([...teamState.values].filter(([, value]) => value === team).map(([key]) => key)) })) : [];
  const peopleInUse = teamState?.people ?? settings.people;
  const sets = settings.pro?.sets ?? [];
  /** Applies a PRO template over the current setup; the schedule and people's data stay. */
  const applyProTemplate = (template: ProTemplate) => {
    const result = applyTemplate(settings, settings.pro?.schedule ?? freshSchedule(), template);
    setSettings(result.settings);
    return result.warnings;
  };
  const setSets = (next: AssignmentSetConfig[]) => updatePro(() => ({ sets: next }));
  const stationRuleList = settings.pro?.stationRules ?? [];
  const setStationRules = (next: StationRuleConfig[]) => updatePro(() => ({ stationRules: next }));
  /** The cluster of a template (same rules), created when missing. */
  const clusterFor = (templateId: "organizers" | "delegating") => {
    const template = SEGMENT_TEMPLATES.find(item => item.id === templateId)!;
    const same = segments.find(segment => JSON.stringify([segment.match, segment.rules]) === JSON.stringify([template.segment.match, template.segment.rules]));
    if (same) return same.id;
    const id = newSegmentId(segments);
    updatePro(current => ({ segments: [...(current.segments ?? []), { id, name: t(keyOf("segments.templates", templateId)), ...template.segment }] }));
    return id;
  };
  const jobs: JobEligibility = settings.pro?.jobs ?? {};
  const staffing = settings.pro?.staffing ?? {};
  const setStaffing = (lane: string, change: LaneStaffing) => {
    const next = { ...staffing[lane], ...change };
    for (const key of Object.keys(next) as Array<keyof LaneStaffing>) if (next[key] === undefined) delete next[key];
    const { [lane]: _previous, ...rest } = staffing;
    updatePro(() => ({ staffing: Object.keys(next).length ? { ...rest, [lane]: next } : rest }));
  };
  // Stage values are defaults: a round whose scramblers or runners were changed in Groups keeps its own.
  const laneStaffing = pro && slots ? staffingOf(slots, staffing) : undefined;
  /** Groups tab: a round not set by hand shows its stages' default when they all agree on one. */
  const shownStaff = (round: RoundConfig, field: "scramblers" | "runners") => {
    if (!laneStaffing || round.staffSetByHand) return round[field];
    const values = new Set((slots?.get(round.id) ?? []).map(slot => laneStaffing(round.id, slot.group)?.[field]));
    const [only] = values;
    return values.size === 1 && only !== undefined ? only : round[field];
  };
  const staffingFor = laneStaffing && ((roundId: string, group: number) => {
    const own = laneStaffing(roundId, group);
    if (!own || !settings.rounds.find(round => round.id === roundId)?.staffSetByHand) return own;
    // A round set by hand keeps its own scramblers and runners; stations and group sizes stay the stage's.
    return own.stations === undefined && own.maxPerGroup === undefined ? undefined : { stations: own.stations, maxPerGroup: own.maxPerGroup };
  });
  const scoring = settings.pro?.scoring ?? DEFAULT_SCORING;
  const setScoring = (next: ScoringConfig) => updatePro(() => ({ scoring: next }));
  const setJob = (role: JobRole, segmentId: string) => {
    const { [role]: _previous, ...rest } = jobs;
    updatePro(() => ({ jobs: segmentId ? { ...rest, [role]: segmentId } : rest }));
  };
  // PRO: people allowed to do each job, per event (segments can depend on the round's event).
  const eventIds = (competition.events ?? []).map(event => event.id);
  const eligible: Partial<Record<JobRole, Map<string, Set<string>>>> = pro ? Object.fromEntries(JOB_ROLES.flatMap(role => {
    const excluded = teamState?.jobExclusions[role];
    const team = teamClusters.find(item => item.id === jobs[role]);
    const segment = segments.find(item => item.id === jobs[role]);
    if (!team && !segment && !excluded?.size) return [];
    const all = everyone(competition, proPeople);
    const members = (eventId: string) => team ? team.members : segment ? new Set(segmentMembers(segment, all, { people: peopleInUse, pro: proPeople, segments, eventId }).map(personKey)) : new Set(all.map(personKey));
    return [[role, new Map(eventIds.map(eventId => [eventId, new Set([...members(eventId)].filter(key => !excluded?.has(key)))]))]];
  })) : {};
  /** Smallest and largest number of eligible people over the events, for the rules tab. */
  const eligibleRange = (role: JobRole) => {
    const sizes = [...(eligible[role]?.values() ?? [])].map(set => set.size);
    return sizes.length ? [Math.min(...sizes), Math.max(...sizes)] : undefined;
  };
  // PRO: people who work first in a room or stage: the cluster chosen in the zone tab (only
  // there) and teams with a room (first there, or only there).
  const laneTeams = pro && slots && (Object.values(staffing).some(lane => lane.team) || teamState?.lanes.first.size) ? (() => {
    const all = everyone(competition, proPeople);
    const context = { people: peopleInUse, pro: proPeople, segments };
    const byLane = new Map<string, Set<string>>();
    const only = new Set(teamState?.lanes.only ?? []);
    for (const [lane, own] of Object.entries(staffing)) {
      const segment = segments.find(item => item.id === own.team);
      const team = teamClusters.find(item => item.id === own.team);
      const members = team ? team.members : segment ? new Set(segmentMembers(segment, all, context).map(personKey)) : undefined;
      if (!members) continue;
      byLane.set(lane, new Set([...(byLane.get(lane) ?? []), ...members]));
      members.forEach(key => only.add(key));
    }
    for (const [lane, members] of teamState?.lanes.first ?? []) byLane.set(lane, new Set([...(byLane.get(lane) ?? []), ...members]));
    // A room key covers its stages.
    const forLane = (roomId: number, stageId?: number) => new Set([...(byLane.get(targetKey(roomId, stageId)) ?? []), ...(stageId === undefined ? [] : byLane.get(targetKey(roomId)) ?? [])]);
    return {
      forGroup: (roundId: string, group: number) => {
        const slot = slots.get(roundId)?.find(item => item.group === group);
        return slot ? forLane(slot.roomId, slot.stageId) : undefined;
      },
      members: only,
    };
  })() : undefined;
  // PRO: ordered assignment sets and station rules, resolved per round (a cluster may depend on the round's event).
  const membersOf = (() => {
    const cache = new Map<string, Set<string>>();
    let all: ReturnType<typeof everyone> | undefined;
    return (segmentId: string, eventId: string) => {
      const team = teamClusters.find(item => item.id === segmentId);
      if (team) return team.members;
      const segment = segments.find(item => item.id === segmentId);
      if (!segment) return undefined;
      const key = `${segmentId}|${eventId}`;
      all ??= everyone(competition, proPeople);
      if (!cache.has(key)) cache.set(key, new Set(segmentMembers(segment, all, { people: peopleInUse, pro: proPeople, segments, eventId }).map(personKey)));
      return cache.get(key);
    };
  })();
  const assignmentSets = pro && sets.some(set => !set.off) ? (round: GenerationRound) => resolveSets(sets, round, slots?.get(round.id), membersOf) : undefined;
  const stationRules = pro && stationRuleList.some(rule => !rule.off) ? (round: GenerationRound) => resolveStationRules(stationRuleList, round, slots?.get(round.id), membersOf) : undefined;
  const segmentFilters = pro && (segments.length || teamClusters.length) ? (() => {
    const context = { people: peopleInUse, pro: proPeople, segments };
    const all = everyone(competition, proPeople);
    return [...segments.map(segment => ({ id: segment.id, name: segment.name, members: new Set(segmentMembers(segment, all, context).map(personKey)) })), ...teamClusters];
  })() : undefined;

  /** Everyone who can be added to a round in the review: registered people, staff and, in PRO, volunteers. */
  const reviewPeople = everyone(competition, pro ? proPeople : undefined);
  const activeRounds = rounds.filter(round => round.enabled);
  // Rounds already held keep their assignments: they are neither suggested nor regenerated.
  const pastRoundIds = new Set(rounds.filter(round => roundHasResults(competition, round.id)).map(round => round.id));
  const roundsByTab = {
    past: rounds.filter(round => pastRoundIds.has(round.id)),
    ready: rounds.filter(round => !pastRoundIds.has(round.id) && round.competitorsKnown),
    pending: rounds.filter(round => !pastRoundIds.has(round.id) && !round.competitorsKnown),
  };
  const generatedRoundIds = new Set(proposal.map(item => item.roundId));
  const totalGroups = activeRounds.reduce((sum, round) => sum + round.groups, 0);
  const roomCount = competition.schedule?.venues?.reduce((sum, venue) => sum + (venue.rooms?.length ?? 0), 0) ?? 0;
  const proposalOutdated = proposal.length > 0 && generatedWith !== undefined && generatedWith !== signature;
  const delegatesWithoutDuties = options.assignDelegateDuties && !peopleInUse.delegateDutyIds.some(key => isDelegate(peopleInUse, key));

  /** Everything the generator needs except the rounds to generate. */
  const generationInput = { competition, stations, zoneMode, seating, people: peopleInUse, options, slots, eventWindows: pro ? eventBusyWindows(pro.schedule) : undefined, extraPeople: pro ? proPeople.volunteers.map(volunteerPerson) : [], unavailable: unavailableInUse, availabilitySlots, eligible, staffing: staffingFor, scoring: pro ? scoring : undefined, personProperties: pro ? proPeople.properties : undefined, laneTeams, assignmentSets, stationRules };
  // Mid-competition: enabled rounds with known competitors that the proposal does not have yet.
  const newRounds = proposal.length ? activeRounds.filter(round => round.competitorsKnown && !pastRoundIds.has(round.id) && !generatedRoundIds.has(round.id)) : [];
  const roundName = (round: { eventId: string; roundNumber: number }) => `${eventName(round.eventId)} R${round.roundNumber}`;

  /** Generates only the new rounds; the rest of the proposal stays as it is and counts for them. */
  function generateNewRounds() {
    if (!newRounds.length) return;
    const added = generateAssignments({ ...generationInput, rounds: newRounds, fixedAssignments: proposal });
    setProposal([...proposal, ...added]);
    setGeneratedWith(signature);
    setProposalVersion(version => version + 1);
    setRefreshNote(t("workspace.newRoundsDone", { rounds: newRounds.map(roundName).join(", ") }));
    changeTab("review");
  }

  /**
   * Downloads the WCIF again (results, registrations) and keeps the settings and the proposal:
   * rounds whose competitors are now known are switched on, ready for "Generate new rounds".
   */
  async function refreshFromWca() {
    if (!competition) return;
    setRefreshing(true);
    try {
      const response = await fetch(`/api/wca/competitions/${encodeURIComponent(competition.id)}`);
      if (!response.ok) { setRefreshNote(t("workspace.refreshFailed")); return; }
      const data = await response.json() as StoredCompetition;
      await saveCompetition(data);
      setCompetition(data);
      const aliases = staleKeys(data);
      if (aliases.size) {
        setSettings(current => current && rekeyPeople(current, aliases));
        setProposal(current => rekeyPeople(current, aliases));
      }
      // Someone else may have saved newer settings at the WCA.
      const saved = await readSettings(data);
      if (saved && saved.savedAt > (remoteSavedAt ?? "")) setRemoteNewer({ data, saved });
      const fresh = initialRounds(data, stations, zoneMode);
      const opened: string[] = [];
      setSettings(current => current && {
        ...current,
        rounds: current.rounds.map(round => {
          const now = fresh.find(item => item.id === round.id);
          if (!now) return round;
          if (now.competitorsKnown && !round.competitorsKnown) {
            opened.push(roundName(round));
            const known = { ...round, competitors: now.competitors, competitorsKnown: true, enabled: true };
            return round.staffSetByHand ? known : { ...shapeRound(known, current.stations, current.zoneMode), enabled: true };
          }
          return { ...round, competitors: now.competitors, competitorsKnown: now.competitorsKnown };
        }),
      });
      // Volunteers with a WCA ID keep the name the WCA has.
      const ids = (settings?.pro?.people?.volunteers ?? []).flatMap(volunteer => volunteer.wcaId ? [volunteer.wcaId] : []);
      const found = ids.length ? await fetchWcaNames(ids) : undefined;
      if (found) setSettings(current => {
        if (!current?.pro?.people) return current;
        const renamed = withWcaNames(current.pro.people, found.people);
        return renamed.changed ? { ...current, pro: { ...current.pro, people: renamed.people } } : current;
      });
      setRefreshNote(opened.length ? t("workspace.refreshNew", { rounds: opened.join(", ") }) : t("workspace.refreshNothing"));
    } catch {
      setRefreshNote(t("workspace.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }

  function createProposal() {
    if (!competition || !settings) return;
    if (proposal.length && !window.confirm(t("workspace.confirmReplace"))) return;
    // Rounds already held keep their assignments, and count for the rest as fixed ones.
    const kept = proposal.filter(item => pastRoundIds.has(item.roundId));
    const keptIds = new Set(kept.map(item => item.roundId));
    setProposal([...kept, ...generateAssignments({ ...generationInput, rounds: activeRounds.filter(round => !keptIds.has(round.id)), fixedAssignments: kept })]);
    setGeneratedWith(signature);
    setProposalVersion(version => version + 1);
    changeTab("review");
  }

  // With no round held yet, the "past" tab does not show: open the next one.
  const shownTab = roundTab === "past" && !roundsByTab.past.length ? "ready" : roundTab;
  const shownRounds = roundsByTab[shownTab];

  /** Deletes a round's assignments, to generate it again (with "Generate new rounds"). */
  function clearRound(round: RoundConfig) {
    if (!window.confirm(t("rounds.clearConfirm", { round: roundName(round) }))) return;
    setProposal(proposal.filter(item => item.roundId !== round.id));
    setProposalVersion(version => version + 1);
    setRefreshNote(t("rounds.cleared", { round: roundName(round) }));
  }
  // Excluded rounds (known competitors, switched off) go to the bottom, greyed out.
  const isExcluded = (round: RoundConfig) => round.competitorsKnown && round.competitors > 0 && !round.enabled;
  const orderedRounds = [...shownRounds.filter(round => !isExcluded(round)), ...shownRounds.filter(isExcluded)];
  const tabs: Array<{ id: Tab; label: string; done?: boolean; disabled?: boolean }> = TABS.filter(id => pro || !PRO_TABS.includes(id)).map(id => ({
    id,
    label: t(keyOf("tabs", id)),
    ...(id === "review" ? { done: proposal.length > 0, disabled: proposal.length === 0 } : {}),
    ...(id === "publish" ? { disabled: proposal.length === 0 } : {}),
  }));
  const outdatedNote = proposalOutdated && <div className="outdated-note" role="status"><p><strong>{t("workspace.outdatedTitle")}</strong> {t("workspace.outdatedText")}</p></div>;

  return <main className="workspace-shell">

    <section className="workspace-main">
      {/* No sidebar: the mark, the competition and the steps all live in these two bars. */}
      <header className="workspace-topbar"><div><Link className="product-mark compact" href="/dashboard" title={t("workspace.breadcrumb")}><AppMark /></Link><strong title={competition.id}>{competition.name}</strong><Link className="change-competition" href="/dashboard">{t("workspace.changeCompetition")}</Link><button type="button" className="change-competition refresh" disabled={refreshing} onClick={refreshFromWca} title={t("workspace.refreshHelp")}>{refreshing ? t("workspace.refreshing") : t("workspace.refresh")}</button><button type="button" className="change-competition restart" disabled={restarting} onClick={startFromScratch} title={t("workspace.restartHelp")}>{restarting ? t("workspace.restarting") : t("workspace.restart")}</button></div><div className="workspace-topbar-actions"><label className={`pro-switch ${pro ? "on" : ""}`} title={t("pro.toggleHelp")}><input type="checkbox" role="switch" checked={!!pro} onChange={event => setPro(event.target.checked)} /><span>{t("pro.toggle")}</span></label><div className="sync-state"><i /> {t("workspace.savedHere")}</div><LanguageSwitcher compact /><ThemeToggle compact /><span className="user-badge" title={`${userName} · ${t("auth.wcaAccount")}`}>{userName.slice(0, 1).toUpperCase()}</span></div></header>
      <nav className="workspace-tabs" role="tablist" aria-label={t("workspace.sections")}>
        {tabs.map((item, index) => <button key={item.id} role="tab" type="button" aria-selected={tab === item.id} className={[tab === item.id && "active", item.done && "done"].filter(Boolean).join(" ")} disabled={item.disabled} title={item.disabled ? t("workspace.generateFirst") : undefined} onClick={() => changeTab(item.id)}><span className="step-number">{item.done && tab !== item.id ? "✓" : index + 1}</span>{item.label}</button>)}
      </nav>
      <div className="workspace-content">
        {remoteNewer && <p className="setup-note refresh-note remote-newer" role="status"><span>{remoteText("sync.remoteNewer", remoteNewer.saved)}</span><button type="button" className="button secondary" onClick={loadRemoteSettings}>{t("sync.loadRemote")}</button><button type="button" className="rule-remove" onClick={() => setRemoteNewer(undefined)} aria-label={t("workspace.dismiss")}>×</button></p>}
        {refreshNote && <p className="setup-note refresh-note" role="status">{refreshNote}<button type="button" className="rule-remove" onClick={() => setRefreshNote(undefined)} aria-label={t("workspace.dismiss")}>×</button></p>}
        {tab === "zone" && <>
          <section className="data-strip" id="summary">
            <div><small>{t("workspace.stats.accepted")}</small><strong>{people.length}</strong></div><div><small>{t("workspace.stats.events")}</small><strong>{competition.events?.length ?? 0}</strong></div><div><small>{t("workspace.stats.rooms")}</small><strong>{roomCount}</strong></div><div><small>{t("workspace.stats.activeRounds")}</small><strong>{activeRounds.length}</strong></div>
          </section>
          <ResumeFromFile competitionId={competition.id} onRead={resumeFromFile} />
          <section className="setup-panel">
            <div className="setup-heading"><h2>{t("zone.title")} <Hint align="start" text={t("zone.hint")} /></h2></div>
            <div className="setup-grid">
              <label><span>{t("zone.stations")}</span><div className="number-field" title={seating.order === "center" ? t("seating.fromLayout") : undefined}><button disabled={seating.order === "center"} aria-label={t("zone.removeStation")} onClick={() => changeZone({ stations: Math.max(1, stations - 1) })}>−</button><strong>{stations}</strong><button disabled={seating.order === "center"} aria-label={t("zone.addStation")} onClick={() => changeZone({ stations: stations + 1 })}>+</button></div></label>
              <div className="preset-field"><span>{t("zone.entry")}</span><div className="segmented three">{ZONE_MODES.map(mode => <button key={mode} className={zoneMode === mode ? "selected" : ""} title={t(keyOf("zone.modes", `${mode}.help`))} onClick={() => changeZone({ zoneMode: mode })}>{t(keyOf("zone.modes", `${mode}.label`))}</button>)}</div><small>{t(keyOf("zone.modes", `${zoneMode}.help`))}</small></div>
            </div>
            <div className="seating">
              <label className="seating-toggle"><input type="checkbox" checked={seating.order === "center"} onChange={event => changeZone({ seating: event.target.checked ? { ...layoutFor(stations, seating), order: "center" } : { ...seating, order: "ranked" } })} /><strong>{t("seating.center")}</strong><Hint text={t("seating.hint")} /></label>
              {seating.order !== "center" && <small>{t("seating.default")}</small>}
              {/* Station rules that seat from the centre need the tables of a row even when the general seating is in order. */}
              {seating.order !== "center" && pro && (settings.pro?.stationRules ?? []).some(rule => !rule.off && rule.seating === "center") && <div className="seating-layout">
                {(["tables", "seats"] as const).map(key => <label key={key}><span>{t(keyOf("seating", key))}</span><Stepper label={t(keyOf("seating", key))} value={seating[key]} min={1} onChange={value => changeZone({ seating: { ...seating, rowTables: undefined, [key]: Math.min(99, value) } })} /></label>)}
                <small className="seating-for-rules">{t("seating.forRules")}</small>
              </div>}
              {seating.order === "center" && <>
                <div className="seating-layout">
                  <label><span>{t("seating.rows")}</span><Stepper label={t("seating.rows")} value={seating.rows} min={1} onChange={value => {
                    // A new row copies the last one.
                    const rows = Math.min(99, value);
                    changeZone({ seating: normalizeSeating({ ...seating, rows, rowTables: Array.from({ length: rows }, (_, row) => tablesInRow(seating, row)) }) });
                  }} /></label>
                  <label><span>{t("seating.seats")}</span><Stepper label={t("seating.seats")} value={seating.seats} min={1} onChange={value => changeZone({ seating: { ...seating, seats: Math.min(99, value) } })} /></label>
                  <span className="seating-total">= {t("seating.total", { count: seatingStations(seating) })}</span>
                </div>
                <SeatingPreview seating={seating} onTables={(row, count) => changeZone({ seating: normalizeSeating({ ...seating, rowTables: Array.from({ length: seating.rows }, (_, index) => index === row ? Math.min(99, count) : tablesInRow(seating, index)) }) })} />
              </>}
            </div>
            {pro && <>
              <h3 className="panel-subheading">{t("templates.title")} <Hint align="start" text={t("templates.hint")} /></h3>
              <ProTemplatePanel onApply={applyProTemplate} onExport={() => exportTemplate(settings, `${competition.shortName ?? competition.name} PRO`)} />
              <h3 className="panel-subheading">{t("staffing.title")} <Hint align="start" text={t("staffing.hint")} /></h3>
              <p className="setup-note staffing-note">{t("staffing.note")}</p>
              <div className="round-table staffing-grid">
                <div className="round-table-head"><span>{t("staffing.lane")}</span><span>{t("zone.stations")}</span><span>{t("staffing.maxPerGroup")} <Hint text={t("staffing.maxPerGroupHint")} /></span><span><i className="cell-chip mini scrambler">{TASK_CODES.scrambler}</i> {t("rounds.columnScramblers")}</span><span><i className="cell-chip mini runner">{TASK_CODES.runner}</i> {t("rounds.columnRunners")}</span><span>{t("staffing.team")} <Hint text={t("staffing.teamHint")} /></span></div>
                {scheduleLanes(pro.schedule).map(lane => {
                  const own = staffing[lane.key] ?? {};
                  const laneStations = own.stations ?? stations;
                  return <div key={lane.key} className="round-row">
                    <div><i className="lane-dot" style={{ background: lane.color }} /><div className="round-name"><strong>{lane.name}</strong>{lane.stageId !== undefined && <small>{lane.roomName}</small>}</div></div>
                    <Stepper label={t("zone.stations")} value={laneStations} min={1} big onChange={value => setStaffing(lane.key, { stations: value })} />
                    {own.maxPerGroup === undefined
                      ? <button type="button" className="plain max-per-group-off" onClick={() => setStaffing(lane.key, { maxPerGroup: laneStations })} title={t("staffing.maxPerGroupSet")}>{t("staffing.noMax")}</button>
                      : <span className="max-per-group"><Stepper label={t("staffing.maxPerGroup")} value={own.maxPerGroup} min={1} onChange={value => setStaffing(lane.key, { maxPerGroup: value })} /><button type="button" className="rule-remove" onClick={() => setStaffing(lane.key, { maxPerGroup: undefined })} aria-label={t("staffing.clearMax", { lane: lane.name })}>×</button></span>}
                    {/* Without a value of its own, each round keeps its suggestion; a click starts from the usual one per five or eight stations. */}
                    <Stepper label={t("rounds.stepperScramblers")} variant="scrambler" value={own.scramblers ?? suggestScramblers(laneStations, 1, laneStations)} auto={own.scramblers === undefined} min={0} onChange={value => setStaffing(lane.key, { scramblers: value })} />
                    <Stepper label={t("rounds.stepperRunners")} variant="runner" value={own.runners ?? suggestRunners(laneStations, 1, laneStations)} auto={own.runners === undefined} min={0} onChange={value => setStaffing(lane.key, { runners: value })} />
                    <select className="lane-team" value={own.team ?? ""} onChange={event => setStaffing(lane.key, { team: event.target.value || undefined })} aria-label={`${lane.name} · ${t("staffing.team")}`}><option value="">{t("staffing.noTeam")}</option>{segments.map(segment => <option key={segment.id} value={segment.id}>{segment.name}</option>)}{teamClusters.length > 0 && <optgroup label={t("proPeople.teams")}>{teamClusters.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</optgroup>}</select>
                  </div>;
                })}
              </div>
            </>}
            {roomCount > 1 && !pro && <p className="setup-note">{t("zone.rooms", { count: roomCount })}</p>}
          </section>
        </>}

        {tab === "schedule" && pro && <ProSchedulePanel schedule={pro.schedule} rounds={settings.rounds} onChange={setSchedule} onReimport={() => setSchedule(freshSchedule())} />}

        {tab === "rules" && <section className="rules-panel">
          <div className="setup-heading"><h2>{t("rules.title")}</h2></div>
          <h3 className="panel-subheading">{t("rules.sortingTitle")} <Hint align="start" text={t("rules.sortingHint")} /></h3>
          <div className="sorting-rules" role="radiogroup" aria-label={t("rules.sortingTitle")}>{SORTING_RULES.map(rule => <button key={rule} role="radio" aria-checked={options.sortingRule === rule} title={t(keyOf("rules.sorting", `${rule}.help`))} className={options.sortingRule === rule ? "selected" : ""} onClick={() => update({ options: { ...options, sortingRule: rule } })}><span className="rule-title"><span className="preset-radio" /><SortingRuleIcon rule={rule} /></span><strong>{t(keyOf("rules.sorting", `${rule}.label`))}</strong><small>{t(keyOf("rules.sorting", `${rule}.short`))}</small>{rule === "scrambler-safe" && <em className="recommended">{t("rules.recommended")}</em>}</button>)}</div>
          <div className="split-extras">
            <label><input type="checkbox" checked={options.separateNames} onChange={event => setOption("separateNames", event.target.checked)} /><strong>{t("rules.separateNames.label")}</strong><Hint text={t("rules.separateNames.help")} /></label>
          </div>
          <div className="top-together">
            <label><input type="checkbox" checked={options.topTogether} onChange={event => setOption("topTogether", event.target.checked)} /><strong>{t("rules.topTogether.label")}</strong><Hint text={t("rules.topTogether.help")} /></label>
            {options.topTogether && <div className="top-together-events" role="group" aria-label={t("rules.topTogether.events")}>{(competition.events ?? []).map(event => event.id).map(eventId => {
              const count = options.topTogetherCounts[eventId];
              const setCount = (next: number | undefined) => {
                const { [eventId]: _old, ...rest } = options.topTogetherCounts;
                update({ options: { ...options, topTogetherCounts: next === undefined ? rest : { ...rest, [eventId]: topTogetherCountOf(next) } } });
              };
              return <span key={eventId} className={count ? "top-together-event on" : "top-together-event"}>
                <button type="button" aria-pressed={!!count} title={eventName(eventId)} onClick={() => setCount(count ? undefined : TOP_TOGETHER_COUNT)}><EventIcon eventId={eventId} label={eventName(eventId)} /><span>{eventName(eventId)}</span></button>
                {!!count && <span className="top-together-stepper">
                  <button type="button" disabled={count <= 1} onClick={() => setCount(count - 1)} aria-label={t("rules.topTogether.less", { event: eventName(eventId) })}>−</button>
                  <input type="number" inputMode="numeric" min={1} max={999} value={count} onChange={event => setCount(Number(event.target.value) || 1)} onFocus={event => event.target.select()} aria-label={t("rules.topTogether.count", { event: eventName(eventId) })} />
                  <button type="button" disabled={count >= 999} onClick={() => setCount(count + 1)} aria-label={t("rules.topTogether.more", { event: eventName(eventId) })}>+</button>
                </span>}
              </span>;
            })}</div>}
          </div>
          <h3 className="panel-subheading">{t("rules.tasksTitle")}</h3>
          <div className="option-list">{MAIN_OPTIONS.map(({ key, codes }) => <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOption(key, event.target.checked)} /><span><strong>{t(keyOf("rules.options", `${key}.label`))}{codes?.map(code => <i key={code} className={`cell-chip mini ${code}`} aria-hidden="true">{TASK_CODES[code]}</i>)}<Hint text={t(keyOf("rules.options", `${key}.help`))} /></strong></span></label>)}</div>
          {pro && <>
            <h3 className="panel-subheading">{t("sets.title")} <Hint align="start" text={t("sets.hint")} /></h3>
            <AssignmentSetsPanel sets={sets} onChange={setSets} segments={(segmentFilters ?? []).map(segment => ({ id: segment.id, name: segment.name, size: segment.members.size }))} lanes={scheduleLanes(pro.schedule)} rounds={rounds} onCluster={clusterFor} preview={sets.length ? previewSets({ competition, sets, rounds, slots, membersOf, maxPerGroup: (roundId, group) => staffingFor?.(roundId, group)?.maxPerGroup }) : undefined} />
            <h3 className="panel-subheading">{t("stationRules.title")} <Hint align="start" text={t("stationRules.hint")} /></h3>
            <StationRulesPanel seating={seating} rules={stationRuleList} onChange={setStationRules} segments={(segmentFilters ?? []).map(segment => ({ id: segment.id, name: segment.name, size: segment.members.size }))} lanes={scheduleLanes(pro.schedule)} rounds={rounds} propertyKeys={proPeople.propertyKeys} />
            <h3 className="panel-subheading">{t("jobs.title")} <Hint align="start" text={t("jobs.hint")} /></h3>
            <div className="job-eligibility">{JOB_ROLES.map(role => <label key={role}><span><i className={`cell-chip mini ${role}`} aria-hidden="true">{TASK_CODES[role]}</i>{t(keyOf("tasks", role))}</span>
              <select value={jobs[role] ?? ""} onChange={event => setJob(role, event.target.value)}><option value="">{t("jobs.anyone")}</option>{segments.map(segment => <option key={segment.id} value={segment.id}>{segment.name}</option>)}{teamClusters.length > 0 && <optgroup label={t("proPeople.teams")}>{teamClusters.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</optgroup>}</select>
              {eligibleRange(role) && <small>{eligibleRange(role)![0] === eligibleRange(role)![1] ? tp("segments.members", eligibleRange(role)![0]) : t("jobs.range", { min: eligibleRange(role)![0], max: eligibleRange(role)![1] })}</small>}
            </label>)}</div>
            {!segments.length && <p className="setup-note">{t("jobs.noSegments")}</p>}
            <h3 className="panel-subheading">{t("scoring.title")} <Hint align="start" text={t("scoring.hint")} /></h3>
            <ProScoringPanel value={scoring} onChange={setScoring} />
          </>}
          {delegatesWithoutDuties && <p className="setup-note warning-note">{t("rules.noDelegateDuties")}</p>}
          <button className="plain more-toggle" type="button" aria-expanded={showMoreOptions} onClick={() => setShowMoreOptions(value => !value)}>{showMoreOptions ? t("rules.lessOptions") : t("rules.moreOptions")}</button>
          {showMoreOptions && <>
            <div className="option-list">{MORE_OPTIONS.map(key => <label key={key}><input type="checkbox" checked={options[key]} onChange={event => setOption(key, event.target.checked)} /><span><strong>{t(keyOf("rules.options", `${key}.label`))}<Hint text={t(keyOf("rules.options", `${key}.help`))} /></strong></span></label>)}</div>
            <h3 className="panel-subheading">{t("taskOrder.title")} <Hint align="start" text={t("taskOrder.hint")} /></h3>
            <TaskOrderPanel order={options.taskOrder} onChange={taskOrder => update({ options: { ...options, taskOrder } })} weighted={!!pro && scoring.enabled} active={{ delegate: options.assignDelegateDuties, scrambler: true, dataentry: options.assignDataEntry, runner: options.assignJudges, judge: options.assignJudges }} />
          </>}
        </section>}

        {tab === "people" && <><PeoplePanel people={pro ? everyone(competition, proPeople) : rolePeople} settings={settings.people} inUse={peopleInUse} fromTeam={teamState?.fromTeam} onChange={next => update({ people: next })} delegateDuties={options.assignDelegateDuties} showPhotos={showPhotos} onShowPhotosChange={changeShowPhotos} />
          <UnavailabilityPanel people={pro ? everyone(competition, proPeople) : rolePeople} days={(pro?.schedule ?? wcaSchedule)?.days ?? []} value={settings.people.unavailable ?? []} onChange={unavailable => update({ people: { ...settings.people, unavailable } })} />
          {pro && <ProPeoplePanel repair={peopleRepair} onRepair={repairPeople} people={everyone(competition, proPeople)} days={pro.schedule.days} value={proPeople} onChange={setProPeople} lanes={laneChoices(pro.schedule)} onReimport={() => { const imported = importPersonProperties(competition); setProPeople({ ...proPeople, propertyKeys: [...new Set([...proPeople.propertyKeys, ...imported.propertyKeys])], properties: { ...proPeople.properties, ...imported.properties } }); }} />}
        </>}

        {tab === "segments" && pro && <ProSegmentsPanel people={everyone(competition, proPeople)} eventIds={(competition.events ?? []).map(event => event.id)} settings={peopleInUse} proPeople={proPeople} segments={segments} onChange={setSegments} />}

        {tab === "rounds" && <>
          {outdatedNote}
          <section className="round-section" id="groups">
            <div className="section-heading"><div><h2>{t("rounds.title")} {shownTab === "pending" && <Hint align="start" text={t("rounds.laterHint")} />}</h2></div><div className="group-total"><small>{t("rounds.plannedTotal")}</small><strong>{tp("rounds.groups", totalGroups)}</strong></div></div>
            <div className="round-subtabs" role="tablist">{(["past", "ready", "pending"] as const).filter(id => id !== "past" || roundsByTab.past.length > 0).map(id => <button key={id} role="tab" aria-selected={shownTab === id} className={shownTab === id ? "active" : ""} onClick={() => setRoundTab(id)} title={t(keyOf("rounds.tabsHelp", id))}>{t(keyOf("rounds.tabs", id))} <span>{roundsByTab[id].length}</span></button>)}</div>
            {shownRounds.length === 0 ? <p className="setup-note">{t(keyOf("rounds.empty", shownTab))}</p> : <div className="round-table">
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
                    <div><EventIcon eventId={round.eventId} label={eventName(round.eventId)} /><div className="round-name"><strong>{eventName(round.eventId)}</strong><small>{t("rounds.roundNumber", { number: round.roundNumber })} · {round.eventId}{generatedRoundIds.has(round.id) && <> · <span className="round-generated">{t("rounds.generated")}</span> <button type="button" className="round-clear" onClick={() => clearRound(round)} title={t("rounds.clearHelp")}>{t("rounds.clear")}</button></>}</small></div></div>
                    <span className="round-number" data-label={t("rounds.columnCompetitors")}>{round.competitorsKnown ? round.competitors : `≈ ${round.competitors}`}</span>
                    <span data-label={t("rounds.columnEntry")}>{fixed ? t("rounds.fixed") : t("rounds.waiting")}</span>
                    <div className="group-cell">{pro && slots?.has(round.id)
                      // PRO: the total is set here and spread over the round's blocks in the schedule.
                      ? <><Stepper label={t("rounds.stepperGroups")} value={round.groups - (slots?.get(round.id) ?? []).filter(slot => slot.linkedTo).length} min={minScheduledGroups(pro.schedule, round.id)} big disabled={excluded} onChange={groups => setSchedule(setRoundGroups(pro.schedule, round.id, groups))} />
                        <button type="button" className="lane-split" title={t("rounds.fromSchedule")} onClick={() => changeTab("schedule")}>{scheduleLanes(pro.schedule).flatMap(lane => {
                          const count = slots.get(round.id)!.filter(slot => targetKey(slot.roomId, slot.stageId) === lane.key).length;
                          return count ? [<span key={lane.key} title={lane.name}><i style={{ background: lane.color }} />{count}</span>] : [];
                        })}</button></>
                      : <Stepper label={t("rounds.stepperGroups")} value={round.groups} min={1} big disabled={excluded} onChange={groups => updateRound(round.id, { groups })} />}<small>{perGroup}</small></div>
                    <Stepper label={t("rounds.stepperScramblers")} variant="scrambler" value={shownStaff(round, "scramblers")} min={0} disabled={excluded} onChange={scramblers => updateRound(round.id, { scramblers, ...(pro ? { staffSetByHand: true } : {}) })} />
                    <Stepper label={t("rounds.stepperRunners")} variant="runner" value={shownStaff(round, "runners")} min={0} disabled={excluded || !options.assignJudges} onChange={runners => updateRound(round.id, { runners, ...(pro ? { staffSetByHand: true } : {}) })} />
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
          {wcifNote && <p className="setup-note wcif-note" role="status">{t("workspace.wcifGroups", { count: wcifNote.count })}{wcifNote.unplaced > 0 && ` ${t("workspace.wcifUnplaced", { count: wcifNote.unplaced })}`}</p>}
          {outdatedNote}
          {proposal.length > 0 && <GroupReview key={proposalVersion} initialAssignments={proposal} pastRounds={pastRoundIds} everyone={reviewPeople} rules={pro ? Object.fromEntries(Object.entries(roundRules).map(([id, rules]) => {
            const eventId = rounds.find(round => round.id === id)?.eventId ?? "";
            const byGroup = staffingFor ? Object.fromEntries((slots?.get(id) ?? []).flatMap(slot => staffingFor(id, slot.group) ? [[slot.group, staffingFor(id, slot.group)!]] : [])) : undefined;
            return [id, { ...rules, byGroup, eligible: Object.fromEntries(JOB_ROLES.flatMap(role => eligible[role]?.get(eventId) ? [[role, eligible[role]!.get(eventId)!]] : [])) }];
          })) : roundRules} roomName={competition.schedule?.venues?.[0]?.rooms?.[0]?.name} onChange={handleReviewChange} photos={photos} showPhotos={showPhotos} onShowPhotosChange={changeShowPhotos} roleLabels={roleLabels} slots={slots} rooms={pro?.schedule.rooms} unavailable={unavailableInUse} availabilitySlots={availabilitySlots} segmentFilters={segmentFilters} />}
        </>}

        {tab === "publish" && <PublishPanel competition={competition} draft={{ version: 3, settings, generatedWith, assignments: proposal }} outdated={proposalOutdated} userName={userName} offline={offline} lastPublished={remoteSavedAt} onPublished={afterPublish} assignments={proposal} rounds={rounds} slots={slots} schedule={pro?.schedule} people={pro ? proPeople : undefined} />}
        {tab === "print" && <PrintingPanel key={proposalVersion} competition={competition} rounds={rounds} assignments={proposal} stations={stations} zoneMode={zoneMode} printing={settings.printing} schedule={pro?.schedule} slots={slots} onChange={printing => update({ printing })} />}
      </div>
      <footer className="workspace-actions"><div><strong>{tp("workspace.activeRounds", activeRounds.length)}</strong><span> · {tp("workspace.plannedGroups", totalGroups)}</span></div><div>{(() => {
        // Groups are only generated from the Groups step; every other step leads to the next one.
        if (tab === "rounds") return <>
          {newRounds.length > 0 && <button className="button primary" onClick={generateNewRounds} title={newRounds.map(roundName).join(", ")}>{tp("workspace.generateNew", newRounds.length)}</button>}
          <button className={`button ${newRounds.length ? "secondary" : "primary"}`} onClick={createProposal} disabled={!activeRounds.length}>{proposal.length ? t("workspace.regenerate") : t("workspace.create")}</button>
        </>;
        const next = tabs[tabs.findIndex(item => item.id === tab) + 1];
        return next && !next.disabled && <button className="button primary" onClick={() => changeTab(next.id)}>{t("workspace.next", { step: next.label })} →</button>;
      })()}</div></footer>
    </section>
  </main>;
}

/** `auto`: the value is a suggestion nobody has set yet, shown muted. */
/** Rows, tables and stations per table for the current stations: two per table, one row. */
function layoutFor(stations: number, seating: Seating): Seating {
  if (seatingStations(seating) === stations) return seating;
  return { ...seating, rows: 1, seats: 2, tables: Math.max(1, Math.ceil(stations / 2)) };
}

/**
 * The room seen from the front, with the tables of each row: each table shows the place in the
 * group (1 = the best) of each station.
 */
function SeatingPreview({ seating, onTables }: { seating: Seating; onTables: (row: number, tables: number) => void }) {
  const { t } = useI18n();
  const order = stationOrder(seatingStations(seating), seating);
  const place = new Map(order.map((station, index) => [station, index + 1]));
  const firstOf = (row: number) => Array.from({ length: row }, (_, index) => tablesInRow(seating, index) * seating.seats).reduce((sum, count) => sum + count, 0);
  return <figure className="seating-preview">
    <div className="seating-rows">{Array.from({ length: seating.rows }, (_, row) => {
      const name = row === 0 ? t("seating.front") : t("seating.row", { row: row + 1 });
      return <div key={row} className="seating-row">
      <span className="seating-row-label">{name}</span>
      <span className="seating-row-tables"><Stepper label={t("seating.tablesIn", { row: name })} value={tablesInRow(seating, row)} min={1} onChange={count => onTables(row, count)} /><small>{t("seating.tablesShort")}</small></span>
      <div className="seating-tables">{Array.from({ length: tablesInRow(seating, row) }, (_, table) => <div key={table} className="seating-table">{Array.from({ length: seating.seats }, (_, seat) => {
        const station = firstOf(row) + table * seating.seats + seat + 1;
        const rank = place.get(station)!;
        return <span key={seat} className={rank === 1 ? "seat best" : "seat"} title={t("seating.seatTitle", { rank, station })}><strong>{rank}</strong><small>{station}</small></span>;
      })}</div>)}</div>
    </div>;
    })}</div>
    <figcaption>{t("seating.caption")}</figcaption>
  </figure>;
}

function Stepper({ label, value, min, disabled = false, big = false, auto = false, variant, onChange }: { label: string; value: number; min: number; disabled?: boolean; big?: boolean; auto?: boolean; variant?: "scrambler" | "runner"; onChange: (value: number) => void }) {
  const { t } = useI18n();
  return <div className={["mini-stepper", big && "big", auto && "auto", variant].filter(Boolean).join(" ")} title={auto ? t("staffing.auto") : undefined} data-label={label}><button disabled={disabled || value <= min} aria-label={t("rounds.remove", { thing: label })} onClick={() => onChange(value - 1)}>−</button><strong aria-label={`${value} ${label}`}>{value}</strong><button disabled={disabled} aria-label={t("rounds.add", { thing: label })} onClick={() => onChange(value + 1)}>+</button></div>;
}
