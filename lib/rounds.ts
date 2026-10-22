import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";

export const EVENT_NAMES: Record<string, string> = {
  "222": "2×2×2", "333": "3×3×3", "444": "4×4×4", "555": "5×5×5", "666": "6×6×6", "777": "7×7×7",
  "333bf": "3×3 a ciegas", "333fm": "3×3 FMC", "333oh": "3×3 una mano", clock: "Clock", minx: "Megaminx",
  pyram: "Pyraminx", skewb: "Skewb", sq1: "Square-1", "444bf": "4×4 a ciegas", "555bf": "5×5 a ciegas", "333mbf": "3×3 multi-ciegas"
};

export type FlowMode = "fixed" | "waiting";
export type Preset = "simple" | "scrambler-safe" | "custom";

export type GenerationRound = {
  id: string;
  eventId: string;
  groups: number;
  scramblers: number;
  runners: number;
  enabled: boolean;
};

export type RoundConfig = GenerationRound & {
  label: string;
  roundNumber: number;
  /** Known only for first rounds; later rounds depend on results. */
  competitors: number;
};

/** How many people fit in one group relative to the stations, in waiting-room mode. */
const WAITING_GROUP_FACTOR: Record<Preset, number> = { simple: 2.4, "scrambler-safe": 1.7, custom: 2 };

export function personKey(person: WcifPerson) {
  return String(person.registrantId ?? person.wcaId ?? person.name);
}

export function acceptedPeople(competition: StoredCompetition) {
  return (competition.persons ?? []).filter(person => person.registration?.status === "accepted" && person.registration.isCompeting !== false);
}

export function suggestGroups(competitors: number, stations: number, flowMode: FlowMode, preset: Preset) {
  const perGroup = flowMode === "fixed" ? stations : Math.floor(stations * WAITING_GROUP_FACTOR[preset]);
  return Math.max(1, Math.ceil(Math.max(competitors, 1) / Math.max(perGroup, 1)));
}

/** Roughly one scrambler per five occupied stations. */
export function suggestScramblers(competitors: number, groups: number, stations: number) {
  const groupSize = Math.ceil(competitors / Math.max(groups, 1));
  return Math.max(1, Math.floor(1 + (Math.min(groupSize, stations) - 1) / 5));
}

export function suggestRunners(stations: number) {
  return Math.max(1, Math.round(stations / 8));
}

/** One judge per occupied station. */
export function judgesNeeded(groupSize: number, stations: number) {
  return Math.min(groupSize, stations);
}

export function initialRounds(competition: StoredCompetition, stations: number, flowMode: FlowMode, preset: Preset): RoundConfig[] {
  const people = acceptedPeople(competition);
  return (competition.events ?? []).flatMap(event => (event.rounds ?? []).map((round, index) => {
    const competitors = index === 0 ? people.filter(person => person.registration?.eventIds?.includes(event.id)).length : 0;
    const groups = suggestGroups(competitors, stations, flowMode, preset);
    return {
      id: round.id,
      eventId: event.id,
      label: `${EVENT_NAMES[event.id] ?? event.id} · Ronda ${index + 1}`,
      roundNumber: index + 1,
      competitors,
      groups,
      scramblers: suggestScramblers(competitors, groups, stations),
      runners: suggestRunners(stations),
      enabled: index === 0,
    };
  }));
}

/** Recomputes the suggested shape of every round, keeping which rounds are enabled. */
export function resuggestRounds(rounds: RoundConfig[], stations: number, flowMode: FlowMode, preset: Preset): RoundConfig[] {
  return rounds.map(round => {
    const groups = suggestGroups(round.competitors, stations, flowMode, preset);
    return { ...round, groups, scramblers: suggestScramblers(round.competitors, groups, stations), runners: suggestRunners(stations) };
  });
}
