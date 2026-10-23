import { describe, expect, it } from "vitest";
// @ts-expect-error -- pdfmake's server build ships without types
import pdfmake from "pdfmake";
import type { StoredCompetition } from "@/lib/competition-store";
import { demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, withScheduledGroups, type ProSchedule } from "@/lib/pro/schedule";
import { initialRounds } from "@/lib/rounds";
import { DEFAULT_PRINTING, type PaperSize } from "@/lib/scorecards/options";
import { blankScorecards, fitText, roundScorecards, scorecardsPdfDefinition, UNSUPPORTED_SCORECARD_LANGUAGES } from "@/lib/scorecards/scorecards";
import { SCORECARD_LANGUAGES } from "@/lib/scorecards/translations";

const fonts = "node_modules/pdfmake/fonts/Roboto/";
pdfmake.addFonts({ Roboto: { normal: `${fonts}Roboto-Regular.ttf`, bold: `${fonts}Roboto-Medium.ttf`, italics: `${fonts}Roboto-Italic.ttf`, bolditalics: `${fonts}Roboto-MediumItalic.ttf` } });

async function pageCount(definition: unknown) {
  const buffer: Buffer = await pdfmake.createPdf(definition).getBuffer();
  return (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

/** Everything that makes a card taller at once. */
function worstCase(): StoredCompetition {
  const competition = structuredClone(demoCompetition("small"));
  competition.shortName = "Campeonato de España de Speedcubing Valencia 2026";
  competition.persons = competition.persons!.map((person, index) => index % 2 ? person : { ...person, name: "María de los Ángeles Fernández-Castellanos de la Torre (Мария Анхелес)" });
  for (const event of competition.events!) for (const round of event.rounds!) {
    round.timeLimit = { centiseconds: 60000, cumulativeRoundIds: ["333bf-r1", "444bf-r1", "555bf-r1"] };
    round.cutoff = { numberOfAttempts: 2, attemptResult: 6000 };
  }
  return competition;
}

const PER_PAGE: Record<PaperSize, number> = { a4: 4, letter: 4, a6: 1 };
const languages = SCORECARD_LANGUAGES.map(language => language.code).filter(code => !UNSUPPORTED_SCORECARD_LANGUAGES.includes(code));

describe("scorecards keep to their quarter of the page", () => {
  const competition = worstCase();
  const rounds = initialRounds(competition, 12, "fixed");
  const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS });

  // A card taller than its slot pushes the next one down, which shows up as extra pages.
  it.each((["a4", "letter", "a6"] as PaperSize[]).flatMap(paperSize => languages.map(language => [paperSize, language] as const)))("%s · %s", async (paperSize, language) => {
    const printing = { ...DEFAULT_PRINTING, paperSize, language, order: "natural" as const, scrambleCheckerFinalRounds: true, scrambleCheckerBlank: true };
    const source = { competition, assignments, rounds, stations: 12, zoneMode: "fixed" as const, printing };
    const cards = roundScorecards(source, ["333-r1"]);
    expect(await pageCount(scorecardsPdfDefinition(cards, null, paperSize))).toBe(cards.length / PER_PAGE[paperSize]);
    const blank = blankScorecards(source);
    expect(await pageCount(scorecardsPdfDefinition(blank, null, paperSize))).toBe(Math.ceil(blank.length / PER_PAGE[paperSize]));
  }, 30000);
});

describe("back pages and stages", () => {
  const competition = worstCase();
  const rooms = [{ id: 1, name: "Pabellón", color: "#d93636", stages: [{ id: 0, name: "Gipuzkoa-Donostia", color: "#d93636" }, { id: 1, name: "Bizkaia", color: "#2f9e44" }] }];
  const schedule: ProSchedule = { timeZone: "UTC", days: ["2026-02-21"], rooms, activities: [], blocks: [0, 1].map(stageId => ({ id: `b${stageId}`, activityCode: "333-r1", roomId: 1, stageId, start: "2026-02-21T10:00", end: "2026-02-21T11:00", groups: 2 })) };
  const slots = groupSlots(schedule);
  const rounds = withScheduledGroups(initialRounds(competition, 12, "fixed"), slots);
  const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots });

  it.each(["a4", "letter", "a6"] as PaperSize[])("%s: a back page per page, and the stage name fits the group box", async paperSize => {
    const printing = { ...DEFAULT_PRINTING, paperSize, order: "natural" as const };
    const source = { competition, assignments, rounds, stations: 12, zoneMode: "fixed" as const, printing, schedule, slots };
    const fronts = roundScorecards(source, ["333-r1"]);
    expect(JSON.stringify(fronts)).toContain("Bizkaia");
    expect(await pageCount(scorecardsPdfDefinition(fronts, null, paperSize))).toBe(fronts.length / PER_PAGE[paperSize]);
    const withBacks = roundScorecards({ ...source, printing: { ...printing, registrantOnBack: true } }, ["333-r1"]);
    expect(await pageCount(scorecardsPdfDefinition(withBacks, null, paperSize, true))).toBe(2 * fronts.length / PER_PAGE[paperSize]);
    expect(JSON.stringify(roundScorecards({ ...source, printing: { ...printing, stageInGroupCell: false } }, ["333-r1"]))).not.toContain("Bizkaia");
  }, 30000);
});

describe("fitText", () => {
  it("keeps short texts as they are", () => {
    expect(fitText("Ronda", 100, 9)).toEqual({ text: "Ronda", fontSize: 9 });
  });

  it("shrinks long texts and cuts them only below the minimum size", () => {
    const shrunk = fitText("Campeonato de España 2026", 200, 15, { bold: true, min: 9 });
    expect(shrunk.fontSize).toBeLessThan(15);
    expect(shrunk.text).toBe("Campeonato de España 2026");
    const cut = fitText("x".repeat(200), 100, 10, { min: 6 });
    expect(cut.fontSize).toBe(6);
    expect(cut.text.endsWith("...")).toBe(true);
  });
});

describe("featured competitors", () => {
  it("draws a star on their card without changing the layout", async () => {
    const competition = worstCase();
    const rounds = initialRounds(competition, 12, "fixed");
    const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS })
      .map((item, index) => item.roundId === "333-r1" && index % 3 === 0 ? { ...item, featured: true } : item);
    const printing = { ...DEFAULT_PRINTING, order: "natural" as const };
    const cards = roundScorecards({ competition, assignments, rounds, stations: 12, zoneMode: "fixed", printing }, ["333-r1"]);
    expect(JSON.stringify(cards)).toContain("<svg");
    expect(await pageCount(scorecardsPdfDefinition(cards, null, "a4"))).toBe(cards.length / PER_PAGE.a4);
  }, 30000);
});
