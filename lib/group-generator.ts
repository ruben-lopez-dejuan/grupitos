import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";

export type DutyRole = "judge" | "scrambler" | "runner" | "";

export type GeneratedAssignment = {
  id: string;
  roundId: string;
  eventId: string;
  personId: string;
  name: string;
  wcaId?: string | null;
  group: number;
  station?: number;
  dutyGroup?: number;
  dutyRole: DutyRole;
};

export type GenerationRound = {
  id: string;
  eventId: string;
  groups: number;
  scramblers: number;
  enabled: boolean;
};

type WorkingAssignment = GeneratedAssignment & { source: WcifPerson };

function personId(person: WcifPerson) {
  return String(person.registrantId ?? person.wcaId ?? person.name);
}

function eventBest(person: WcifPerson, eventId: string) {
  const results = person.personalBests?.filter(best => best.eventId === eventId) ?? [];
  return results.find(best => best.type === "average")?.best ?? results.find(best => best.type === "single")?.best ?? Number.MAX_SAFE_INTEGER;
}

function symmetricGroup(index: number, groupCount: number) {
  const cycle = Math.floor(index / groupCount);
  const offset = index % groupCount;
  return cycle % 2 === 0 ? offset + 1 : groupCount - offset;
}

export function generateAssignments({ competition, rounds, stations, fixedStations, trustedIds }: {
  competition: StoredCompetition;
  rounds: GenerationRound[];
  stations: number;
  fixedStations: boolean;
  trustedIds: string[];
}) {
  const accepted = (competition.persons ?? []).filter(person => person.registration?.status === "accepted" && person.registration.isCompeting !== false);
  const output: GeneratedAssignment[] = [];

  for (const round of rounds.filter(item => item.enabled && item.groups > 0)) {
    const competitors = accepted
      .filter(person => person.registration?.eventIds?.includes(round.eventId))
      .sort((a, b) => eventBest(a, round.eventId) - eventBest(b, round.eventId) || a.name.localeCompare(b.name));

    const roundAssignments: WorkingAssignment[] = competitors.map((person, index) => ({
      id: `${round.id}:${personId(person)}`,
      roundId: round.id,
      eventId: round.eventId,
      personId: personId(person),
      name: person.name,
      wcaId: person.wcaId,
      group: symmetricGroup(index, round.groups),
      dutyRole: "" as DutyRole,
      source: person,
    }));

    if (fixedStations) {
      for (let group = 1; group <= round.groups; group += 1) {
        roundAssignments.filter(item => item.group === group).forEach((item, index) => {
          item.station = (index % Math.max(stations, 1)) + 1;
        });
      }
    }

    const used = new Set<string>();
    for (let dutyGroup = 1; dutyGroup <= round.groups; dutyGroup += 1) {
      const candidates = roundAssignments
        .filter(item => item.group !== dutyGroup && !used.has(item.id))
        .sort((a, b) => {
          const aTrusted = trustedIds.includes(a.personId) ? 0 : 1;
          const bTrusted = trustedIds.includes(b.personId) ? 0 : 1;
          const aImmediatelyBefore = dutyGroup === a.group - 1 ? 1 : 0;
          const bImmediatelyBefore = dutyGroup === b.group - 1 ? 1 : 0;
          return aTrusted - bTrusted || aImmediatelyBefore - bImmediatelyBefore || eventBest(a.source, round.eventId) - eventBest(b.source, round.eventId);
        });
      candidates.slice(0, round.scramblers).forEach(item => {
        item.dutyGroup = dutyGroup;
        item.dutyRole = "scrambler";
        used.add(item.id);
      });
    }

    const dutyCounts = Array.from({ length: round.groups }, () => 0);
    roundAssignments.filter(item => item.dutyGroup).forEach(item => dutyCounts[(item.dutyGroup ?? 1) - 1] += 1);
    for (const item of roundAssignments.filter(candidate => !used.has(candidate.id))) {
      const choices = Array.from({ length: round.groups }, (_, index) => index + 1)
        .filter(group => group !== item.group)
        .sort((a, b) => {
          const aImmediatelyBefore = a === item.group - 1 ? 1 : 0;
          const bImmediatelyBefore = b === item.group - 1 ? 1 : 0;
          return aImmediatelyBefore - bImmediatelyBefore || dutyCounts[a - 1] - dutyCounts[b - 1];
        });
      const dutyGroup = choices[0];
      if (dutyGroup) {
        item.dutyGroup = dutyGroup;
        item.dutyRole = dutyCounts[dutyGroup - 1] === round.scramblers ? "runner" : "judge";
        dutyCounts[dutyGroup - 1] += 1;
      }
    }

    output.push(...roundAssignments.map(({ source: _source, ...assignment }) => assignment));
  }

  return output;
}
