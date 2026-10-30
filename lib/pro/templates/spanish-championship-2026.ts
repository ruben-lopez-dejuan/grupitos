/*
 * The Spanish Championship 2026 setup, from the CompScript scripts by aasalobrena
 * (github.com/aasalobrena/Scripts-Compscript, SpanishChampionship2026): teams (CanVolunteer),
 * first-round assignment sets (FirstRoundAssignmentSets), delegates by cluster and day
 * (DelegateStage), side room staff (4_assign_side.cs) and Groupifier print options
 * (0_groupifier_config.cs). See docs/NACIONAL_2026_EN_LA_WEB.md.
 * Later rounds are provisional, from the Spanish Championship 2025 scripts (the 2026 ones are not
 * written yet): finals split odd and even with Spaniards first (lib/_finals.cs), the 3x3 final
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

/** First rounds of each day with assignment sets (the side room rounds have their own). */
const SATURDAY = ["clock-r1", "777-r1", "sq1-r1", "666-r1", "333bf-r1", "555-r1", "minx-r1"];
const SUNDAY = ["pyram-r1", "444-r1", "222-r1", "skewb-r1", "333-r1", "333oh-r1"];
/** Later rounds that are not finals, by day (3x3 round 3 has its own sets). */
const SATURDAY_LATER = ["333bf-r2"];
const SUNDAY_LATER = ["pyram-r2"];
const MONDAY_LATER = ["333-r2", "444-r2", "222-r2", "333oh-r2", "skewb-r2"];
/** 3x3 final: 1 group on Gipuzkoa, then 7 on Bizkaia and Gipuzkoa at once (3_build_schedule.cs). */
const FINAL_333_PAIRS = [2, 3, 4, 5, 6, 7, 8];

const cluster = (value: string) => ({ kind: "property" as const, key: "delegate-cluster", op: "eq" as const, value });
const segments: Segment[] = [
  { id: "sc26-delegates-12", name: "Delegados 1 y 2", match: "any", rules: [cluster("1"), cluster("2")] },
  { id: "sc26-delegates-3", name: "Delegados 3", match: "all", rules: [cluster("3")] },
  { id: "sc26-delegates-4", name: "Delegados 4", match: "all", rules: [cluster("4")] },
  // OrderedFinalists (2025): Spaniards first, then the rest, each by their previous round position.
  { id: "sc26-spaniards", name: "Españoles", match: "all", rules: [{ kind: "country", iso2: "ES" }] },
];

const set = (id: string, name: string, change: Partial<AssignmentSetConfig>): AssignmentSetConfig => ({ id, name, rounds: "first", lanes: [], groups: "any", ...change });
/** DelegateStage: clusters 1 and 2 share a stage; each day the stages rotate. */
const delegates = (day: string, rounds: string[], stages: [string, string, string]) => [
  set(`sc26-delegates-12-${day}`, `Delegados 1 y 2 (${day})`, { segment: "sc26-delegates-12", rounds, lanes: [stages[0]] }),
  set(`sc26-delegates-3-${day}`, `Delegados 3 (${day})`, { segment: "sc26-delegates-3", rounds, lanes: [stages[1]] }),
  set(`sc26-delegates-4-${day}`, `Delegados 4 (${day})`, { segment: "sc26-delegates-4", rounds, lanes: [stages[2]] }),
];

