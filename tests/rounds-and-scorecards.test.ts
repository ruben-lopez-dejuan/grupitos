import { describe, expect, it } from "vitest";
import { demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { expectedCompetitorsByRound, initialRounds, suggestGroups, usesFixedStations } from "@/lib/rounds";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import { blankScorecards, centisecondsToClockFormat, pdfName, roundScorecards } from "@/lib/scorecards/scorecards";
import { SCORECARD_LANGUAGES, translation } from "@/lib/scorecards/translations";

describe("zone modes", () => {
  it("uses fixed stations for small rounds whatever the mode", () => {
    expect(usesFixedStations(1, 12, 12, "waiting")).toBe(true);
    expect(usesFixedStations(1, 13, 12, "waiting")).toBe(false);
  });

  it("mixed: waiting room in first rounds, stations afterwards", () => {
    expect(usesFixedStations(1, 100, 12, "mixed")).toBe(false);
    expect(usesFixedStations(2, 100, 12, "mixed")).toBe(true);
  });

  it("suggests groups like Groupifier, with at least two in first rounds", () => {
    expect(suggestGroups(100, 12, false, 1)).toBe(Math.round(100 / (12 * 1.7) + 0.4));
    expect(suggestGroups(10, 12, true, 1)).toBe(2);
    expect(suggestGroups(10, 12, true, 2)).toBe(1);
    expect(suggestGroups(30, 12, true, 2)).toBe(3);
  });
});

describe("later rounds", () => {
  const competition = demoCompetition("small");

  it("estimates advancing competitors from the advancement condition", () => {
    const expected = expectedCompetitorsByRound(competition);
    const first = expected.get("333-r1")!.length;
    expect(expected.get("333-r2")).toHaveLength(Math.floor(first * 0.75));
  });

  it("plans later rounds without enabling them", () => {
    const later = initialRounds(competition, 12, "waiting").filter(round => round.roundNumber === 2);
    expect(later.every(round => !round.enabled && !round.competitorsKnown && round.competitors > 0)).toBe(true);
  });
});

describe("scorecards (Groupifier port)", () => {
  const competition = demoCompetition("small");
  const rounds = initialRounds(competition, 12, "waiting");
  const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "waiting", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS });
  const source = { competition, assignments, rounds, stations: 12, zoneMode: "waiting" as const, printing: DEFAULT_PRINTING };

  it("makes one card per competitor, padded to full pages", () => {
    const competitors = assignments.filter(item => item.roundId === "333-r1" && item.inRound).length;
    const cards = roundScorecards(source, ["333-r1"]);
    expect(cards.length % 4).toBe(0);
    expect(cards.filter(card => Array.isArray(card)).length).toBe(competitors);
  });

  it("makes nameless cards for planned later rounds", () => {
    const planned = rounds.find(round => round.id === "333-r2")!;
    const cards = roundScorecards(source, ["333-r2"]).filter(card => Array.isArray(card));
    expect(cards).toHaveLength(planned.competitors);
  });

  it("adds cover sheets when asked", () => {
    const plain = roundScorecards(source, ["333-r1"]).filter(card => Array.isArray(card)).length;
    const covered = roundScorecards({ ...source, printing: { ...DEFAULT_PRINTING, coverSheets: true, order: "natural" } }, ["333-r1"]).filter(card => Array.isArray(card)).length;
    expect(covered - plain).toBe(rounds.find(round => round.id === "333-r1")!.groups);
  });

  it("prints a page of blank cards per attempt count", () => {
    expect(blankScorecards(source)).toHaveLength(4);
  });

  it("formats times and names like Groupifier", () => {
    expect(centisecondsToClockFormat(6000)).toBe("1:00.00");
    expect(centisecondsToClockFormat(1234)).toBe("12.34");
    expect(pdfName("Juan Pérez (Хуан)")).toEqual(["Juan Pérez", " (", "Хуан", ")"]);
    expect(pdfName("Wang Wei (王伟)")).toBe("Wang Wei");
    expect(pdfName("Juan Pérez (Хуан)", { swapLatinWithLocalNames: true, short: true })).toBe("Хуан");
  });

  it("ships Groupifier's languages", () => {
    expect(SCORECARD_LANGUAGES.length).toBeGreaterThanOrEqual(20);
    expect(translation("es").round).toBe("Ronda");
  });
});
