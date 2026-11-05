import { describe, expect, it } from "vitest";
import { buildDemoCompetition } from "@/lib/demo-competition";
import type { WorkspaceSettings } from "@/lib/draft";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { resolveSets } from "@/lib/pro/assignment-sets";
import { groupSlots, targetKey, withScheduledGroups, type ProSchedule } from "@/lib/pro/schedule";
import { resolveStationRules } from "@/lib/pro/station-rules";
import { applyTemplate, exportTemplate, parseTemplate, templateFileName } from "@/lib/pro/template";
import { SPANISH_CHAMPIONSHIP_2026 } from "@/lib/pro/templates/spanish-championship-2026";
import { initialRounds, personKey } from "@/lib/rounds";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import { DEFAULT_SEATING, normalizeSeating, stationOrder } from "@/lib/seating";

const NATIONAL_EVENTS = ["333", "222", "444", "555", "666", "777", "333bf", "333oh", "clock", "minx", "pyram", "skewb", "sq1", "444bf", "555bf", "333mbf"];
const competition = buildDemoCompetition({ id: "Tpl", name: "Tpl", people: 30, events: NATIONAL_EVENTS, newcomerShare: 0, seed: 5 });
// 3x3 has four rounds, as at the championship.
const rounds333 = competition.events!.find(event => event.id === "333")!.rounds!;
rounds333.push(...[3, 4].map(round => ({ ...rounds333[1], id: `333-r${round}` })));

/** Rooms like the national championship's; ids differ on purpose. */
function schedule(names = ["Araba", "Bizkaia", "Gipuzkoa"], days = ["2026-12-05", "2026-12-06", "2026-12-07"]): ProSchedule {
  return {
    timeZone: "Europe/Madrid", days, activities: [], blocks: [],
    rooms: [
      { id: 7, name: "Pabellón", color: "#fb1313", stages: names.map((name, index) => ({ id: 10 + index, name, color: "#000" })) },
      { id: 8, name: "Sala Auxiliar", color: "#681da8", stages: [] },
    ],
  };
}

function settings(pro: ProSchedule): WorkspaceSettings {
  return {
    stations: 14, zoneMode: "fixed", rounds: initialRounds(competition, 14, "fixed"), options: DEFAULT_OPTIONS, people: peopleFromWcif(competition), printing: DEFAULT_PRINTING,
    pro: { enabled: true, schedule: pro, people: { propertyKeys: ["team"], properties: { "1": { team: "Side room" } }, volunteers: [{ key: "vol-1", name: "Ana" }], unavailable: [{ id: "u1", personKey: "1", start: "2026-12-05T09:00", end: "2026-12-05T10:00" }] } },
  };
}

