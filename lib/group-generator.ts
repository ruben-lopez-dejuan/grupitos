import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import type { DutyRole, GeneratedAssignment } from "@/lib/assignments";
import { acceptedPeople, judgesNeeded, personKey, type GenerationRound } from "@/lib/rounds";

type WorkingAssignment = GeneratedAssignment & { trusted: boolean; seedRank: number };

function eventBest(person: WcifPerson, eventId: string) {
  const results = person.personalBests?.filter(best => best.eventId === eventId) ?? [];
  return results.find(best => best.type === "average")?.best ?? results.find(best => best.type === "single")?.best;
}

function symmetricGroup(index: number, groupCount: number) {
  const cycle = Math.floor(index / groupCount);
  const offset = index % groupCount;
  return cycle % 2 === 0 ? offset + 1 : groupCount - offset;
}

/**
 * Greedy first proposal. Competitors are spread symmetrically by seed; then every
 * group is staffed slot by slot (scramblers first, as they are the scarcest), always
 * picking the candidate with the lowest cost. Preferences only break ties between
 * candidates who are equally loaded, so a group is never left short to honour one.
 */
export function generateAssignments({ competition, rounds, stations, fixedStations, trustedIds, avoidBeforeOwnGroup = true, assignJudges = true }: {
  competition: StoredCompetition;
  rounds: GenerationRound[];
  stations: number;
  fixedStations: boolean;
  trustedIds: string[];
  avoidBeforeOwnGroup?: boolean;
  assignJudges?: boolean;
}) {
  const accepted = acceptedPeople(competition);
  const trusted = new Set(trustedIds);
  const globalLoad = new Map<string, number>();
  const output: GeneratedAssignment[] = [];

  for (const round of rounds.filter(item => item.enabled && item.groups > 0)) {
    const competitors = accepted
      .filter(person => person.registration?.eventIds?.includes(round.eventId))
      .map(person => ({ person, best: eventBest(person, round.eventId) }))
      .sort((a, b) => (a.best ?? Number.MAX_SAFE_INTEGER) - (b.best ?? Number.MAX_SAFE_INTEGER) || a.person.name.localeCompare(b.person.name));

    const roundAssignments: WorkingAssignment[] = competitors.map(({ person, best }, index) => ({
      id: `${round.id}:${personKey(person)}`,
      roundId: round.id,
      eventId: round.eventId,
      personId: personKey(person),
      name: person.name,
      wcaId: person.wcaId,
      birthdate: person.birthdate,
      seedResult: best,
      group: symmetricGroup(index, round.groups),
      duties: [],
      trusted: trusted.has(personKey(person)),
      seedRank: index,
    }));

    const groupSizes = Array.from({ length: round.groups }, (_, index) => roundAssignments.filter(item => item.group === index + 1).length);

    if (fixedStations) {
      for (let group = 1; group <= round.groups; group += 1) {
        roundAssignments.filter(item => item.group === group).forEach((item, index) => {
          item.station = index < stations ? index + 1 : undefined;
        });
      }
    }

    const roles: DutyRole[] = assignJudges ? ["scrambler", "judge", "runner"] : ["scrambler"];
    for (const role of roles) {
      const needs = groupSizes.map(size => size === 0 ? 0 : role === "scrambler" ? round.scramblers : role === "judge" ? judgesNeeded(size, stations) : round.runners);
      // Round-robin across groups so the best candidates are not all used by G1.
      for (let slot = 0; slot < Math.max(0, ...needs); slot += 1) {
        for (let group = 1; group <= round.groups; group += 1) {
          if (slot >= needs[group - 1]) continue;
          const best = pickCandidate(roundAssignments, group, role, avoidBeforeOwnGroup, globalLoad);
          if (!best) continue;
          best.duties.push({ group, role });
          globalLoad.set(best.personId, (globalLoad.get(best.personId) ?? 0) + 1);
        }
      }
    }

    for (const { trusted: _trusted, seedRank: _seedRank, ...assignment } of roundAssignments) {
      output.push({ ...assignment, duties: assignment.duties.sort((a, b) => a.group - b.group) });
    }
  }

  return output;
}

function pickCandidate(roundAssignments: WorkingAssignment[], group: number, role: DutyRole, avoidBeforeOwnGroup: boolean, globalLoad: Map<string, number>) {
  let best: WorkingAssignment | undefined;
  let bestKey: number[] = [];
  for (const item of roundAssignments) {
    if (item.group === group || item.duties.some(duty => duty.group === group)) continue;
    const beforeOwn = avoidBeforeOwnGroup && group === item.group - 1 ? 1 : 0;
    const key = role === "scrambler"
      ? [item.duties.length, item.trusted ? 0 : 1, item.seedResult === undefined ? 1 : 0, beforeOwn, item.seedRank]
      : [item.duties.length, beforeOwn, globalLoad.get(item.personId) ?? 0];
    if (!best || compareKeys(key, bestKey) < 0) {
      best = item;
      bestKey = key;
    }
  }
  return best;
}

function compareKeys(a: number[], b: number[]) {
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}
