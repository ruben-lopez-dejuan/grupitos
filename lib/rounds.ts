import type { StoredCompetition, WcifPerson, WcifRound } from "@/lib/competition-store";

export const EVENT_NAMES: Record<string, string> = {
  "222": "2×2×2", "333": "3×3×3", "444": "4×4×4", "555": "5×5×5", "666": "6×6×6", "777": "7×7×7",
  "333bf": "3×3 a ciegas", "333fm": "3×3 FMC", "333oh": "3×3 una mano", "333ft": "3×3 con los pies", clock: "Clock", minx: "Megaminx",
  pyram: "Pyraminx", skewb: "Skewb", sq1: "Square-1", "444bf": "4×4 a ciegas", "555bf": "5×5 a ciegas", "333mbf": "3×3 multi-ciegas"
};

/** fixed: numbered stations · waiting: waiting room · mixed: waiting room in first rounds, stations afterwards. */
export type ZoneMode = "fixed" | "waiting" | "mixed";

/**
 * How competitors are split into groups in first rounds (later rounds always follow the previous ranking).
 * The first four mirror Groupifier; scrambler-safe is symmetric plus strict scrambler selection.
 */
export type SortingRule = "ranks" | "balanced" | "symmetric" | "scrambler-safe" | "name-optimised";

export type GenerationRound = {
  id: string;
  eventId: string;
  roundNumber: number;
  groups: number;
  scramblers: number;
  runners: number;
  enabled: boolean;
};

export type RoundConfig = GenerationRound & {
  label: string;
  /** Registered people for first rounds, results for later ones, otherwise an estimate from the advancement condition. */
  competitors: number;
  competitorsKnown: boolean;
};

export function personKey(person: WcifPerson) {
  return String(person.registrantId ?? person.wcaId ?? person.name);
}

export function acceptedPeople(competition: StoredCompetition) {
  return (competition.persons ?? []).filter(person => person.registration?.status === "accepted" && person.registration.isCompeting !== false);
}

export function parseRoundNumber(roundId: string) {
  return Number(roundId.match(/-r(\d+)/)?.[1] ?? 1);
}

export function usesFixedStations(roundNumber: number, competitors: number, stations: number, mode: ZoneMode) {
  if (competitors > 0 && competitors <= stations) return true;
  return mode === "fixed" || (mode === "mixed" && roundNumber > 1);
}

/** Groupifier's suggestion for waiting rooms (≈1.7 people per station), and a full station set per group otherwise. */
export function suggestGroups(competitors: number, stations: number, fixedStations: boolean, roundNumber: number) {
  if (stations <= 0 || competitors <= 0) return 1;
  const groups = fixedStations ? Math.ceil(competitors / stations) : Math.round(competitors / (stations * 1.7) + 0.4);
  // At least two groups in first rounds, so there are people to scramble.
  return Math.max(groups, roundNumber === 1 && competitors > 1 ? 2 : 1);
}

/** One scrambler per five stations in use (Groupifier). */
export function suggestScramblers(competitors: number, groups: number, stations: number) {
  const inUse = Math.min(Math.ceil(competitors / Math.max(groups, 1)), stations);
  return Math.max(1, Math.floor(1 + (inUse - 1) / 5));
}

/** One runner per eight stations in use (Groupifier). */
export function suggestRunners(competitors: number, groups: number, stations: number) {
  const inUse = Math.min(Math.ceil(competitors / Math.max(groups, 1)), stations);
  return Math.max(1, Math.floor(1 + (inUse - 1) / 8));
}

/** One judge per occupied station. */
export function judgesNeeded(groupSize: number, stations: number) {
  return Math.min(groupSize, stations);
}

const BLIND_EVENTS = ["333bf", "444bf", "555bf", "333mbf"];

function personalBest(person: WcifPerson, eventId: string, type: "single" | "average") {
  return person.personalBests?.find(best => best.eventId === eventId && best.type === type)?.best ?? Number.POSITIVE_INFINITY;
}

/** Average then single, except blind events, where single comes first (Groupifier). */
export function bestAverageAndSingle(person: WcifPerson, eventId: string) {
  const average = personalBest(person, eventId, "average");
  const single = personalBest(person, eventId, "single");
  return BLIND_EVENTS.includes(eventId) ? [single, average] : [average, single];
}

export function seedResult(person: WcifPerson, eventId: string) {
  const [first, second] = bestAverageAndSingle(person, eventId);
  const value = Number.isFinite(first) ? first : second;
  return Number.isFinite(value) ? value : undefined;
}

export function compareBySeed(eventId: string) {
  return (a: WcifPerson, b: WcifPerson) => {
    const [a1, a2] = bestAverageAndSingle(a, eventId);
    const [b1, b2] = bestAverageAndSingle(b, eventId);
    return (a1 - b1) || (a2 - b2) || a.name.localeCompare(b.name);
  };
}

function findRound(competition: StoredCompetition, roundId: string) {
  for (const event of competition.events ?? []) for (const round of event.rounds ?? []) if (round.id === roundId) return round;
  return undefined;
}

