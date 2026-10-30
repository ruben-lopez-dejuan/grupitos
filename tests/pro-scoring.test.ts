import { describe, expect, it } from "vitest";
import { duties, groupTotals } from "@/lib/assignments";
import { demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, importSchedule, withScheduledGroups } from "@/lib/pro/schedule";
import { criterionValues, DEFAULT_SCORING, matchingProfile, normalizeScoring, PROFILE_WEIGHTS, scoreBreakdown, type ScoringFacts } from "@/lib/pro/scoring";
import { solveGroupStaff } from "@/lib/pro/staff-ilp";
import { initialRounds, judgesNeeded, personKey } from "@/lib/rounds";
import { validateTimes } from "@/lib/validation";

const facts = (change: Partial<ScoringFacts> = {}): ScoringFacts => ({ load: 0, hoursToday: 0, sameJobStreak: 0, staffStreak: 20, competesRightAfter: false, competesInEvent: false, eliminated: false, canScramble: false, isStaff: false, wcaJob: false, isTrusted: false, speed: 0, preference: 0, youngerThan10: false, ...change });

describe("criteria", () => {
  it("turns facts into values like CompScript's scorers", () => {
    expect(criterionValues(facts({ sameJobStreak: 15 }), "judge").keepSameJob).toBe(0.75);
    expect(criterionValues(facts({ sameJobStreak: 90 }), "judge").keepSameJob).toBe(0);
    expect(criterionValues(facts({ staffStreak: 135 }), "judge").longStreak).toBe(0.5);
    expect(criterionValues(facts({ canScramble: true }), "judge").reserveScramblers).toBe(1);
    expect(criterionValues(facts({ canScramble: true }), "scrambler").reserveScramblers).toBe(0);
    expect(criterionValues(facts({ speed: 0.8, isTrusted: true }), "judge")).toMatchObject({ speed: 0, trusted: 0 });
  });

  it("explains a score as weighted contributions", () => {
    expect(scoreBreakdown(facts({ load: 3, competesRightAfter: true, competesInEvent: true }), "judge", PROFILE_WEIGHTS.amore)).toEqual({ load: -30, beforeCompeting: -50, competesInEvent: 50 });
  });

  it("recognises presets and reads saved weights", () => {
    expect(matchingProfile(PROFILE_WEIGHTS.amore)).toBe("amore");
    expect(matchingProfile({ ...PROFILE_WEIGHTS.amore, load: -11 })).toBeUndefined();
    expect(normalizeScoring({ enabled: true, weights: { load: -3, nonsense: 9 } })).toEqual({ enabled: true, weights: { ...DEFAULT_SCORING.weights, load: -3 } });
    expect(normalizeScoring(null)).toBeUndefined();
  });
});

describe("integer program for one group", () => {
  it("fills every seat it can, one job per person, with the best total", () => {
    const chosen = solveGroupStaff({ scrambler: 1, judge: 2 }, [
      { key: "a", job: "scrambler", score: 50 }, { key: "a", job: "judge", score: 40 },
      { key: "b", job: "scrambler", score: 45 }, { key: "b", job: "judge", score: 0 },
      { key: "c", job: "judge", score: 10 }, { key: "d", job: "judge", score: -20 },
    ]);
    // b scrambling with a and c judging (45 + 40 + 10 = 95) beats a scrambling with b and c judging (50 + 0 + 10 = 60).
    expect(chosen).toEqual([["a", "judge"], ["b", "scrambler"], ["c", "judge"]]);
  });

  it("still fills seats with negative scores rather than leaving them empty", () => {
    expect(solveGroupStaff({ runner: 1 }, [{ key: "x", job: "runner", score: -900 }])).toEqual([["x", "runner"]]);
    expect(solveGroupStaff({ runner: 2 }, [{ key: "x", job: "runner", score: 5 }])).toEqual([["x", "runner"]]);
  });
});

describe("weighted engine on a two-stage schedule", () => {
  const competition = demoCompetition("large");
  const schedule = importSchedule(competition, () => 8);
  const slots = groupSlots(schedule);
  const rounds = withScheduledGroups(initialRounds(competition, 14, "fixed"), slots);
  const run = () => generateAssignments({ competition, rounds, stations: 14, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots, scoring: { enabled: true, weights: PROFILE_WEIGHTS.balanced } });
  const started = Date.now();
  const assignments = run();
  const elapsed = Date.now() - started;

  it("staffs every group fully, without anyone in two places", () => {
    expect(validateTimes(assignments, slots)).toEqual([]);
    for (const round of rounds.filter(item => item.enabled && item.competitorsKnown)) {
      const rows = assignments.filter(item => item.roundId === round.id);
      for (const { counts } of groupTotals(rows, round.groups)) {
        if (!counts.competitor) continue;
        expect(counts.judge).toBe(judgesNeeded(counts.competitor, 14));
        expect(counts.scrambler).toBe(round.scramblers);
        expect(counts.runner).toBe(round.runners);
      }
    }
  });

  it("explains every duty with its score", () => {
    const withDuties = assignments.filter(item => duties(item).length);
    expect(withDuties.every(item => duties(item).every(duty => item.why?.some(why => why.group === duty.group && why.role === duty.role && typeof why.score === "number")))).toBe(true);
  });

  it("spreads the work and is deterministic", () => {
    const loads = new Map<string, number>();
    for (const item of assignments) loads.set(item.personId, (loads.get(item.personId) ?? 0) + duties(item).length);
    const values = [...loads.values()];
    expect(Math.max(...values)).toBeLessThanOrEqual(Math.ceil(values.reduce((a, b) => a + b, 0) / values.length) * 3);
    expect(run()).toEqual(assignments);
  });

  it("gives scrambling to people competing in the event, in turns", () => {
    const own = generateAssignments({ competition, rounds, stations: 14, zoneMode: "fixed", people: peopleFromWcif(competition), options: { ...DEFAULT_OPTIONS, tasksForOwnEventsOnly: true }, slots, scoring: { enabled: true, weights: PROFILE_WEIGHTS.balanced } });
    const eventsOf = new Map((competition.persons ?? []).map(person => [personKey(person), person.registration?.eventIds ?? []]));
    const scrambles = own.flatMap(item => item.tasks.filter(task => task.role === "scrambler").map(() => item));
    expect(scrambles.length).toBeGreaterThan(0);
    expect(scrambles.filter(item => !eventsOf.get(item.personId)?.includes(item.eventId))).toEqual([]);
    const times = new Map<string, number>();
    for (const item of scrambles) times.set(item.personId, (times.get(item.personId) ?? 0) + 1);
    expect(times.size).toBeGreaterThan(scrambles.length / 3);
  });

  it("keeps the order of rounds and runs in reasonable time", () => {
    expect([...new Set(assignments.map(item => item.roundId))]).toEqual(rounds.filter(item => item.enabled && item.competitorsKnown).map(item => item.id));
    expect(elapsed).toBeLessThan(15000);
  });
});

describe("criteria added later", () => {
  it("keep a saved preset a preset", () => {
    const { wcaJob: _wcaJob, ...savedAmore } = PROFILE_WEIGHTS.amore;
    expect(matchingProfile(normalizeScoring({ enabled: true, weights: savedAmore })!.weights)).toBe("amore");
  });
});
