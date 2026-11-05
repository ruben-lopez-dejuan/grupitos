/*
 * The Spanish Championship 2026 setup, from the CompScript scripts by aasalobrena
 * (github.com/aasalobrena/Scripts-Compscript, SpanishChampionship2026, commit 9d6e98a, 03/11/2026):
 * teams (Volunteers), first-round assignment sets (FirstRoundAssignGroups, 6_assign_main.cs),
 * delegates by cluster and day (DelegateStage), side room staff (4_assign_side.cs) and Groupifier
 * print options (0_groupifier_config.cs). See docs/NACIONAL_2026_EN_LA_WEB.md.
 * Where the organizers decided otherwise, the decision wins (05/11/2026): 14 stations and 16 judges,
 * at most 21 per group on Bizkaia and 28 elsewhere, and the people in the individual puzzle contest
 * do not compete in Square-1, 6x6 or 3BLD (no sets for them: the review lists anyone left).
 * Later rounds from the 2026 scripts (1_saturday/0_after_333bf-r1.cs, lib/_assign.cs and
 * lib/_volunteers.cs, which are still being written): the clock, 7x7, Square-1 and 6x6 finals and
 * 3BLD round 2. The other later rounds are provisional, from the Spanish Championship 2025 scripts
 * (the 2026 ones are not written yet): finals split odd and even with Spaniards first (lib/_finals.cs), the 3x3 final
 * head to head (3_monday/3_assign_333-r4.cs), the 3x3 semifinal by position per stage
 * (2_sunday/5_assign_333-r3.cs) and the top featured on the main stage elsewhere
 * (NormalRoundAssignmentSets).
 */
import type { AssignmentSetConfig } from "@/lib/pro/assignment-sets";
import type { Segment } from "@/lib/pro/segments";
import { TEMPLATE_FORMAT, type ProTemplate } from "@/lib/pro/template";
import { teamClusterId } from "@/lib/pro/teams";

const ARABA = "Araba";
const BIZKAIA = "Bizkaia";
const GIPUZKOA = "Gipuzkoa";
const SIDE = "Sala Auxiliar";

/** First rounds of each day with delegates' sets, on the three stages (the side room rounds have their own). */
const SATURDAY = ["clock-r1", "sq1-r1", "666-r1", "555-r1", "minx-r1"];
/** The first rounds on two stages: delegates go by delegate-cluster-extra (5 and 6). */
const TWO_STAGES = ["777-r1", "333bf-r1"];
const SUNDAY = ["pyram-r1", "444-r1", "222-r1", "skewb-r1", "333-r1", "333oh-r1"];
/** FinalAssignGroups in the 2026 scripts. The other finals are not in them yet. */
const FINALS_2026 = ["clock-r2", "777-r2", "sq1-r2", "666-r2"];
/** Every event's last round: 3 scramblers and 3 runners. */
const ALL_FINALS = [...FINALS_2026, "555-r2", "minx-r2", "333bf-r3", "333-r4", "222-r3", "444-r3", "333oh-r3", "pyram-r3", "skewb-r3"];
/** Later rounds that are not finals, by day (3x3 round 3 and 3BLD round 2 have their own sets). */
const SUNDAY_LATER = ["pyram-r2"];
const MONDAY_LATER = ["333-r2", "444-r2", "222-r2", "333oh-r2", "skewb-r2"];
/** 3x3 final: group 1 on Gipuzkoa alone, then 6 on Bizkaia and Gipuzkoa at once. */
const FINAL_333_PAIRS = [2, 3, 4, 5, 6, 7];

/** 5 featured per group of Bizkaia, like the third argument of FirstRoundAssignGroups. */
const FEATURED = 5;
/**
 * Top per group of Bizkaia, the fourth argument of FirstRoundAssignGroups. Pyraminx is 22 in the
 * scripts: 21 here, because Bizkaia takes at most 1.5 per station.
 */
