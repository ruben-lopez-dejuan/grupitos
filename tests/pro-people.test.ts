import { describe, expect, it } from "vitest";
import type { GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import { buildDemoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { nonCompetingStaff, peopleFromWcif } from "@/lib/people";
import { applyTeamRoles, everyone, importPersonProperties, newVolunteerKey, normalizeProPeople, PERSON_EXTENSION_ID, propertyValues, suggestTeamRole, unavailableWindows, volunteerPerson } from "@/lib/pro/people";
import { groupSlots, overlaps, withScheduledGroups, type ProSchedule } from "@/lib/pro/schedule";
import { initialRounds, personKey } from "@/lib/rounds";
import { validateAvailability } from "@/lib/validation";

const rooms = [{ id: 1, name: "Sala", color: "#2563eb", stages: [] }];
const day = (time: string) => `2026-02-21T${time}`;

function competitionWithProperties(): StoredCompetition {
  const source = buildDemoCompetition({ id: "Props", name: "Props", people: 30, events: ["333"], newcomerShare: 0, seed: 3 });
  return {
    ...source,
    persons: source.persons?.map((person, index) => index === 0
      ? { ...person, extensions: [{ id: PERSON_EXTENSION_ID, data: { properties: { team: "Data entry", "weight-judge": 0, nested: { ignored: true } } } }] }
      : index === 1 ? { ...person, extensions: [{ id: PERSON_EXTENSION_ID, data: { properties: { team: "Streaming" } } }] } : person),
  };
}

describe("PRO people", () => {
  it("imports natshelper person properties as text", () => {
    const competition = competitionWithProperties();
    const imported = importPersonProperties(competition);
    expect(imported.propertyKeys).toEqual(["team", "weight-judge"]);
    const [first, second] = competition.persons!;
    expect(imported.properties[personKey(first)]).toEqual({ team: "Data entry", "weight-judge": "0" });
    expect(imported.properties[personKey(second)]).toEqual({ team: "Streaming" });
  });

  it("turns volunteers into accepted people who do not compete", () => {
    const competition = competitionWithProperties();
    const volunteers = [{ key: "vol-1", name: "Ana Voluntaria" }, { key: "vol-2", name: "Luis", wcaId: "2015LUIS01" }];
    expect(newVolunteerKey(volunteers)).toBe("vol-3");
    const person = volunteerPerson(volunteers[1]);
    expect(personKey(person)).toBe("vol-2");
    expect(person.registration).toEqual({ status: "accepted", isCompeting: false, eventIds: [] });
    expect(everyone(competition, normalizeProPeople({ volunteers }))).toHaveLength(32);
  });

  it("drops anything that is not a people setup when reading a draft", () => {
    expect(normalizeProPeople("nonsense")).toEqual({ propertyKeys: [], properties: {}, volunteers: [], unavailable: [] });
  });

  it("resolves time ranges and \"while X competes\"", () => {
    const windows = unavailableWindows([
      { id: "u1", personKey: "a", start: day("10:00"), end: day("11:00") },
      { id: "u2", personKey: "a", whileCompeting: "kid" },
      { id: "u3", personKey: "b", start: day("12:00"), end: day("11:00") },
    ], key => key === "kid" ? [{ start: day("15:00"), end: day("15:30") }] : []);
    expect(windows.get("a")).toEqual([{ start: day("10:00"), end: day("11:00") }, { start: day("15:00"), end: day("15:30") }]);
    expect(windows.has("b")).toBe(false);
  });
});

describe("generator with PRO people", () => {
  const competition = buildDemoCompetition({ id: "Gen", name: "Gen", people: 24, events: ["333"], newcomerShare: 0, seed: 9 });
  const schedule: ProSchedule = { timeZone: "UTC", days: ["2026-02-21"], rooms, activities: [], blocks: [{ id: "a", activityCode: "333-r1", roomId: 1, start: day("10:00"), end: day("11:00"), groups: 3 }] };
  const slots = groupSlots(schedule);
  const rounds = withScheduledGroups(initialRounds(competition, 8, "fixed"), slots);
  const people = peopleFromWcif(competition);

  it("gives volunteers staff tasks but never a competitor group", () => {
    const volunteers = [1, 2, 3, 4].map(index => volunteerPerson({ key: `vol-${index}`, name: `Volunteer ${index}` }));
    const assignments = generateAssignments({ competition, rounds, stations: 8, zoneMode: "fixed", people, options: DEFAULT_OPTIONS, slots, extraPeople: volunteers });
    const rows = assignments.filter(item => item.personId.startsWith("vol-"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(item => !item.inRound && item.tasks.every(task => task.role !== "competitor"))).toBe(true);
    // "Why this person?": every duty explains itself, and volunteers say they count as staff.
    expect(rows.every(item => item.tasks.every(task => item.why?.some(why => why.group === task.group && why.role === task.role && why.candidates > 0 && why.reasons.includes("volunteer"))))).toBe(true);
  });

  it("gives no task to someone unavailable, also while the person they accompany competes", () => {
    const [parent, kid, other] = competition.persons!.map(personKey);
    const unavailable = [{ id: "u1", personKey: parent, whileCompeting: kid }, { id: "u2", personKey: other, start: day("10:00"), end: day("11:00") }];
    const assignments = generateAssignments({ competition, rounds, stations: 8, zoneMode: "fixed", people, options: DEFAULT_OPTIONS, slots, unavailable });
    const windowOf = (group: number) => slots.get("333-r1")!.find(slot => slot.group === group)!.windows[0];
    const kidGroup = assignments.find(item => item.personId === kid)!.tasks.find(task => task.role === "competitor")!.group;
    const parentDuties = assignments.find(item => item.personId === parent)?.tasks.filter(task => task.role !== "competitor") ?? [];
    expect(parentDuties.every(task => !overlaps(windowOf(task.group), windowOf(kidGroup)))).toBe(true);
    expect(assignments.find(item => item.personId === other)?.tasks.filter(task => task.role !== "competitor") ?? []).toEqual([]);
  });
});

describe("availability check", () => {
  const schedule: ProSchedule = { timeZone: "UTC", days: ["2026-02-21"], rooms, activities: [], blocks: [{ id: "a", activityCode: "333-r1", roomId: 1, start: day("10:00"), end: day("11:00"), groups: 2 }] };
  const slots = groupSlots(schedule);
  const row = (personId: string, tasks: GeneratedAssignment["tasks"]): GeneratedAssignment => ({ id: `333-r1:${personId}`, roundId: "333-r1", eventId: "333", personId, name: personId, inRound: true, tasks });

  it("warns about tasks during a time range or while the accompanied person competes", () => {
    const assignments = [row("ana", [{ group: 1, role: "competitor" }, { group: 2, role: "judge" }]), row("kid", [{ group: 2, role: "competitor" }]), row("dad", [{ group: 1, role: "competitor" }, { group: 2, role: "scrambler" }])];
    const issues = validateAvailability(assignments, slots, [{ id: "u1", personKey: "ana", start: day("10:30"), end: day("12:00") }, { id: "u2", personKey: "dad", whileCompeting: "kid" }]);
    expect(issues.map(issue => [issue.code, issue.severity, issue.params.name, issue.group])).toEqual([["unavailable", "warning", "ana", 2], ["unavailable", "warning", "dad", 2]]);
  });
});

describe("teams and non-competing staff", () => {
  it("suggests a role for the national championship's teams", () => {
    const suggested = Object.fromEntries(["Voluntario normal", "Data entry", "Registro / Stand AES", "Streaming", "Médico", "Control de Accesos", "Side room", "Delegado", "Organizador", "Aceptado SIN categorizar", "Otro"].map(team => [team, suggestTeamRole(team)]));
    expect(suggested).toEqual({
      "Voluntario normal": "staff", "Data entry": "dataentry", "Registro / Stand AES": "notasks", Streaming: "notasks", "Médico": "notasks", "Control de Accesos": "notasks",
      "Side room": "none", Delegado: "none", Organizador: "none", "Aceptado SIN categorizar": "none", Otro: "none",
    });
  });

  it("adds people to role lists by team, keeping who was there", () => {
    const pro = normalizeProPeople({ propertyKeys: ["team"], properties: { a: { team: "Voluntario normal" }, b: { team: "Streaming" }, c: { team: "Otro" }, d: { team: "Voluntario normal" } } });
    const settings = { roles: { staff: ["d", "z"] }, trustedIds: [], delegateDutyIds: [] };
    const result = applyTeamRoles(settings, pro, { property: "team", map: { "Voluntario normal": "staff", Streaming: "notasks", Otro: "none" } });
    expect(result.settings.roles).toEqual({ staff: ["d", "z", "a"], notasks: ["b"] });
    expect(result.added).toBe(2);
    expect(propertyValues(pro, "team")).toEqual([["Voluntario normal", 2], ["Otro", 1], ["Streaming", 1]]);
  });

  it("brings in organizers without a registration as non-competing people", () => {
    const source = buildDemoCompetition({ id: "Org", name: "Org", people: 10, events: ["333"], newcomerShare: 0, seed: 2 });
    const competition: StoredCompetition = { ...source, persons: [...source.persons!, { registrantId: null, wcaUserId: 9999, name: "Organizadora Sin Inscripción", wcaId: "2010ORGA01", roles: ["organizer"] }] };
    const staffOnly = nonCompetingStaff(competition);
    expect(staffOnly.map(person => [person.name, person.registration?.isCompeting])).toEqual([["Organizadora Sin Inscripción", false]]);
    expect(peopleFromWcif(competition).roles.organizer).toContain("2010ORGA01");
    expect(everyone(competition)).toHaveLength(11);
  });

  it("gives no normal tasks to people without normal tasks", () => {
    const competition = buildDemoCompetition({ id: "NoTasks", name: "NoTasks", people: 30, events: ["333"], newcomerShare: 0, seed: 4 });
    const people = peopleFromWcif(competition);
    const quiet = competition.persons!.slice(0, 8).map(personKey);
    const assignments = generateAssignments({ competition, rounds: initialRounds(competition, 8, "fixed"), stations: 8, zoneMode: "fixed", people: { ...people, roles: { ...people.roles, notasks: quiet } }, options: DEFAULT_OPTIONS });
    expect(assignments.filter(item => quiet.includes(item.personId)).every(item => item.tasks.every(task => task.role === "competitor"))).toBe(true);
  });
});
