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
    const perEvent = (set: Set<string>) => new Map(["333", "222"].map(eventId => [eventId, set]));
    const assignments = generateAssignments({ ...base, eligible: { judge: perEvent(judges), scrambler: perEvent(scramblers) } });
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

describe("per-event scrambling limits (CanScramble)", () => {
  const rule = { kind: "roundPb" as const, limits: { "333": 1500, "222": 500 }, mapping: { "333oh": "333" } };
  const canScramble = segment([{ kind: "roundRegistered" }, rule]);
  const average = (person: (typeof people)[number], eventId: string) => person.personalBests?.find(best => best.eventId === eventId && best.type === "average")?.best ?? Infinity;

  it("uses the round's event, its mapping and its limit", () => {
    const inEvent = (eventId: string) => segmentMembers(canScramble, people, { people: settings, pro, segments: [canScramble], eventId });
    expect(inEvent("333").every(person => average(person, "333") < 1500 && person.registration?.eventIds?.includes("333"))).toBe(true);
    expect(inEvent("333").length).toBe(people.filter(person => average(person, "333") < 1500 && person.registration?.eventIds?.includes("333")).length);
    expect(inEvent("222").every(person => average(person, "222") < 500)).toBe(true);
    // OH maps to 3x3 results; an event without a limit takes nobody.
    const oh = segmentMembers(segment([rule]), people, { people: settings, pro, segments: [], eventId: "333oh" });
    expect(oh.length).toBe(people.filter(person => average(person, "333") < 1500).length);
    expect(segmentMembers(segment([rule]), people, { people: settings, pro, segments: [], eventId: "pyram" })).toEqual([]);
  });

  it("counts people who meet it in any event when there is no round", () => {
    const any = segmentMembers(segment([rule]), people, { people: settings, pro, segments: [] }).length;
    expect(any).toBe(people.filter(person => average(person, "333") < 1500 || average(person, "222") < 500).length);
  });
});