const TOP: Record<string, number> = { clock: 18, "777": 18, sq1: 15, "666": 14, "333bf": 18, "555": 20, minx: 19, pyram: 21, "444": 16, "222": 19, skewb: 20, "333": 21, "333oh": 19 };
/**
 * First rounds next to a side room round: its people compete in the groups that do not clash
 * (the 5th and 6th arguments of FirstRoundAssignGroups). Waves: the round's groups per stage.
 */
const NEXT_TO_SIDE = [
  { round: "clock-r1", eventId: "clock", waves: 2, side: "444bf", groups: [1] },
  { round: "777-r1", eventId: "777", waves: 2, side: "444bf", groups: [2] },
  { round: "555-r1", eventId: "555", waves: 2, side: "333mbf", groups: [1] },
  { round: "minx-r1", eventId: "minx", waves: 2, side: "333mbf", groups: [2] },
  { round: "444-r1", eventId: "444", waves: 4, side: "333mbf", groups: [1, 2] },
  { round: "222-r1", eventId: "222", waves: 4, side: "333mbf", groups: [3, 4] },
  { round: "skewb-r1", eventId: "skewb", waves: 3, side: "555bf", groups: [1, 2] },
  { round: "333-r1", eventId: "333", waves: 4, side: "555bf", groups: [4] },
];

const cluster = (value: string) => ({ kind: "property" as const, key: "delegate-cluster", op: "eq" as const, value });
const extraCluster = (value: string) => ({ kind: "property" as const, key: "delegate-cluster-extra", op: "eq" as const, value });
const puzzle = (value: string) => ({ kind: "property" as const, key: "puzzles", op: "contains" as const, value });
/** CompetesOrVolunteersInRound: registered in the side room round, or in the team that works there. */
const sideCluster = (eventId: string, name: string): Segment => ({ id: `sc26-side-${eventId}`, name, match: "any", rules: [{ kind: "registered", eventId }, { kind: "segment", id: "sc26-side-crew" }] });
const NOT_STAFF = (["organizer", "delegate", "trainee-delegate"] as const).map(role => ({ kind: "role" as const, role, negate: true }));
const segments: Segment[] = [
  { id: "sc26-delegates-12", name: "Delegados 1 y 2", match: "any", rules: [cluster("1"), cluster("2")] },
  { id: "sc26-delegates-3", name: "Delegados 3", match: "all", rules: [cluster("3")] },
  { id: "sc26-delegates-4", name: "Delegados 4", match: "all", rules: [cluster("4")] },
  { id: "sc26-delegates-5", name: "Delegados 5 (dos escenarios)", match: "all", rules: [extraCluster("5")] },
  { id: "sc26-delegates-6", name: "Delegados 6 (dos escenarios)", match: "all", rules: [extraCluster("6")] },
  // The side room team and its delegate (cluster 1): they set up the room and scramble the multi.
  { id: "sc26-side-crew", name: "Equipo de sala auxiliar", match: "any", rules: [{ kind: "property", key: "team", op: "eq", value: "Side room" }, cluster("1")] },
  sideCluster("444bf", "Sala auxiliar: 4BLD"),
  sideCluster("555bf", "Sala auxiliar: 5BLD"),
  sideCluster("333mbf", "Sala auxiliar: multi"),
  { id: "sc26-individual", name: "Puzles: individual", match: "all", rules: [puzzle("individual")] },
  { id: "sc26-parejas", name: "Puzles: parejas", match: "all", rules: [puzzle("parejas")] },
  // OrderedFinalists (2025): Spaniards first, then the rest, each by their previous round position.
  { id: "sc26-spaniards", name: "Españoles", match: "all", rules: [{ kind: "country", iso2: "ES" }] },
  { id: "s5", name: "Voluntarios elegibles", match: "all", rules: [...NOT_STAFF, { kind: "newcomer", negate: true }] },
  { id: "s6", name: "Pueden hacer de runner", match: "all", rules: [...NOT_STAFF, { kind: "newcomer", negate: true }, { kind: "age", op: "lt", value: 45 }] },
  {
    id: "s7", name: "Mezcladores por prueba", match: "all", rules: [{
      kind: "roundPb",
      limits: { "222": 600, "333": 1500, "444": 5000, "555": 10000, "666": 18000, "777": 30000, pyram: 600, skewb: 600, clock: 1500, minx: 9000, sq1: 3000 },
      mapping: { "333bf": "333", "333oh": "333", "333ft": "333", "333mbf": "333", "444bf": "444", "555bf": "555" },
    }],
  },
  { id: "s8", name: "Equipo side room", match: "all", rules: [{ kind: "property", key: "team", op: "contains", value: "side" }] },
];

