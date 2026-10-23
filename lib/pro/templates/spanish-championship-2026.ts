/*
 * The Spanish Championship 2026 setup, from the CompScript scripts by aasalobrena
 * (github.com/aasalobrena/Scripts-Compscript, SpanishChampionship2026): teams (CanVolunteer),
 * first-round assignment sets (FirstRoundAssignmentSets), delegates by cluster and day
 * (DelegateStage), side room staff (4_assign_side.cs) and Groupifier print options
 * (0_groupifier_config.cs). See docs/NACIONAL_2026_EN_LA_WEB.md.
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

const cluster = (value: string) => ({ kind: "property" as const, key: "delegate-cluster", op: "eq" as const, value });
const segments: Segment[] = [
  { id: "sc26-delegates-12", name: "Delegados 1 y 2", match: "any", rules: [cluster("1"), cluster("2")] },
  { id: "sc26-delegates-3", name: "Delegados 3", match: "all", rules: [cluster("3")] },
  { id: "sc26-delegates-4", name: "Delegados 4", match: "all", rules: [cluster("4")] },
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
  note: "Destacados 4 y top 18 por grupo de Bizkaia (22 por grupo) son valores de partida: los scripts de primeras rondas aún no están en el repo. Ajústalos en Reglas, también por prueba; la vista previa avisa si no caben. Los conjuntos de delegados usan la propiedad delegate-cluster.",
  // CanVolunteer: without a team, only in one's own events and with a WCA ID.
  options: { tasksForOwnEventsOnly: true, noTasksForNewcomers: true },
  printing: { paperSize: "a4", order: "stacked", coverSheets: true, scrambleCheckerTopRanked: true, scrambleCheckerFinalRounds: true },
  // Multi-blind: JudgeJob(10) and DelegateJob(1) only.
  rounds: { "333mbf-r1": { scramblers: 0, runners: 0 } },
  pro: {
    segments,
    jobs: {},
    // AssignStaff in the side room: JudgeJob(20), RunnerJob(2), ScramblerJob(2).
    staffing: { [SIDE]: { stations: 20, scramblers: 2, runners: 2 } },
    sets: [
      // FeaturedSet and TopSet. The scripts count per group of the whole round
      // (NumberPerGroupToPerRound); here it is per group of Bizkaia, which is how the numbers read.
      set("sc26-featured", "Destacados", { top: 4, perGroup: true, lanes: [BIZKAIA], featured: true }),
      set("sc26-top", "Top", { top: 18, perGroup: true, lanes: [BIZKAIA] }),
      set("sc26-core", "Organización", { segment: teamClusterId("Organizador"), lanes: [GIPUZKOA] }),
      ...delegates("sábado", SATURDAY, [BIZKAIA, GIPUZKOA, ARABA]),
      ...delegates("domingo", SUNDAY, [GIPUZKOA, ARABA, BIZKAIA]),
      set("sc26-aes", "Registro / Stand AES", { segment: teamClusterId("Registro / Stand AES"), lanes: [GIPUZKOA] }),
      set("sc26-data", "Data entry", { segment: teamClusterId("Data entry"), lanes: [GIPUZKOA] }),
      set("sc26-streaming", "Streaming", { segment: teamClusterId("Streaming"), lanes: [ARABA] }),
      // EveryoneSet: Stage() != Bizkaia.
      set("sc26-everyone", "Resto", { lanes: [ARABA, GIPUZKOA] }),
    ],
    // SideStations: ascending psych sheet in the side room.
    stationRules: [{ id: "sc26-side", rounds: ["444bf-r1", "555bf-r1", "333mbf-r1"], lanes: [SIDE], groups: "any", mode: "ascending", sortBy: "seed", exclusions: [] }],
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
