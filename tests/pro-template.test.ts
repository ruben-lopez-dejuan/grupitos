import { describe, expect, it } from "vitest";
import { buildDemoCompetition } from "@/lib/demo-competition";
import type { WorkspaceSettings } from "@/lib/draft";
import { DEFAULT_OPTIONS } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import type { ProSchedule } from "@/lib/pro/schedule";
import { applyTemplate, exportTemplate, parseTemplate, templateFileName } from "@/lib/pro/template";
import { SPANISH_CHAMPIONSHIP_2026 } from "@/lib/pro/templates/spanish-championship-2026";
import { initialRounds } from "@/lib/rounds";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";

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
      "sc26-final333-odd", "sc26-final333-even", "sc26-final333-rest", "sc26-semi333-bizkaia", "sc26-semi333-gipuzkoa", "sc26-semi333-araba", "sc26-finals-odd", "sc26-finals-even",
      "sc26-featured", "sc26-top", "sc26-later-featured", "sc26-core",
      "sc26-delegates-12-sábado", "sc26-delegates-3-sábado", "sc26-delegates-4-sábado", "sc26-delegates-12-domingo", "sc26-delegates-3-domingo", "sc26-delegates-4-domingo", "sc26-delegates-12-lunes", "sc26-delegates-3-lunes", "sc26-delegates-4-lunes",
      "sc26-aes", "sc26-data", "sc26-streaming", "sc26-everyone", "sc26-later-everyone",
    ]);
    expect(pro.sets!.find(set => set.id === "sc26-featured")!.lanes).toEqual(["7:11"]);
    expect(pro.sets!.find(set => set.id === "sc26-finals-even")).toMatchObject({ rounds: "final", positions: "even", first: "sc26-spaniards", lanes: ["7:12"] });
    expect(pro.staffing).toEqual({
      "7:10": { stations: 14, maxPerGroup: 28 }, "7:11": { stations: 14, maxPerGroup: 22 }, "7:12": { stations: 14, maxPerGroup: 28 },
      "8:room": { stations: 20, scramblers: 2, runners: 2 },
    });
    expect(pro.people!.teams!.setup["Side room"]).toEqual({ kind: "volunteer", lane: "8:room", busy: [{ day: "2026-12-06", start: "08:45", end: "09:15" }, { day: "2026-12-06", start: "12:15", end: "12:25" }] });
    expect(after.rounds.find(round => round.id === "333mbf-r1")).toMatchObject({ scramblers: 0, runners: 0, staffSetByHand: true });
    expect(after.options).toMatchObject({ tasksForOwnEventsOnly: true, noTasksForNewcomers: true });
    expect(after.printing).toMatchObject({ coverSheets: true, order: "stacked" });
    // Personal data and the schedule stay.
    expect(pro.people!.properties).toEqual(before.pro!.people!.properties);
    expect(pro.people!.volunteers).toEqual(before.pro!.people!.volunteers);
    expect(pro.people!.unavailable).toEqual(before.pro!.people!.unavailable);
    expect(pro.schedule).toEqual(before.pro!.schedule);
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