export const SPANISH_CHAMPIONSHIP_2026: ProTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  name: "Campeonato de España 2026",
  note: "Destacados 4 y top 18 por grupo de Bizkaia (22 por grupo) son valores de partida; ajústalos en Reglas, también por prueba, y la vista previa avisa si no caben. Las rondas siguientes son provisionales, copiadas de 2025: finales impares a Bizkaia y pares a Gipuzkoa contando primero a los españoles; final de 3x3 cara a cara (top 14, grupos 2-8) y el resto al grupo 1; semifinal de 3x3 por posición (top 14 Bizkaia, hasta el 29 Gipuzkoa, el resto Araba); en las demás, 4 destacados por grupo de Bizkaia. Los conjuntos de delegados usan la propiedad delegate-cluster.",
  // CanVolunteer: without a team, only in one's own events and with a WCA ID.
  options: { tasksForOwnEventsOnly: true, noTasksForNewcomers: true },
  printing: { paperSize: "a4", order: "stacked", coverSheets: true, scrambleCheckerTopRanked: true, scrambleCheckerFinalRounds: true },
  // Multi-blind: JudgeJob(10) and DelegateJob(1) only.
  rounds: { "333mbf-r1": { scramblers: 0, runners: 0 } },
  pro: {
    segments,
    jobs: {},
    // Stations and most competitors per group of each stage. Side room: AssignStaff with
    // JudgeJob(20), RunnerJob(2), ScramblerJob(2).
    staffing: {
      [ARABA]: { stations: 14, maxPerGroup: 28 },
      [BIZKAIA]: { stations: 14, maxPerGroup: 22 },
      [GIPUZKOA]: { stations: 14, maxPerGroup: 28 },
      [SIDE]: { stations: 20, scramblers: 2, runners: 2 },
    },
    sets: [
      // Provisional, from 2025. 3x3 final: the top 14 (Spaniards first) head to head, odd on
      // Bizkaia and even on Gipuzkoa, the worst in group 2 up to the best in group 8; the rest in
      // group 1 (2025: foreigners in group 1).
      set("sc26-final333-odd", "Final 3x3: impares", { rounds: ["333-r4"], top: 14, first: "sc26-spaniards", positions: "odd", fill: "ranked", lanes: [BIZKAIA], groups: FINAL_333_PAIRS }),
      set("sc26-final333-even", "Final 3x3: pares", { rounds: ["333-r4"], top: 14, first: "sc26-spaniards", positions: "even", fill: "ranked", lanes: [GIPUZKOA], groups: FINAL_333_PAIRS }),
      set("sc26-final333-rest", "Final 3x3: grupo 1", { rounds: ["333-r4"], groups: [1] }),
      // 3x3 semifinal by position in round 2: up to the 14th on Bizkaia, to the 29th on Gipuzkoa.
      set("sc26-semi333-bizkaia", "Semifinal 3x3: Bizkaia", { rounds: ["333-r3"], top: 14, lanes: [BIZKAIA] }),
      set("sc26-semi333-gipuzkoa", "Semifinal 3x3: Gipuzkoa", { rounds: ["333-r3"], top: 29, lanes: [GIPUZKOA] }),
      set("sc26-semi333-araba", "Semifinal 3x3: Araba", { rounds: ["333-r3"], lanes: [ARABA] }),
      // Finals (FinalsAssignmentSets): odd positions on Bizkaia, even on Gipuzkoa, Spaniards first.
      set("sc26-finals-odd", "Finales: impares", { rounds: "final", first: "sc26-spaniards", positions: "odd", lanes: [BIZKAIA] }),
      set("sc26-finals-even", "Finales: pares", { rounds: "final", first: "sc26-spaniards", positions: "even", lanes: [GIPUZKOA] }),
      // FeaturedSet and TopSet. The scripts count per group of the whole round
      // (NumberPerGroupToPerRound); here it is per group of Bizkaia, which is how the numbers read.
      set("sc26-featured", "Destacados", { top: 4, perGroup: true, lanes: [BIZKAIA], featured: true }),
      set("sc26-top", "Top", { top: 18, perGroup: true, lanes: [BIZKAIA] }),
      // Other later rounds (2025's TopCompetitorsSet): 4 per group of the main stage, featured.
      set("sc26-later-featured", "Destacados (rondas siguientes)", { rounds: "middle", top: 4, perGroup: true, lanes: [BIZKAIA], featured: true }),
      // Teams and delegates keep their stage in every round (in finals nobody is left by now).
      set("sc26-core", "Organización", { rounds: "all", segment: teamClusterId("Organizador"), lanes: [GIPUZKOA] }),
      ...delegates("sábado", [...SATURDAY, ...SATURDAY_LATER], [BIZKAIA, GIPUZKOA, ARABA]),
      ...delegates("domingo", [...SUNDAY, ...SUNDAY_LATER], [GIPUZKOA, ARABA, BIZKAIA]),
      ...delegates("lunes", MONDAY_LATER, [ARABA, BIZKAIA, GIPUZKOA]),
      set("sc26-aes", "Registro / Stand AES", { rounds: "all", segment: teamClusterId("Registro / Stand AES"), lanes: [GIPUZKOA] }),
      set("sc26-data", "Data entry", { rounds: "all", segment: teamClusterId("Data entry"), lanes: [GIPUZKOA] }),
      set("sc26-streaming", "Streaming", { rounds: "all", segment: teamClusterId("Streaming"), lanes: [ARABA] }),
      // EveryoneSet: Stage() != Bizkaia.
      set("sc26-everyone", "Resto", { lanes: [ARABA, GIPUZKOA] }),
      // 2025's EveryoneSet in later rounds: anywhere.
      set("sc26-later-everyone", "Resto (rondas siguientes)", { rounds: "middle" }),
    ],
    // SideStations: ascending psych sheet in the side room.
    stationRules: [
      { id: "sc26-side", rounds: ["444bf-r1", "555bf-r1", "333mbf-r1"], lanes: [SIDE], groups: "any", mode: "ascending", sortBy: "seed", exclusions: [] },
      // FinalsStations (2025): by position, Spaniards first. Side room finals keep the rule above.
      { id: "sc26-finals", rounds: "final", lanes: [], groups: "any", mode: "ascending", sortBy: "seed", first: "sc26-spaniards", exclusions: [] },
    ],
    teams: {
      property: "team",
      setup: {
        "Voluntario normal": { kind: "volunteer" },
        // 9_competitiongroups.cs: side room setup on Sunday. The multi scrambling (09:15–09:50) is a
        // "Multi-blind scrambling" activity in the schedule, where the side room team scrambles first.
        "Side room": { kind: "volunteer", lane: SIDE, busy: [{ dayIndex: 1, start: "08:45", end: "09:15" }, { dayIndex: 1, start: "12:15", end: "12:25" }] },
        "Data entry": { kind: "dataentry" },
        Organizador: { kind: "inherit" },
        Delegado: { kind: "inherit" },
        Streaming: { kind: "notasks" },
        "Registro / Stand AES": { kind: "notasks" },
        "Control de Accesos": { kind: "notasks" },
        "Médico": { kind: "notasks" },
        "Aceptado SIN categorizar": { kind: "notasks" },
        Otro: { kind: "notasks" },
      },
    },
  },
};

/** Templates offered with one click. */
export const BUILT_IN_TEMPLATES = [SPANISH_CHAMPIONSHIP_2026];