function sourceOf(round: WcifRound, previousRoundId: string | undefined) {
  if (round.participationRuleset?.participationSource) return round.participationRuleset.participationSource;
  return previousRoundId ? { type: "round" as const, roundId: previousRoundId, resultCondition: undefined } : { type: "registrations" as const };
}

/**
 * People in a round, best first. First rounds use registrations; later rounds use the
 * results already present in the WCIF (people who advanced), or nothing when unknown.
 */
export function roundCompetitors(competition: StoredCompetition, roundId: string): { people: WcifPerson[]; known: boolean } {
  const eventId = roundId.split("-")[0];
  const round = findRound(competition, roundId);
  const accepted = acceptedPeople(competition);
  if (parseRoundNumber(roundId) === 1) {
    return { people: accepted.filter(person => person.registration?.eventIds?.includes(eventId)).sort(compareBySeed(eventId)), known: true };
  }
  const results = round?.results ?? [];
  if (!results.length) return { people: [], known: false };
  const byRegistrant = new Map(accepted.map(person => [person.registrantId, person]));
  const previous = findRound(competition, `${eventId}-r${parseRoundNumber(roundId) - 1}`);
  const previousRanking = new Map((previous?.results ?? []).map(result => [result.personId, result.ranking ?? Number.MAX_SAFE_INTEGER]));
  const people = results.map(result => byRegistrant.get(result.personId)).filter((person): person is WcifPerson => !!person);
  return {
    people: people.sort((a, b) => (previousRanking.get(a.registrantId ?? -1) ?? Number.MAX_SAFE_INTEGER) - (previousRanking.get(b.registrantId ?? -1) ?? Number.MAX_SAFE_INTEGER) || compareBySeed(eventId)(a, b)),
    known: true,
  };
}

/** Expected people per round, following Groupifier: advancement conditions applied to the seed order. */
export function expectedCompetitorsByRound(competition: StoredCompetition) {
  const expected = new Map<string, WcifPerson[]>();
  const accepted = acceptedPeople(competition);
  for (const event of competition.events ?? []) {
    (event.rounds ?? []).forEach((round, index) => {
      const known = roundCompetitors(competition, round.id);
      if (index === 0 || known.people.length) {
        expected.set(round.id, known.people);
        return;
      }
      const previous = event.rounds![index - 1];
      const source = sourceOf(round, previous.id);
      const pool = source.type === "linkedRounds"
        ? [...new Set(source.roundIds.flatMap(id => expected.get(id) ?? []))].sort(compareBySeed(event.id))
        : expected.get(source.type === "round" ? source.roundId : previous.id) ?? accepted.filter(person => person.registration?.eventIds?.includes(event.id));
      const condition = source.type !== "registrations" && source.resultCondition
        ? source.resultCondition
        : previous.advancementCondition
          ? { type: previous.advancementCondition.type === "attemptResult" ? "resultAchieved" as const : previous.advancementCondition.type, value: previous.advancementCondition.level, scope: "average" as const }
          : undefined;
      if (!condition) { expected.set(round.id, pool); return; }
      if (condition.type === "ranking") expected.set(round.id, pool.slice(0, condition.value ?? pool.length));
      else if (condition.type === "percent") expected.set(round.id, pool.slice(0, Math.floor(pool.length * (condition.value ?? 100) * 0.01)));
      else expected.set(round.id, pool.filter(person => {
        const best = personalBest(person, event.id, condition.scope ?? "average");
        return condition.value === null ? Number.isFinite(best) : best < (condition.value ?? 0);
      }));
    });
  }
  return expected;
}

export function initialRounds(competition: StoredCompetition, stations: number, mode: ZoneMode): RoundConfig[] {
  const expected = expectedCompetitorsByRound(competition);
  return (competition.events ?? []).flatMap(event => (event.rounds ?? []).map((round, index) => {
    const roundNumber = index + 1;
    const competitors = expected.get(round.id)?.length ?? 0;
    const competitorsKnown = roundCompetitors(competition, round.id).known;
    return shapeRound({
      id: round.id,
      eventId: event.id,
      label: `${EVENT_NAMES[event.id] ?? event.id} · Ronda ${roundNumber}`,
      roundNumber,
      competitors,
      competitorsKnown,
      groups: 1,
      scramblers: 1,
      runners: 1,
      enabled: roundNumber === 1 || competitorsKnown,
    }, stations, mode);
  }));
}

export function shapeRound(round: RoundConfig, stations: number, mode: ZoneMode): RoundConfig {
  const fixed = usesFixedStations(round.roundNumber, round.competitors, stations, mode);
  const groups = suggestGroups(round.competitors, stations, fixed, round.roundNumber);
  return { ...round, groups, scramblers: suggestScramblers(round.competitors, groups, stations), runners: suggestRunners(round.competitors, groups, stations) };
}

/** Recomputes the suggested shape of every round, keeping which rounds are enabled. */
export function resuggestRounds(rounds: RoundConfig[], stations: number, mode: ZoneMode): RoundConfig[] {
  return rounds.map(round => shapeRound(round, stations, mode));
}
