import { describe, expect, it } from "vitest";
import { groupTotals, type GeneratedAssignment } from "@/lib/assignments";
import { buildDemoCompetition, demoCompetition } from "@/lib/demo-competition";
import { generateAssignments } from "@/lib/group-generator";
import { acceptedPeople, initialRounds, judgesNeeded, personKey, type FlowMode, type RoundConfig } from "@/lib/rounds";
import { validateRound } from "@/lib/validation";
import type { StoredCompetition } from "@/lib/competition-store";

function setup(competition: StoredCompetition, stations: number, flowMode: FlowMode) {
  const rounds = initialRounds(competition, stations, flowMode, "scrambler-safe");
  const assignments = generateAssignments({ competition, rounds, stations, fixedStations: flowMode === "fixed", trustedIds: [] });
  return { rounds, assignments };
}

function byRound(assignments: GeneratedAssignment[], roundId: string) {
  return assignments.filter(item => item.roundId === roundId);
}

function rulesFor(round: RoundConfig, stations: number, flowMode: FlowMode) {
  return { groups: round.groups, scramblers: round.scramblers, runners: round.runners, stations, fixedStations: flowMode === "fixed", checkJudges: true, avoidBeforeOwnGroup: true };
}

const scenarios = [
  { name: "open pequeño, sala de espera", competition: demoCompetition("small"), stations: 8, flowMode: "waiting" as const },
  { name: "open pequeño, puestos fijos", competition: demoCompetition("small"), stations: 12, flowMode: "fixed" as const },
  { name: "campeonato grande, puestos fijos", competition: demoCompetition("large"), stations: 16, flowMode: "fixed" as const },
  { name: "campeonato grande, sala de espera", competition: demoCompetition("large"), stations: 20, flowMode: "waiting" as const },
];

describe.each(scenarios)("generateAssignments — $name", ({ competition, stations, flowMode }) => {
  const { rounds, assignments } = setup(competition, stations, flowMode);
  const enabled = rounds.filter(round => round.enabled);

  it("only generates enabled rounds", () => {
    expect(new Set(assignments.map(item => item.roundId))).toEqual(new Set(enabled.map(round => round.id)));
  });

  it("gives every registered competitor exactly one group per round", () => {
    for (const round of enabled) {
      const registered = acceptedPeople(competition).filter(person => person.registration?.eventIds?.includes(round.eventId)).map(personKey).sort();
      const rows = byRound(assignments, round.id);
      expect(rows.map(item => item.personId).sort()).toEqual(registered);
      for (const item of rows) expect(item.group).toBeGreaterThanOrEqual(1);
      for (const item of rows) expect(item.group).toBeLessThanOrEqual(round.groups);
    }
  });

  it("keeps group sizes within one person of each other", () => {
    for (const round of enabled) {
      const sizes = groupTotals(byRound(assignments, round.id), round.groups).map(total => total.competitors);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it("never breaks a hard rule", () => {
    for (const round of enabled) {
      const errors = validateRound(round.id, byRound(assignments, round.id), rulesFor(round, stations, flowMode)).filter(issue => issue.severity === "error");
      expect(errors).toEqual([]);
    }
  });

  it("staffs every group fully, or uses everyone available when it cannot", () => {
    for (const round of enabled) {
      const rows = byRound(assignments, round.id);
      for (const totals of groupTotals(rows, round.groups)) {
        const needed = round.scramblers + judgesNeeded(totals.competitors, stations) + round.runners;
        const available = rows.filter(item => item.group !== totals.group).length;
        if (available >= needed) {
          expect(totals.scramblers).toBe(round.scramblers);
          expect(totals.judges).toBe(judgesNeeded(totals.competitors, stations));
          expect(totals.runners).toBe(round.runners);
        } else {
          expect(totals.scramblers + totals.judges + totals.runners).toBe(available);
        }
      }
    }
  });

  it("spreads duties before giving anyone a second one", () => {
    for (const round of enabled) {
      const loads = byRound(assignments, round.id).map(item => item.duties.length);
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    expect(setup(competition, stations, flowMode).assignments).toEqual(assignments);
  });
});

describe("generateAssignments — reglas concretas", () => {
  const competition = buildDemoCompetition({ id: "Test", name: "Test", people: 60, events: ["333"], seed: 7 });
  const round: RoundConfig = { id: "333-r1", eventId: "333", label: "", roundNumber: 1, competitors: 60, groups: 4, scramblers: 2, runners: 1, enabled: true };

  it("prioritises trusted people as scramblers, even if slower", () => {
    const slowest = [...acceptedPeople(competition)].filter(person => person.personalBests?.length).sort((a, b) => b.personalBests![0].best - a.personalBests![0].best)[0];
    const result = generateAssignments({ competition, rounds: [round], stations: 10, fixedStations: false, trustedIds: [personKey(slowest)] });
    const row = result.find(item => item.personId === personKey(slowest))!;
    expect(row.duties.some(duty => duty.role === "scrambler")).toBe(true);
  });

  it("prefers scramblers with official results", () => {
    const result = generateAssignments({ competition, rounds: [round], stations: 10, fixedStations: false, trustedIds: [] });
    const scramblers = result.filter(item => item.duties.some(duty => duty.role === "scrambler"));
    expect(scramblers.every(item => item.seedResult !== undefined)).toBe(true);
  });

  it("works right before competing less often when the preference is on", () => {
    const count = (avoidBeforeOwnGroup: boolean) => generateAssignments({ competition, rounds: [round], stations: 10, fixedStations: false, trustedIds: [], avoidBeforeOwnGroup })
      .flatMap(item => item.duties.filter(duty => duty.group === item.group - 1)).length;
    expect(count(true)).toBeLessThan(count(false));
  });

  it("only assigns scramblers when judges are not requested", () => {
    const result = generateAssignments({ competition, rounds: [round], stations: 10, fixedStations: false, trustedIds: [], assignJudges: false });
    const roles = new Set(result.flatMap(item => item.duties.map(duty => duty.role)));
    expect([...roles]).toEqual(["scrambler"]);
  });

  it("leaves staff missing rather than inventing it in a single-group round", () => {
    const single = { ...round, groups: 1 };
    const result = generateAssignments({ competition, rounds: [single], stations: 10, fixedStations: false, trustedIds: [] });
    expect(result.every(item => item.duties.length === 0)).toBe(true);
    const issues = validateRound(single.id, result, { groups: 1, scramblers: 2, runners: 1, stations: 10, fixedStations: false, checkJudges: true, avoidBeforeOwnGroup: true });
    expect(issues.map(issue => issue.code)).toEqual(["missing-scramblers", "missing-judges", "missing-runners"]);
  });

  it("does not hand out stations beyond the available ones", () => {
    const crowded = { ...round, groups: 2 };
    const result = generateAssignments({ competition, rounds: [crowded], stations: 20, fixedStations: true, trustedIds: [] });
    expect(Math.max(...result.map(item => item.station ?? 0))).toBeLessThanOrEqual(20);
    expect(result.filter(item => item.station === undefined)).toHaveLength(20);
  });
});
