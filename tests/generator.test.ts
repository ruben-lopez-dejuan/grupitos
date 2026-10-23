import { describe, expect, it } from "vitest";
import { competingGroup, competingGroups, duties, groupTotals, type GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition, WcifPerson } from "@/lib/competition-store";
import { buildDemoCompetition, demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments, groupSizes, splitIntoGroups, type AssignmentOptions } from "@/lib/group-generator";
import { peopleFromWcif, type PeopleSettings } from "@/lib/people";
import { acceptedPeople, compareBySeed, initialRounds, judgesNeeded, personKey, seedResult, usesFixedStations, type RoundConfig, type ZoneMode } from "@/lib/rounds";
import { validateRound, type RoundRules } from "@/lib/validation";

function setup(competition: StoredCompetition, stations: number, zoneMode: ZoneMode, options: Partial<AssignmentOptions> = {}, people = peopleFromWcif(competition)) {
  const rounds = initialRounds(competition, stations, zoneMode);
  const assignments = generateAssignments({ competition, rounds, stations, zoneMode, people, options: { ...DEFAULT_OPTIONS, ...options } });
  return { rounds, assignments, people };
}

const byRound = (assignments: GeneratedAssignment[], roundId: string) => assignments.filter(item => item.roundId === roundId);

function rulesFor(round: RoundConfig, rows: GeneratedAssignment[], stations: number, zoneMode: ZoneMode, people: PeopleSettings): RoundRules {
  const noNormalTasks = new Set([...(people.roles.dataentry ?? []), ...(people.roles.delegate ?? []), ...(people.roles["trainee-delegate"] ?? []), ...(people.roles.organizer ?? [])]);
  return { groups: round.groups, scramblers: round.scramblers, runners: round.runners, stations, fixedStations: usesFixedStations(round.roundNumber, rows.filter(row => row.inRound).length, stations, zoneMode), checkJudges: true, checkDelegates: false, checkDataEntry: false, noNormalTasks };
}

const scenarios = [
  { name: "open pequeño, sala de espera", competition: demoCompetition("small"), stations: 8, zoneMode: "waiting" as const },
  { name: "open pequeño, puestos fijos", competition: demoCompetition("small"), stations: 12, zoneMode: "fixed" as const },
  { name: "campeonato grande, puestos fijos", competition: demoCompetition("large"), stations: 16, zoneMode: "fixed" as const },
  { name: "campeonato grande, mixto", competition: demoCompetition("large"), stations: 20, zoneMode: "mixed" as const },
];

