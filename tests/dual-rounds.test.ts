import { describe, expect, it } from "vitest";
import type { StoredCompetition } from "@/lib/competition-store";
import { demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { appliesToRound } from "@/lib/pro/assignment-sets";
import { expectedCompetitorsByRound, initialRounds, personKey, previousRoundResults, roundCompetitors, withRegistrationRounds } from "@/lib/rounds";

/** The small demo with 3x3 rounds 1 and 2 as dual rounds (as the WCA writes them) and a final from both. */
function withDualRounds(): StoredCompetition {
  const competition = structuredClone(demoCompetition("small"));
  const event = competition.events!.find(item => item.id === "333")!;
  const [first, second] = event.rounds!;
  const linked = ["333-r1", "333-r2"];
  for (const round of [first, second]) Object.assign(round, { advancementCondition: null, linkedRounds: linked, participationRuleset: { participationSource: { type: "registrations" } } });
  event.rounds!.push({ ...structuredClone(second), id: "333-r3", linkedRounds: null, participationRuleset: { participationSource: { type: "linkedRounds", roundIds: linked, resultCondition: { type: "ranking", value: 8 } } } });
  return competition;
}

describe("dual rounds", () => {
  const competition = withDualRounds();

  it("takes the second dual round's competitors from the registrations", () => {
    const first = roundCompetitors(competition, "333-r1");
    const second = roundCompetitors(competition, "333-r2");
    expect(second.known).toBe(true);
    expect(second.people.map(personKey)).toEqual(first.people.map(personKey));
    expect(roundCompetitors(competition, "333-r3").known).toBe(false);
    expect(expectedCompetitorsByRound(competition).get("333-r3")).toHaveLength(8);
  });

  it("enables both dual rounds from the start, shaped like first rounds", () => {
    const rounds = initialRounds(competition, 12, "mixed");
    const [first, second, final] = ["333-r1", "333-r2", "333-r3"].map(id => rounds.find(round => round.id === id)!);
    expect(second).toMatchObject({ enabled: true, competitorsKnown: true, fromRegistrations: true, competitors: first.competitors, groups: first.groups });
    expect(final).toMatchObject({ enabled: false, competitorsKnown: false });
    expect(final.fromRegistrations).toBeUndefined();
    expect(appliesToRound({ rounds: "first" }, second)).toBe(true);
    expect(appliesToRound({ rounds: "later" }, second)).toBe(false);
  });

  it("generates groups for both 3x3 rounds before the competition", () => {
    const rounds = initialRounds(competition, 12, "waiting");
    const output = generateAssignments({ competition, rounds, stations: 12, zoneMode: "waiting", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS });
    const registered = roundCompetitors(competition, "333-r1").people.length;
    for (const roundId of ["333-r1", "333-r2"]) expect(output.filter(item => item.roundId === roundId && item.inRound)).toHaveLength(registered);
    expect(output.some(item => item.roundId === "333-r3")).toBe(false);
  });

  it("opens the second round of drafts saved before the rounds were linked", () => {
    const plain = initialRounds(demoCompetition("small"), 12, "waiting");
    expect(plain.find(round => round.id === "333-r2")!.enabled).toBe(false);
    const opened = withRegistrationRounds(plain, competition, 12, "waiting").find(round => round.id === "333-r2")!;
    expect(opened).toMatchObject({ enabled: true, competitorsKnown: true, fromRegistrations: true });
    // And closes it again when the WCA unlinks them.
    const closed = withRegistrationRounds([opened], demoCompetition("small"), 12, "waiting")[0];
    expect(closed.competitorsKnown).toBe(false);
    expect(closed.fromRegistrations).toBeUndefined();
  });

  it("ranks the round after the pair by each person's better result", () => {
    const held = structuredClone(competition);
    const [first, second] = held.events!.find(item => item.id === "333")!.rounds!;
    const [a, b, c] = held.persons!.map(person => person.registrantId!);
    first.results = [{ personId: b, ranking: 1, best: 1100, average: 1300 }, { personId: a, ranking: 2, best: 1300, average: 1500 }, { personId: c, ranking: 3, best: 1400, average: 1600 }];
    second.results = [{ personId: a, ranking: 1, best: 1000, average: 1200 }, { personId: c, ranking: 2, best: 1200, average: 1300 }, { personId: b, ranking: 3, best: -1, average: -1 }];
    const ranking = previousRoundResults(held, "333-r3");
    expect(ranking.get(a)).toEqual({ ranking: 1, value: 1200 });
    // b and c share the best average of 13.00 and b has the better single.
    expect(ranking.get(b)).toEqual({ ranking: 2, value: 1300 });
    expect(ranking.get(c)).toEqual({ ranking: 3, value: 1300 });
  });
});
