import type { StoredCompetition, WcifActivity, WcifPerson, WcifRoom } from "@/lib/competition-store";

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
    schedule: demoSchedule(events, people > 100),
  };
}

const DEMO_START = "2026-11-14";
/** Minutes per first round, roughly proportional to how slow the event is. */
const ROUND_MINUTES: Record<string, number> = { "333": 110, "222": 70, "444": 90, "555": 80, "333oh": 70, pyram: 70, skewb: 55, clock: 50, minx: 70, sq1: 40 };

/** A two-day WCIF schedule. The large demo has one room with two natshelper stages. */
function demoSchedule(events: string[], multipleStages: boolean): StoredCompetition["schedule"] {
  let nextId = 1;
  const stageDefinitions = multipleStages ? [{ id: 0, name: "Rojo", color: "#d93636" }, { id: 1, name: "Verde", color: "#2f9e44" }] : [];
  const main: WcifRoom = {
    id: 1,
    name: "Pabellón",
    color: "#2563eb",
    activities: [],
    ...(multipleStages ? { extensions: [{ id: "org.cubingusa.natshelper.v1.Room", data: { stages: stageDefinitions } }] } : {}),
  };
  const auxiliary: WcifRoom | undefined = multipleStages ? { id: 2, name: "Sala auxiliar", color: "#681da8", activities: [] } : undefined;
  const otherRoom = auxiliary ?? main;
  // 14 November is in winter time (UTC+1).
  const iso = (day: number, minutes: number) => new Date(Date.parse(`2026-11-${14 + day}T00:00:00+01:00`) + minutes * 60000).toISOString().replace(".000", "");
  const add = (room: WcifRoom, activityCode: string, name: string, day: number, from: number, length: number, groups = 0, stageIds: number[] = []) => {
    const id = nextId++;
    const targets = stageIds.length ? stageIds : [undefined];
    const childActivities = groups ? targets.flatMap(stageId => Array.from({ length: groups }, (_, index) => ({
      id: nextId++,
      name: `${name}${stageId === undefined ? "" : ` ${stageDefinitions.find(stage => stage.id === stageId)?.name}`} ${index + 1}`,
      activityCode: `${activityCode}-g${index + 1}`,
      startTime: iso(day, from + (index * length) / groups),
      endTime: iso(day, from + ((index + 1) * length) / groups),
      ...(stageId === undefined ? {} : { extensions: [{ id: "org.cubingusa.natshelper.v1.Group", data: { stageId } }] }),
    }))) : [];
    room.activities!.push({ id, name, activityCode, startTime: iso(day, from), endTime: iso(day, from + length), childActivities } satisfies WcifActivity);
  };
  const half = Math.ceil(events.length / 2);
  const firstRounds = [events.slice(0, half), events.slice(half)];
  let finalsAt = 0;
  firstRounds.forEach((dayEvents, day) => {
    add(otherRoom, "other-checkin", "Check-in", day, 9 * 60 + 30, 30);
    let at = 10 * 60;
    dayEvents.forEach((eventId, index) => {
      const length = Math.round((ROUND_MINUTES[eventId] ?? 60) * (multipleStages ? 1 : 0.5) / 5) * 5;
      add(main, `${eventId}-r1`, `${eventId} R1`, day, at, length);
      at += length;
      if (index === Math.floor(dayEvents.length / 2) - 1) {
        add(otherRoom, "other-lunch", "Comida", day, at, 60);
        at += 60;
      }
    });
    finalsAt = at;
  });
  if (multipleStages) add(main, "other-setup", "Montaje de finales", 1, finalsAt, 20);
  if (multipleStages) finalsAt += 20;
  for (const eventId of events) {
    add(main, `${eventId}-r2`, `${eventId} R2`, 1, finalsAt, 25, eventId === "333" ? 2 : 1, stageDefinitions.map(stage => stage.id));
    finalsAt += 25;
  }
  add(otherRoom, "other-awards", "Entrega de premios", 1, finalsAt, 30);
  return { startDate: DEMO_START, numberOfDays: 2, venues: [{ id: 1, name: "Recinto de prueba", countryIso2: "ES", timezone: "Europe/Madrid", rooms: [main, ...(auxiliary ? [auxiliary] : [])] }] };
}

export function demoCompetition(size: DemoSize) {
  return buildDemoCompetition(DEMO_SHAPES[size]);
}
