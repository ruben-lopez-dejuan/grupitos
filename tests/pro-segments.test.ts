import { describe, expect, it } from "vitest";
import { buildDemoCompetition } from "@/lib/demo-competition";
import { peopleFromWcif } from "@/lib/people";
import { everyone, normalizeProPeople } from "@/lib/pro/people";
import { matchesSegment, SEGMENT_TEMPLATES, segmentMembers, type Segment } from "@/lib/pro/segments";
import { initialRounds, personKey } from "@/lib/rounds";
import type { GeneratedAssignment } from "@/lib/assignments";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { validateRound } from "@/lib/validation";

const competition = buildDemoCompetition({ id: "Seg", name: "Seg", people: 40, events: ["333", "222"], newcomerShare: 0.2, seed: 11 });
const people = everyone(competition, normalizeProPeople({ volunteers: [{ key: "vol-1", name: "Volunteer" }] }));
const keys = people.map(personKey);
const pro = normalizeProPeople({ propertyKeys: ["team", "shift"], properties: { [keys[0]]: { team: "Data entry", shift: "2" }, [keys[1]]: { team: "Streaming", shift: "10" } }, volunteers: [{ key: "vol-1", name: "Volunteer" }] });
const settings = peopleFromWcif(competition);
const segment = (rules: Segment["rules"], match: Segment["match"] = "all", id = "x"): Segment => ({ id, name: id, match, rules });
const count = (value: Segment, segments: Segment[] = [value]) => segmentMembers(value, people, { people: settings, pro, segments }).length;

describe("segments", () => {
  it("matches roles, newcomers and volunteers, with NOT", () => {
    const organizers = settings.roles.organizer!.length;
    expect(count(segment([{ kind: "role", role: "organizer" }]))).toBe(organizers);
    expect(count(segment([{ kind: "role", role: "organizer", negate: true }]))).toBe(people.length - organizers);
    expect(count(segment([{ kind: "role", role: "volunteer" }]))).toBe(1);
    expect(count(segment([{ kind: "newcomer" }]))).toBe(people.filter(person => !person.wcaId).length);
  });

  it("compares property values as numbers when both sides are numeric", () => {
    expect(count(segment([{ kind: "property", key: "shift", op: "lt", value: "3" }]))).toBe(1);
    expect(count(segment([{ kind: "property", key: "team", op: "eq", value: "streaming" }]))).toBe(1);
    expect(count(segment([{ kind: "property", key: "team", op: "set" }]))).toBe(2);
    expect(count(segment([{ kind: "property", key: "team", op: "contains", value: "data" }]))).toBe(1);
  });

  it("reads personal bests below a time and registrations", () => {
    const fast = people.filter(person => (person.personalBests?.find(best => best.eventId === "333" && best.type === "average")?.best ?? Infinity) < 1500).length;
    expect(count(segment([{ kind: "pb", eventId: "333", type: "average", value: 1500 }]))).toBe(fast);
    expect(count(segment([{ kind: "registered", eventId: "222" }]))).toBe(people.filter(person => person.registration?.eventIds?.includes("222")).length);
  });

  it("combines rules with any, reuses segments and survives a loop", () => {
    const a = segment([{ kind: "role", role: "organizer" }], "all", "a");
    const b = segment([{ kind: "segment", id: "a" }, { kind: "role", role: "volunteer" }], "any", "b");
    expect(count(b, [a, b])).toBe(settings.roles.organizer!.length + 1);
    const loop = segment([{ kind: "segment", id: "loop" }], "all", "loop");
    expect(matchesSegment(loop, people[0], { people: settings, pro, segments: [loop] })).toBe(false);
    expect(count(segment([]))).toBe(people.length);
  });

  it("ships the CompScript templates", () => {
    const volunteers = SEGMENT_TEMPLATES.find(template => template.id === "volunteers")!;
    const members = segmentMembers({ id: "t", name: "t", ...volunteers.segment }, people, { people: settings, pro, segments: [] });
    expect(members.every(person => person.wcaId && !settings.roles.organizer!.includes(personKey(person)))).toBe(true);
  });
});

describe("job eligibility", () => {
  const rounds = initialRounds(competition, 8, "fixed");
  const base = { competition, rounds, stations: 8, zoneMode: "fixed" as const, people: settings, options: DEFAULT_OPTIONS };
  const holders = (assignments: GeneratedAssignment[], role: string) => new Set(assignments.filter(item => item.tasks.some(task => task.role === role)).map(item => item.personId));

  it("gives each job only to its segment, and the scrambler segment replaces the speed rule", () => {
    const judges = new Set(keys.slice(0, 20));
    const scramblers = new Set(keys.slice(30, 40));
    const assignments = generateAssignments({ ...base, eligible: { judge: judges, scrambler: scramblers } });
    expect([...holders(assignments, "judge")].every(key => judges.has(key))).toBe(true);
    expect([...holders(assignments, "scrambler")].every(key => scramblers.has(key))).toBe(true);
    expect(holders(assignments, "scrambler").size).toBeGreaterThan(0);
  });

  it("warns when someone outside the segment has the job", () => {
    const rows = generateAssignments(base).filter(item => item.roundId === "333-r1");
    const round = rounds.find(item => item.id === "333-r1")!;
    const rules = { groups: round.groups, scramblers: round.scramblers, runners: round.runners, stations: 8, fixedStations: true, checkJudges: true, checkDelegates: false, checkDataEntry: false, noNormalTasks: new Set<string>(), eligible: { judge: new Set<string>() } };
    const judging = rows.filter(item => item.tasks.some(task => task.role === "judge")).length;
    expect(validateRound("333-r1", rows, rules).filter(issue => issue.code === "not-eligible").length).toBeGreaterThanOrEqual(judging);
  });
});
