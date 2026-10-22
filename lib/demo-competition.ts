import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";

const FIRST_NAMES = ["Lucía", "Hugo", "Martina", "Mateo", "Sofía", "Leo", "Julia", "Daniel", "Paula", "Pablo", "Valeria", "Álvaro", "Emma", "Adrián", "Carla", "Mario", "Sara", "Diego", "Noa", "Marcos", "Irene", "Javier", "Elena", "Bruno", "Claudia", "Iker", "Alba", "Nicolás", "Laia", "Gonzalo"];
const LAST_NAMES = ["García", "Martínez", "López", "Sánchez", "Pérez", "Gómez", "Ruiz", "Díaz", "Moreno", "Muñoz", "Álvarez", "Romero", "Navarro", "Torres", "Domínguez", "Vázquez", "Ramos", "Gil", "Serrano", "Blanco", "Molina", "Ortega", "Castro", "Rubio", "Marín", "Sanz", "Iglesias", "Medina", "Garrido", "Cortés"];

/** Typical average (centiseconds) of a mid-level competitor, used to scale fake results. */
const EVENT_BASE: Record<string, number> = { "333": 1800, "222": 600, "444": 6000, "555": 11000, "333oh": 3000, pyram: 700, skewb: 800, clock: 1200, minx: 9000, sq1: 3000, "666": 20000, "777": 30000 };

export type DemoSize = "small" | "large";

const DEMO_SHAPES: Record<DemoSize, { id: string; name: string; people: number; events: string[] }> = {
  small: { id: "DemoOpenPequeno2026", name: "Demo Open Pequeño 2026", people: 34, events: ["333", "222", "pyram", "333oh"] },
  large: { id: "DemoCampeonato2026", name: "Demo Campeonato 2026", people: 260, events: ["333", "222", "444", "555", "333oh", "pyram", "skewb", "clock", "minx", "sq1"] },
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic synthetic competition for tests and local previews. Not real people.
 * `newcomerShare` controls how many people have no official results.
 */
export function buildDemoCompetition({ id, name, people, events, newcomerShare = 0.2, seed = 1 }: { id: string; name: string; people: number; events: string[]; newcomerShare?: number; seed?: number }): StoredCompetition {
  const random = mulberry32(seed);
  const persons: WcifPerson[] = Array.from({ length: people }, (_, index) => {
    const newcomer = random() < newcomerShare;
    const skill = 0.45 + random() * 1.6;
    const eventIds = events.filter((eventId, eventIndex) => eventIndex === 0 || random() < 0.65);
    const year = 2010 + Math.floor(random() * 15);
    const roles = index === 3 || index === 17 ? ["delegate"] : index === 29 ? ["trainee-delegate"] : index === 5 || index === 11 ? ["organizer"] : index % 23 === 7 ? ["staff-judge"] : index === 13 ? ["staff-dataentry"] : [];
    return {
      registrantId: index + 1,
      wcaUserId: 1000 + index,
      countryIso2: random() < 0.1 ? "PT" : "ES",
      roles,
      name: `${FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]} ${LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]}`,
      wcaId: newcomer ? null : `${year}DEMO${String(index % 100).padStart(2, "0")}`,
      birthdate: `${1975 + Math.floor(random() * 40)}-0${1 + Math.floor(random() * 9)}-1${Math.floor(random() * 9)}`,
      registration: { status: "accepted", isCompeting: true, eventIds },
      personalBests: newcomer ? [] : eventIds.filter(() => random() < 0.9).flatMap(eventId => {
        const average = Math.round((EVENT_BASE[eventId] ?? 2000) * skill * (0.85 + random() * 0.3));
        return [{ eventId, type: "average" as const, best: average }, { eventId, type: "single" as const, best: Math.round(average * 0.8) }];
      }),
    };
  });
  return {
    id,
    name,
    shortName: name,
    persons,
    events: events.map(eventId => ({
      id: eventId,
      rounds: [1, 2].map(round => ({
        id: `${eventId}-r${round}`,
        format: eventId === "666" || eventId === "777" ? "m" : "a",
        timeLimit: { centiseconds: Math.round((EVENT_BASE[eventId] ?? 2000) * 3 / 100) * 100, cumulativeRoundIds: [] },
        cutoff: round === 1 && (EVENT_BASE[eventId] ?? 0) >= 6000 ? { numberOfAttempts: 2, attemptResult: Math.round((EVENT_BASE[eventId] ?? 2000) * 1.5 / 100) * 100 } : null,
        advancementCondition: round === 1 ? { type: "percent" as const, level: 75 } : null,
        results: [],
      })),
    })),
    schedule: { venues: [{ id: 1, name: "Recinto de prueba", countryIso2: "ES", rooms: [{ id: 1, name: "Sala principal", activities: [] }] }] },
  };
}

export function demoCompetition(size: DemoSize) {
  return buildDemoCompetition(DEMO_SHAPES[size]);
}