const set = (id: string, name: string, change: Partial<AssignmentSetConfig>): AssignmentSetConfig => ({ id, name, rounds: "first", lanes: [], groups: "any", ...change });
/** DelegateStage: clusters 1 and 2 share a stage; each day the stages rotate. */
const delegates = (day: string, rounds: string[], stages: [string, string, string]) => [
  set(`sc26-delegates-12-${day}`, `Delegados 1 y 2 (${day})`, { segment: "sc26-delegates-12", rounds, lanes: [stages[0]] }),
  set(`sc26-delegates-3-${day}`, `Delegados 3 (${day})`, { segment: "sc26-delegates-3", rounds, lanes: [stages[1]] }),
  set(`sc26-delegates-4-${day}`, `Delegados 4 (${day})`, { segment: "sc26-delegates-4", rounds, lanes: [stages[2]] }),
];

/**
 * TopSideSet (featured and not) and SideSet: the cluster's top on Bizkaia and the rest on the other
 * stages, only in those groups. `top` counts all of the round's positions, as IsInTop does.
 */
const keptToGroups = (id: string, name: string, segment: string, round: string, eventId: string, waves: number, groups: number[]) => [
  set(`${id}-featured`, `${name}: destacados`, { segment, rounds: [round], top: FEATURED * waves, lanes: [BIZKAIA], groups, featured: true }),
  set(`${id}-top`, `${name}: top`, { segment, rounds: [round], top: TOP[eventId] * waves, lanes: [BIZKAIA], groups }),
  set(`${id}-rest`, `${name}: resto`, { segment, rounds: [round], lanes: [ARABA, GIPUZKOA], groups }),
];