describe.each(scenarios)("generateAssignments — $name", ({ competition, stations, zoneMode }) => {
  const { rounds, assignments, people } = setup(competition, stations, zoneMode);
  const generated = rounds.filter(round => round.enabled && round.competitorsKnown);

  it("only generates rounds with known competitors (first rounds here)", () => {
    expect(new Set(assignments.map(item => item.roundId))).toEqual(new Set(generated.map(round => round.id)));
    expect(generated.every(round => round.roundNumber === 1)).toBe(true);
  });

  it("puts every registered competitor in exactly one group", () => {
    for (const round of generated) {
      const registered = acceptedPeople(competition).filter(person => person.registration?.eventIds?.includes(round.eventId)).map(personKey).sort();
      const rows = byRound(assignments, round.id).filter(item => item.inRound);
      expect(rows.map(item => item.personId).sort()).toEqual(registered);
      for (const item of rows) expect(competingGroups(item)).toHaveLength(1);
    }
  });

  it("keeps group sizes within one person of each other", () => {
    for (const round of generated) {
      const sizes = groupTotals(byRound(assignments, round.id), round.groups).map(total => total.counts.competitor);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it("never breaks a hard rule", () => {
    for (const round of generated) {
      const rows = byRound(assignments, round.id);
      const errors = validateRound(round.id, rows, rulesFor(round, rows, stations, zoneMode, people)).filter(issue => issue.severity === "error");
      expect(errors).toEqual([]);
    }
  });

  it("staffs every group fully, or uses everyone available when it cannot", () => {
    const busy = new Set([...(people.roles.delegate ?? []), ...(people.roles["trainee-delegate"] ?? []), ...(people.roles.organizer ?? []), ...(people.roles.dataentry ?? [])]);
    const eligible = acceptedPeople(competition).map(personKey).filter(key => !busy.has(key));
    for (const round of generated) {
      const rows = byRound(assignments, round.id);
      for (const { group, counts } of groupTotals(rows, round.groups)) {
        const needed = round.scramblers + judgesNeeded(counts.competitor, stations) + round.runners;
        const competing = new Set(rows.filter(row => competingGroup(row) === group).map(row => row.personId));
        const available = eligible.filter(key => !competing.has(key)).length;
        const full = counts.scrambler === round.scramblers && counts.judge === judgesNeeded(counts.competitor, stations) && counts.runner === round.runners;
        expect(full || counts.scrambler + counts.judge + counts.runner === Math.min(available, needed)).toBe(true);
      }
    }
  });

  it("gives no normal tasks to delegates, organizers or data entry", () => {
    const busy = new Set([...(people.roles.delegate ?? []), ...(people.roles["trainee-delegate"] ?? []), ...(people.roles.organizer ?? []), ...(people.roles.dataentry ?? [])]);
    expect(busy.size).toBeGreaterThan(0);
    expect(assignments.filter(item => busy.has(item.personId)).flatMap(duties)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(setup(competition, stations, zoneMode).assignments).toEqual(assignments);
  });
});

describe("splitIntoGroups (Groupifier rules)", () => {
  const people = Array.from({ length: 10 }, (_, index) => ({ name: `P${index}`, registrantId: index }) as WcifPerson);
  const names = (groups: WcifPerson[][]) => groups.map(group => group.map(person => person.name));

  it("ranks: the best compete in the last group", () => {
    expect(names(splitIntoGroups(people, 2, "ranks", "333"))).toEqual([["P9", "P8", "P7", "P6", "P5"], ["P4", "P3", "P2", "P1", "P0"]]);
  });

  it("symmetric: deals the best out one per group", () => {
    const groups = splitIntoGroups(people, 3, "symmetric", "333");
    expect(groups.map(group => group.length)).toEqual(groupSizes(10, 3));
    expect(groups.map(group => group.some(person => ["P0", "P1", "P2"].includes(person.name)))).toEqual([true, true, true]);
  });

  it("balanced: ranks for 3x3, symmetric for big cubes", () => {
    expect(splitIntoGroups(people, 2, "balanced", "333")).toEqual(splitIntoGroups(people, 2, "ranks", "333"));
    expect(splitIntoGroups(people, 2, "balanced", "555")).toEqual(splitIntoGroups(people, 2, "symmetric", "555"));
  });

  it("name-optimised keeps everyone and separates repeated first names", () => {
    const named = ["Ana A", "Ana B", "Ana C", "Luis A", "Luis B", "Eva", "Pau", "Joan", "Rita", "Ivo"].map((name, index) => ({ name, registrantId: index }) as WcifPerson);
    const groups = splitIntoGroups(named, 3, "name-optimised", "333");
    expect(groups.flat()).toHaveLength(10);
    expect(groups.map(group => group.filter(person => person.name.startsWith("Ana")).length)).toEqual([1, 1, 1]);
  });
});

describe("generateAssignments — reglas concretas", () => {
  const competition = buildDemoCompetition({ id: "Test", name: "Test", people: 60, events: ["333"], seed: 7 });
  const round: RoundConfig = { id: "333-r1", eventId: "333", label: "", roundNumber: 1, competitors: 60, competitorsKnown: true, groups: 4, scramblers: 2, runners: 1, enabled: true };
  const people = peopleFromWcif(competition);
  const run = (options: Partial<AssignmentOptions> = {}, settings: PeopleSettings = people, zoneMode: ZoneMode = "waiting", stations = 10) =>
    generateAssignments({ competition, rounds: [round], stations, zoneMode, people: settings, options: { ...DEFAULT_OPTIONS, ...options } });

  it("strict scramblers only use people with results or trusted people", () => {
    const result = run({ sortingRule: "scrambler-safe" });
    expect(result.filter(item => duties(item).some(duty => duty.role === "scrambler")).every(item => item.seedResult !== undefined)).toBe(true);
  });

  it("reads WCIF 2 personal best values and still fills strict scramblers", () => {
    const versionTwo = structuredClone(competition);
    versionTwo.formatVersion = "2.2";
    for (const person of versionTwo.persons ?? []) for (const personalBest of person.personalBests ?? []) {
      personalBest.value = personalBest.best;
      delete personalBest.best;
    }
    const versionTwoPeople = peopleFromWcif(versionTwo);
    const result = generateAssignments({ competition: versionTwo, rounds: [round], stations: 10, zoneMode: "waiting", people: versionTwoPeople, options: DEFAULT_OPTIONS });
    const scramblers = result.filter(item => duties(item).some(duty => duty.role === "scrambler"));
    expect(scramblers).toHaveLength(round.groups * round.scramblers);
    expect(scramblers.every(item => item.seedResult !== undefined)).toBe(true);
    expect(seedResult(versionTwo.persons!.find(person => person.personalBests?.some(best => best.eventId === "333"))!, "333")).toBeDefined();
  });

  it("trusted people scramble even when slower", () => {
    const slowest = [...acceptedPeople(competition)].filter(person => person.personalBests?.some(best => best.eventId === "333") && !(person.roles?.length)).sort(compareBySeed("333")).at(-1)!;
    const result = run({ sortingRule: "symmetric" }, { ...people, trustedIds: [personKey(slowest)] });
    expect(duties(result.find(item => item.personId === personKey(slowest))!).some(duty => duty.role === "scrambler")).toBe(true);
  });

  it("does not favour working right before one's own group", () => {
    const count = (avoidBeforeOwnGroup: boolean) => run({ avoidBeforeOwnGroup }).flatMap(item => duties(item).filter(duty => duty.group === (competingGroup(item) ?? 0) - 1)).length;
    expect(count(true)).toBeLessThan(count(false));
  });

  it("spreads delegates across groups", () => {
    const delegates = new Set([...(people.roles.delegate ?? []), ...(people.roles["trainee-delegate"] ?? [])]);
    const groupsOf = (spreadDelegates: boolean) => run({ spreadDelegates }).filter(item => delegates.has(item.personId)).map(competingGroup);
    expect(new Set(groupsOf(true)).size).toBe(Math.min(delegates.size, round.groups));
  });

  it("assigns delegate duties only to the chosen delegates, one per group", () => {
    const chosen = (people.roles.delegate ?? []).slice(0, 1).concat(people.roles["trainee-delegate"] ?? []);
    const result = run({ assignDelegateDuties: true }, { ...people, delegateDutyIds: chosen });
    const delegateDuties = result.flatMap(item => duties(item).filter(duty => duty.role === "delegate").map(duty => ({ person: item.personId, group: duty.group })));
    expect(delegateDuties.every(duty => chosen.includes(duty.person))).toBe(true);
    expect(groupTotals(result, round.groups).map(total => total.counts.delegate)).toEqual([1, 1, 1, 1]);
  });

  it("assigns data entry to data entry people only", () => {
    const result = run({ assignDataEntry: true });
    const dataEntry = result.filter(item => duties(item).some(duty => duty.role === "dataentry"));
    expect(dataEntry.length).toBeGreaterThan(0);
    expect(dataEntry.every(item => people.roles.dataentry?.includes(item.personId))).toBe(true);
  });

  it("gives normal tasks to delegates and organizers only when allowed", () => {
    // Nearly everyone is an organizer, so the generator has to use them if it may.
    const keys = acceptedPeople(competition).map(personKey);
    const settings = { ...people, roles: { ...people.roles, organizer: keys.slice(5), staff: [] } };
    const organizerTasks = (allowed: boolean) => run({ normalTasksForDelegatesAndOrganizers: allowed }, settings).filter(item => settings.roles.organizer.includes(item.personId)).flatMap(duties).length;
    expect(organizerTasks(false)).toBe(0);
    expect(organizerTasks(true)).toBeGreaterThan(0);
  });

  it("makes staff do more tasks than other competitors", () => {
    const staffKey = personKey(acceptedPeople(competition).find(person => !person.roles?.length)!);
    const settings = { ...people, roles: { ...people.roles, staff: [staffKey] } };
    const result = run({}, settings);
    const load = (key: string) => result.filter(item => item.personId === key).flatMap(duties).length;
    const others = result.filter(item => item.inRound && !settings.roles.staff.includes(item.personId)).map(item => duties(item).length);
    expect(load(staffKey)).toBeGreaterThan(Math.max(...others));
  });

  it("uses fixed stations in rounds that fit in the stations, even with a waiting room", () => {
    const result = run({}, people, "waiting", 60);
    expect(result.filter(item => item.inRound).every(item => item.station !== undefined)).toBe(true);
  });

  it("skips later rounds whose competitors are unknown", () => {
    const later: RoundConfig = { ...round, id: "333-r2", roundNumber: 2, competitorsKnown: false };
    expect(generateAssignments({ competition, rounds: [later], stations: 10, zoneMode: "waiting", people, options: DEFAULT_OPTIONS })).toEqual([]);
  });
});

describe("generateAssignments — reparto justo en un campeonato grande", () => {
  const competition = demoCompetition("large");
  const people = peopleFromWcif(competition);
  const rounds = initialRounds(competition, 16, "fixed");
  const rows = generateAssignments({ competition, rounds, stations: 16, zoneMode: "fixed", people, options: DEFAULT_OPTIONS });
  const staff = new Set(people.roles.staff ?? []);
  const busy = new Set([...(people.roles.delegate ?? []), ...(people.roles["trainee-delegate"] ?? []), ...(people.roles.organizer ?? []), ...(people.roles.dataentry ?? [])]);
  const load = new Map<string, number>();
  for (const row of rows) load.set(row.personId, (load.get(row.personId) ?? 0) + duties(row).length);
  const others = acceptedPeople(competition).map(personKey).filter(key => !staff.has(key) && !busy.has(key)).map(key => load.get(key) ?? 0);
  const average = others.reduce((sum, value) => sum + value, 0) / others.length;

  it("keeps everyone's load close to the average", () => {
    expect(Math.max(...others)).toBeLessThanOrEqual(Math.ceil(average * 1.5));
    expect(Math.min(...others)).toBeGreaterThanOrEqual(Math.floor(average * 0.5));
  });

  it("gives staff more work, but only about twice the average", () => {
    for (const key of staff) {
      expect(load.get(key) ?? 0).toBeGreaterThan(average);
      expect(load.get(key) ?? 0).toBeLessThanOrEqual(2 * average + 4);
    }
  });

  it("strict mode never repeats a scrambler in a round when there are enough good people", () => {
    expect(rows.filter(row => duties(row).filter(duty => duty.role === "scrambler").length > 1)).toEqual([]);
  });

  it("strict mode takes scramblers from the faster half of each round", () => {
    for (const round of rounds.filter(item => item.enabled)) {
      const competitors = rows.filter(row => row.roundId === round.id && row.inRound).sort((a, b) => (a.seedResult ?? 1e12) - (b.seedResult ?? 1e12));
      const scramblers = competitors.filter(row => duties(row).some(duty => duty.role === "scrambler"));
      for (const row of scramblers) expect(competitors.indexOf(row)).toBeLessThan(Math.max(Math.ceil(competitors.length / 2), round.scramblers * round.groups));
    }
  });
});