describe("PRO templates", () => {
  it("apply the national championship with every room, round and day found, keeping people's data", () => {
    const before = settings(schedule());
    const { settings: after, warnings } = applyTemplate(before, schedule(), SPANISH_CHAMPIONSHIP_2026);
    expect(warnings).toEqual({ lanes: [], rounds: [], days: [] });
    const pro = after.pro!;
    expect(pro.sets!.map(set => set.id)).toEqual([
      "sc26-finals26-bizkaia", "sc26-finals26-gipuzkoa", "sc26-333bf-r2-bizkaia", "sc26-333bf-r2-gipuzkoa",
      "sc26-final333-odd", "sc26-final333-even", "sc26-final333-rest", "sc26-semi333-bizkaia", "sc26-semi333-gipuzkoa", "sc26-semi333-araba", "sc26-finals-odd", "sc26-finals-even",
      "sc26-featured", "sc26-top", "sc26-later-featured", "sc26-core",
      "sc26-delegates-12-sábado", "sc26-delegates-3-sábado", "sc26-delegates-4-sábado", "sc26-delegates-12-domingo", "sc26-delegates-3-domingo", "sc26-delegates-4-domingo", "sc26-delegates-12-lunes", "sc26-delegates-3-lunes", "sc26-delegates-4-lunes",
      "sc26-aes", "sc26-data", "sc26-streaming", "sc26-everyone", "sc26-later-everyone",
    ]);
    expect(pro.sets!.find(set => set.id === "sc26-featured")!.lanes).toEqual(["7:11"]);
    expect(pro.sets!.find(set => set.id === "sc26-finals-even")).toMatchObject({ rounds: "final", positions: "even", first: "sc26-spaniards", lanes: ["7:12"] });
    expect(pro.staffing).toEqual({
      "7:10": { stations: 14, maxPerGroup: 28 }, "7:11": { stations: 14, maxPerGroup: 23 }, "7:12": { stations: 14, maxPerGroup: 28 },
      "8:room": { stations: 20, scramblers: 2, runners: 2 },
    });
    expect(pro.people!.teams!.setup["Side room"]).toEqual({ kind: "volunteer", lane: "8:room", busy: [{ day: "2026-12-06", start: "08:45", end: "09:15" }, { day: "2026-12-06", start: "12:15", end: "12:25" }] });
    expect(after.rounds.find(round => round.id === "333mbf-r1")).toMatchObject({ scramblers: 0, runners: 0, staffSetByHand: true });
    expect(after.options).toMatchObject({ tasksForOwnEventsOnly: true, noTasksForNewcomers: true, sortingRule: "scrambler-safe", assignDataEntry: true });
    expect(pro.jobs).toEqual({ scrambler: "s7" });
    expect(pro.segments!.map(segment => segment.id)).toContain("s7");
    expect(pro.scoring?.enabled).toBe(true);
    expect(after.printing).toMatchObject({ coverSheets: true, order: "stacked" });
    // Personal data and the schedule stay.
    expect(pro.people!.properties).toEqual(before.pro!.people!.properties);
    expect(pro.people!.volunteers).toEqual(before.pro!.people!.volunteers);
    expect(pro.people!.unavailable).toEqual(before.pro!.people!.unavailable);
    expect(pro.schedule).toEqual(before.pro!.schedule);
  });

  it("follow the 2026 scripts in the finals they cover and in 3BLD round 2", () => {
    const { settings: after } = applyTemplate(settings(schedule()), schedule(), SPANISH_CHAMPIONSHIP_2026);
    const pro = after.pro!;
    const setsOf = (roundId: string) => pro.sets!.filter(set => Array.isArray(set.rounds) && set.rounds.includes(roundId));
    for (const roundId of ["clock-r2", "777-r2", "sq1-r2", "666-r2"]) {
      expect(setsOf(roundId).map(set => set.id)).toEqual(["sc26-finals26-bizkaia", "sc26-finals26-gipuzkoa"]);
      expect(after.rounds.find(round => round.id === roundId)).toMatchObject({ scramblers: 3, runners: 3, staffSetByHand: true });
    }
    expect(pro.sets!.find(set => set.id === "sc26-finals26-bizkaia")).toMatchObject({ top: 14, first: "sc26-spaniards", overfill: true, lanes: ["7:11"] });
    expect(pro.sets!.findIndex(set => set.id === "sc26-finals26-gipuzkoa")).toBeLessThan(pro.sets!.findIndex(set => set.id === "sc26-finals-odd"));
    // Nobody featured and no delegates' sets in 3BLD round 2.
    expect(setsOf("333bf-r2").map(set => [set.id, set.top, set.lanes, set.featured])).toEqual([["sc26-333bf-r2-bizkaia", 25, ["7:11"], undefined], ["sc26-333bf-r2-gipuzkoa", undefined, ["7:12"], undefined]]);
    expect(after.rounds.find(round => round.id === "333bf-r2")).toMatchObject({ scramblers: 4, runners: 3, staffSetByHand: true });
    // SeedToStation in the scripts, with the default layout and 14 stations.
    const rule = pro.stationRules!.find(item => item.id === "sc26-finals26-bizkaia")!;
    expect(rule).toMatchObject({ first: "sc26-spaniards", seating: "center", lanes: ["7:11"] });
    expect(pro.stationRules!.findIndex(item => item === rule)).toBeLessThan(pro.stationRules!.findIndex(item => item.id === "sc26-finals"));
    expect(stationOrder(14, { ...DEFAULT_SEATING, order: "center" })).toEqual([4, 5, 3, 6, 2, 7, 1, 8, 11, 12, 10, 13, 9, 14]);
  });

  it("generate a 2026 final as the scripts do: 14 on Bizkaia from the centre, Spaniards first, the rest on Gipuzkoa", () => {
    const final = buildDemoCompetition({ id: "Final", name: "Final", people: 30, events: ["clock"], newcomerShare: 0, seed: 7 });
    const event = final.events!.find(item => item.id === "clock")!;
    const people = (final.persons ?? []).filter(person => person.registrantId != null).slice(0, 20);
    expect(people).toHaveLength(20);
    event.rounds![0].results = people.map((person, index) => ({ personId: person.registrantId!, ranking: index + 1, average: 1000 + index, best: 900 + index }));
    event.rounds![1].results = people.map(person => ({ personId: person.registrantId!, ranking: null }));
    // The two best are foreigners, so they count after the Spaniards.
    const spaniards = new Set(people.slice(2).map(person => personKey(person)));
    const pro = schedule();
    pro.days = ["2026-12-05"];
    pro.blocks = [11, 12].map(stageId => ({ id: `b${stageId}`, activityCode: "clock-r2", roomId: 7, stageId, start: "2026-12-05T17:40", end: "2026-12-05T18:05", groups: 1 }));
    const slots = groupSlots(pro);
    const { settings: applied } = applyTemplate(settings(pro), pro, SPANISH_CHAMPIONSHIP_2026);
    const rounds = withScheduledGroups(initialRounds(final, 14, "fixed"), slots).filter(round => round.id === "clock-r2").map(round => ({ ...round, final: true }));
    const staffing = (_roundId: string, group: number) => applied.pro!.staffing![targetKey(7, slots.get("clock-r2")!.find(slot => slot.group === group)!.stageId)];
    const membersOf = (id: string) => id === "sc26-spaniards" ? spaniards : undefined;
    const assignments = generateAssignments({
      competition: final, rounds, stations: 14, zoneMode: "fixed", seating: normalizeSeating(undefined), people: peopleFromWcif(final), options: DEFAULT_OPTIONS, slots, staffing,
      assignmentSets: round => resolveSets(applied.pro!.sets, round, slots.get(round.id), membersOf),
      stationRules: round => resolveStationRules(applied.pro!.stationRules, round, slots.get(round.id), membersOf),
    });
    const bizkaia = slots.get("clock-r2")!.find(slot => slot.stageId === 11)!.group;
    const inBizkaia = assignments.filter(item => item.inRound && item.tasks.some(task => task.role === "competitor" && task.group === bizkaia));
    const inGipuzkoa = assignments.filter(item => item.inRound && !inBizkaia.includes(item));
    expect([inBizkaia.length, inGipuzkoa.length]).toEqual([14, 6]);
    const stationOf = new Map(inBizkaia.map(item => [item.personId, item.station]));
    // Seeds 3 to 16 of the round are the Spaniards' 1st to 14th: SeedToStation in the scripts.
    expect(people.slice(2, 16).map(person => stationOf.get(personKey(person)))).toEqual([4, 5, 3, 6, 2, 7, 1, 8, 11, 12, 10, 13, 9, 14]);
    // Gipuzkoa by position, Spaniards first: the foreigners take the last stations.
    const stationIn = new Map(inGipuzkoa.map(item => [item.personId, item.station]));
    expect([...people.slice(16), ...people.slice(0, 2)].map(person => stationIn.get(personKey(person)))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("round-trip through a file in another competition, matching rooms by name", () => {
    const { settings: national } = applyTemplate(settings(schedule()), schedule(), SPANISH_CHAMPIONSHIP_2026);
    const file = JSON.stringify(exportTemplate(national, "Mi plantilla"));
    expect(file).not.toContain("vol-1");
    expect(file).not.toContain("2026-12-06");
    const template = parseTemplate(file)!;
    expect(template.name).toBe("Mi plantilla");
    // Another competition: stages with other ids and names in other case, one stage missing, two days.
    const other = schedule(["araba", "BIZKAIA"], ["2027-03-01", "2027-03-02"]);
    other.rooms[0].id = 3;
    const { settings: copy, warnings } = applyTemplate(settings(other), other, template);
    expect(warnings.lanes).toEqual(["Gipuzkoa"]);
    expect(copy.pro!.sets![0].lanes).toEqual(["3:11"]);
    expect(copy.pro!.people!.teams!.setup["Side room"].busy![0].day).toBe("2027-03-02");
  });

  it("refuses other files and names exported files", () => {
    expect(parseTemplate("{\"format\":\"something\"}")).toBeUndefined();
    expect(parseTemplate("not json")).toBeUndefined();
    expect(templateFileName("Campeonato de España 2026")).toBe("campeonato-de-espana-2026.json");
  });
});