export const SPANISH_CHAMPIONSHIP_2026: ProTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  name: "Campeonato de España 2026",
  note: "Según los scripts de 2026: 5 destacados y un top por prueba en Bizkaia, 14 estaciones con 16 jueces, 21 por grupo como máximo en Bizkaia y 28 en Araba y Gipuzkoa. Pyraminx y 3x3 no caben con estos máximos: la revisión lo avisa. Hay que importar de la hoja las propiedades team, delegate-cluster, delegate-cluster-extra y puzzles. Quien hace puzles individual no debe competir en Square-1, 6x6 ni 3BLD: si sigue inscrito, la revisión lo avisa y hay que quitarlo de esas pruebas en la WCA. Finales de reloj, 7x7, Square-1 y 6x6: los 14 primeros (primero los españoles) en Bizkaia, sentados desde el centro, y el resto en Gipuzkoa. Las demás rondas siguientes son provisionales, copiadas de 2025.",
  // CanVolunteer: without a team, only in one's own events and with a WCA ID. The rest is the
  // setup prepared for the championship.
  options: {
    sortingRule: "scrambler-safe", avoidBeforeOwnGroup: true, assignJudges: true, noTasksForNewcomers: true, tasksForOwnEventsOnly: true, tasksOnCompetingDaysOnly: true, balanceMinutes: true,
    separateNames: false, topTogether: false, topTogetherCounts: { "222": 4, "333": 4, skewb: 4, pyram: 4 }, noRunningForForeigners: true, spreadDelegates: true,
    normalTasksForDelegatesAndOrganizers: false, assignDelegateDuties: true, assignDataEntry: true, taskOrder: ["delegate", "scrambler", "dataentry", "runner", "judge"],
  },
  printing: {
    paperSize: "a4", order: "stacked", coverSheets: true, localNamesFirst: false, printOneName: false, scrambleCheckerTopRanked: true, scrambleCheckerFinalRounds: true,
    scrambleCheckerBlank: false, scrambleCheckerBigCubes: false, backgroundUrl: "", language: "es", stageInGroupCell: true, registrantOnBack: true,
  },
  // Multi-blind: JudgeJob(10) and DelegateJob(1) only.
  rounds: {
    "333mbf-r1": { scramblers: 0, runners: 0 },
    // AllStagesAssignStaff: RunnerJob(3), ScramblerJob(4).
    "333bf-r2": { scramblers: 4, runners: 3 },
    // FinalAssignStaff: RunnerJob(3) on both stages, ScramblerJob(3) on Bizkaia and (2) on Gipuzkoa.
    // A round has one number for all its stages, so Gipuzkoa gets one more.
    ...Object.fromEntries(ALL_FINALS.map(id => [id, { scramblers: 3, runners: 3 }])),
  },
  pro: {
    segments,
    jobs: { scrambler: "s7" },
    scoring: {
      enabled: true,
      weights: { load: -10, hoursToday: -4, keepSameJob: 10, longStreak: -20, beforeCompeting: -50, competesInEvent: 20, eliminated: -10, reserveScramblers: -20, staff: 30, wcaJob: 40, trusted: 30, speed: 10, preferences: 10, young: -40 },
    },
    // AllStagesAssignStaff: JudgeJob(16), RunnerJob(3), ScramblerJob(4) on 14 stations. At most 1.5
    // competitors per station on Bizkaia and 2 elsewhere. Side room: AssignStaff with JudgeJob(20),
    // RunnerJob(2), ScramblerJob(2).
    staffing: {
      [ARABA]: { stations: 14, judges: 16, maxPerGroup: 28, scramblers: 4, runners: 3 },
      [BIZKAIA]: { stations: 14, judges: 16, maxPerGroup: 21, scramblers: 4, runners: 3 },
      [GIPUZKOA]: { stations: 14, judges: 16, maxPerGroup: 28, scramblers: 4, runners: 3 },
      [SIDE]: { stations: 20, scramblers: 2, runners: 2 },
    },
    // Side room setup and multi scrambling (5_manual_assignments.cs and _unavailabilities.cs), and
    // the puzzle contests as the WCA schedule has them on 05/11/2026 (the scripts still say 11:30).
    clusterBusy: [
      { segment: "sc26-side-crew", dayIndex: 0, start: "08:30", end: "09:00" },
      { segment: "sc26-side-crew", dayIndex: 0, start: "11:40", end: "12:35" },
      { segment: "sc26-side-crew", dayIndex: 1, start: "08:45", end: "09:50" },
      { segment: "sc26-side-crew", dayIndex: 1, start: "12:15", end: "12:25" },
      { segment: "sc26-individual", dayIndex: 0, start: "11:00", end: "13:30" },
      { segment: "sc26-parejas", dayIndex: 0, start: "16:30", end: "18:30" },
    ],
    sets: [
      // FinalAssignGroups (2026): FinalsSeed <= 14 on Bizkaia, the rest on Gipuzkoa, so 14 and 6
      // of 20 rather than an even split.
      set("sc26-finals26-bizkaia", "Finales 2026: Bizkaia", { rounds: FINALS_2026, top: 14, first: "sc26-spaniards", overfill: true, lanes: [BIZKAIA] }),
      set("sc26-finals26-gipuzkoa", "Finales 2026: Gipuzkoa", { rounds: FINALS_2026, lanes: [GIPUZKOA] }),
      // 0_after_333bf-r1.cs: Seed <= 25 on Bizkaia, the rest on Gipuzkoa. Nobody featured. Bizkaia
      // takes 21 at most, so the top is 21 here; with 50 people, Gipuzkoa has one too many.
      set("sc26-333bf-r2-bizkaia", "3BLD ronda 2: Bizkaia", { rounds: ["333bf-r2"], top: 21, lanes: [BIZKAIA] }),
      set("sc26-333bf-r2-gipuzkoa", "3BLD ronda 2: Gipuzkoa", { rounds: ["333bf-r2"], lanes: [GIPUZKOA] }),
      // Provisional, from 2025. 3x3 final: the top 12 (Spaniards first) head to head, odd on
      // Bizkaia and even on Gipuzkoa, the worst in group 2 up to the best in group 7; the rest in
      // group 1 (2025: foreigners in group 1).
      set("sc26-final333-odd", "Final 3x3: impares", { rounds: ["333-r4"], top: 12, first: "sc26-spaniards", positions: "odd", fill: "ranked", lanes: [BIZKAIA], groups: FINAL_333_PAIRS }),
      set("sc26-final333-even", "Final 3x3: pares", { rounds: ["333-r4"], top: 12, first: "sc26-spaniards", positions: "even", fill: "ranked", lanes: [GIPUZKOA], groups: FINAL_333_PAIRS }),
      set("sc26-final333-rest", "Final 3x3: grupo 1", { rounds: ["333-r4"], groups: [1] }),
      // 3x3 semifinal by position in round 2. One group per stage, so each set stops at the even
      // size: with 42 people, up to the 14th on Bizkaia, to the 28th on Gipuzkoa, the rest on Araba.
      set("sc26-semi333-bizkaia", "Semifinal 3x3: Bizkaia", { rounds: ["333-r3"], top: 22, lanes: [BIZKAIA] }),
      set("sc26-semi333-gipuzkoa", "Semifinal 3x3: Gipuzkoa", { rounds: ["333-r3"], top: 28, lanes: [GIPUZKOA] }),
      set("sc26-semi333-araba", "Semifinal 3x3: Araba", { rounds: ["333-r3"], lanes: [ARABA] }),
      // Finals (FinalsAssignmentSets): odd positions on Bizkaia, even on Gipuzkoa, Spaniards first.
      set("sc26-finals-odd", "Finales: impares", { rounds: "final", first: "sc26-spaniards", positions: "odd", lanes: [BIZKAIA] }),
      set("sc26-finals-even", "Finales: pares", { rounds: "final", first: "sc26-spaniards", positions: "even", lanes: [GIPUZKOA] }),
      // The extra sets of 6_assign_main.cs. Parejas: only group 1 of Megaminx is free. The side room
      // team and its delegate scramble the multi during the first groups of Pyraminx.
      ...keptToGroups("sc26-parejas-minx", "Puzles parejas", "sc26-parejas", "minx-r1", "minx", 2, [1]),
      set("sc26-side-crew-pyram", "Equipo de sala auxiliar: Pyraminx", { segment: "sc26-side-crew", rounds: ["pyram-r1"], lanes: [ARABA], groups: [3] }),
      ...NEXT_TO_SIDE.flatMap(({ round, eventId, waves, side, groups }) => keptToGroups(`sc26-side-${round}`, `Sala auxiliar (${round})`, `sc26-side-${side}`, round, eventId, waves, groups)),
      // TopSet, featured and not.
      set("sc26-featured", "Destacados", { top: FEATURED, perGroup: true, overfill: true, lanes: [BIZKAIA], featured: true }),
      set("sc26-top", "Top", { top: 21, topByEvent: TOP, perGroup: true, overfill: true, lanes: [BIZKAIA] }),
      // Other later rounds (2025's TopCompetitorsSet): 4 per group of the main stage, featured.
      set("sc26-later-featured", "Destacados (rondas siguientes)", { rounds: "middle", top: 4, perGroup: true, lanes: [BIZKAIA], featured: true }),
      // Teams keep their stage in first rounds only, as FirstRoundAssignGroups does.
      set("sc26-core", "Organización", { segment: teamClusterId("Organizador"), lanes: [GIPUZKOA] }),
      ...delegates("sábado", SATURDAY, [BIZKAIA, GIPUZKOA, ARABA]),
      ...delegates("domingo", [...SUNDAY, ...SUNDAY_LATER], [GIPUZKOA, ARABA, BIZKAIA]),
      ...delegates("lunes", MONDAY_LATER, [ARABA, BIZKAIA, GIPUZKOA]),
      // On two stages, the same day: 5 on Bizkaia and 6 on Gipuzkoa.
      set("sc26-delegates-5", "Delegados 5 (dos escenarios)", { segment: "sc26-delegates-5", rounds: TWO_STAGES, lanes: [BIZKAIA] }),
      set("sc26-delegates-6", "Delegados 6 (dos escenarios)", { segment: "sc26-delegates-6", rounds: TWO_STAGES, lanes: [GIPUZKOA] }),
      set("sc26-aes", "Registro / Stand AES", { segment: teamClusterId("Registro / Stand AES"), lanes: [GIPUZKOA] }),
      set("sc26-data", "Data entry", { segment: teamClusterId("Data entry"), lanes: [GIPUZKOA] }),
      // StreamingSet: Araba, and Gipuzkoa in the rounds without Araba.
      set("sc26-streaming", "Streaming", { segment: teamClusterId("Streaming"), lanes: [ARABA] }),
      set("sc26-streaming-gipuzkoa", "Streaming (sin Araba)", { segment: teamClusterId("Streaming"), lanes: [GIPUZKOA] }),
      // EveryoneSet: Stage() != Bizkaia, however many that leaves on the other stages (up to their
      // maximum), so the free seats of Bizkaia do not go to the last of the round.
      set("sc26-everyone", "Resto", { overfill: true, lanes: [ARABA, GIPUZKOA] }),
      // 2025's EveryoneSet in later rounds: anywhere.
      set("sc26-later-everyone", "Resto (rondas siguientes)", { rounds: "middle" }),
    ],
    // SideStations: ascending psych sheet in the side room.
    stationRules: [
      { id: "sc26-side", rounds: ["444bf-r1", "555bf-r1", "333mbf-r1"], lanes: [SIDE], groups: "any", mode: "ascending", sortBy: "seed", exclusions: [] },
      // FinalAssignGroups (2026), SeedToStation on Bizkaia: from the centre of rows of 8 and 6, which
      // is what 2 rows of 4 tables of 2 give with 14 stations. Gipuzkoa takes the rule below.
      { id: "sc26-finals26-bizkaia", rounds: FINALS_2026, lanes: [BIZKAIA], groups: "any", mode: "ascending", sortBy: "seed", first: "sc26-spaniards", seating: "center", exclusions: [] },
      // FinalsStations (2025): by position, Spaniards first. Side room finals keep the rule above.
      { id: "sc26-finals", rounds: "final", lanes: [], groups: "any", mode: "ascending", sortBy: "seed", first: "sc26-spaniards", exclusions: [] },
    ],
    teams: {
      property: "team",
      setup: {
        "Voluntario normal": { kind: "volunteer" },
        // Setup and multi scrambling: clusterBusy above, together with their delegate.
        "Side room": { kind: "volunteer", lane: SIDE },
        "Data entry": { kind: "dataentry" },
        Organizador: { kind: "inherit" },
        Delegado: { kind: "inherit" },
        Streaming: { kind: "notasks" },
        "Registro / Stand AES": { kind: "notasks" },
        "Control de Accesos": { kind: "notasks" },
        "Médico": { kind: "notasks" },
        // Not in AllTeams: works like anyone without a team.
        "Aceptado SIN categorizar": { kind: "inherit" },
        Otro: { kind: "notasks" },
      },
    },
  },
};

/** Templates offered with one click. */
export const BUILT_IN_TEMPLATES = [SPANISH_CHAMPIONSHIP_2026];
