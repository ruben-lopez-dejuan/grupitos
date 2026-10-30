import { describe, expect, it } from "vitest";
import type { WcifExtension } from "@/lib/competition-store";
import { demoCompetition } from "@/lib/demo-competition";
import { parseDraft, type WorkspaceSettings } from "@/lib/draft";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, importSchedule, withScheduledGroups } from "@/lib/pro/schedule";
import { initialRounds } from "@/lib/rounds";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import { groupsFromWcif } from "@/lib/wcif-groups";
import { buildPatch, changedRounds, checkPublished, publicSettings, readSettings, settingsExtension, SETTINGS_EXTENSION_ID, withPrivateSettings } from "@/lib/wca-sync";

describe("publishing to the WCA", () => {
  const competition = { ...demoCompetition("large"), formatVersion: "2.2", extensions: [{ id: "groupifier.CompetitionConfig", specUrl: "https://groupifier.jonatanklosko.com/wcif-extensions/CompetitionConfig.json", data: { scorecardPaperSize: "a4" } }] };
  const base = initialRounds(competition, 12, "fixed");
  const schedule = importSchedule(competition, id => base.find(round => round.id === id)?.groups ?? 1);
  const slots = groupSlots(schedule);
  const rounds = withScheduledGroups(base, slots).filter(round => round.enabled);
  const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots });
  const settings: WorkspaceSettings = { stations: 12, zoneMode: "fixed", rounds: base, options: DEFAULT_OPTIONS, people: peopleFromWcif(competition), printing: DEFAULT_PRINTING, pro: { enabled: true, schedule } };
  const saved = { settings, generatedWith: "signature", savedAt: "2026-10-24T18:00:00.000Z", savedBy: "Rubén" };

  it("keeps the settings compressed in a valid WCA extension and reads them back", async () => {
    const extension = await settingsExtension(saved);
    // The WCA accepts dot-separated word ids and needs a spec URL; data must be an object.
    expect(extension.id).toMatch(/^\w+(\.\w+)*$/);
    expect(extension.specUrl).toMatch(/^https:\/\//);
    expect(JSON.stringify(extension.data).length).toBeLessThan(JSON.stringify(settings).length / 3);
    const read = await readSettings({ ...competition, extensions: [extension] });
    // The generation signature holds personal data, so it stays at home.
    expect(read).toEqual({ ...saved, generatedWith: undefined, settings: parseDraft(JSON.stringify({ version: 3, settings: publicSettings(settings), assignments: [] }))!.settings });
    expect(await readSettings(competition)).toBeUndefined();
  });

  it("sends groups, assignments and every competition extension, never events, roles or registrations", async () => {
    const extension = await settingsExtension(saved);
    const { patch, summary } = buildPatch({ fresh: competition, assignments, rounds, slots, schedule, settings: extension });
    expect(Object.keys(patch).sort()).toEqual(["extensions", "formatVersion", "id", "persons", "schedule"]);
    expect(patch.formatVersion).toBe("2.2");
    // The WCA replaces the whole list: Groupifier's configuration goes back with the settings.
    expect(patch.extensions.map(item => item.id)).toEqual(["groupifier.CompetitionConfig", SETTINGS_EXTENSION_ID]);
    expect(patch.persons!.every(person => Object.keys(person).sort().join() === "assignments,extensions,wcaUserId")).toBe(true);
    expect(summary.added).toBe(summary.assignments);
    expect(summary.changedPeople).toBe(summary.people);
    // Every extension the WCA receives has a spec URL (it refuses them otherwise).
    const extensions: WcifExtension[] = [];
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(visit);
      const own = node as { extensions?: WcifExtension[] };
      if (Array.isArray(own.extensions)) extensions.push(...own.extensions);
      Object.values(node).forEach(visit);
    };
    visit(patch);
    expect(extensions.length).toBeGreaterThan(0);
    expect([...new Set(extensions.filter(item => !item.specUrl?.startsWith("https://")).map(item => item.id))]).toEqual([]);
  });

  it("can save the settings alone", async () => {
    const { patch, summary } = buildPatch({ fresh: competition, assignments: [], rounds, slots, schedule, settings: await settingsExtension(saved) });
    expect(Object.keys(patch).sort()).toEqual(["extensions", "formatVersion", "id"]);
    expect(summary.withGroups).toBe(false);
  });

  it("checks what the WCA kept after publishing", async () => {
    const { patch } = buildPatch({ fresh: competition, assignments, rounds, slots, schedule, settings: await settingsExtension(saved) });
    const reread = { ...competition, schedule: patch.schedule, extensions: patch.extensions, persons: competition.persons!.map(person => ({ ...person, assignments: patch.persons!.find(item => item.wcaUserId === person.wcaUserId)?.assignments ?? [] })) };
    const check = checkPublished(patch, reread);
    expect(check).toMatchObject({ missing: 0, settingsSaved: true });
    expect(check.groups).toBeGreaterThan(0);
    const lost = { ...reread, persons: reread.persons.map((person, index) => index === 0 ? { ...person, assignments: [] } : person), extensions: [] };
    expect(checkPublished(patch, lost).missing).toBe(patch.persons![0].assignments!.length);
    expect(checkPublished(patch, lost).settingsSaved).toBe(false);
  });

  it("publishes a volunteer linked to a WCA account as non-competing staff, and reads their tasks back", async () => {
    const volunteer = { key: "vol-1", name: "Ana Sin Marca", wcaUserId: 987654 };
    const people = { propertyKeys: ["team"], properties: { "vol-1": { team: "Voluntario normal" } }, volunteers: [volunteer], unavailable: [] };
    const round = rounds[0];
    const row = { id: `${round.id}:vol-1`, roundId: round.id, eventId: round.eventId, personId: "vol-1", name: volunteer.name, inRound: false, tasks: [{ group: 1, role: "judge" as const }] };
    const { patch, summary } = buildPatch({ fresh: competition, assignments: [...assignments, row], rounds, slots, schedule, people, settings: await settingsExtension(saved) });
    expect(summary.newStaff).toBe(1);
    expect(summary.skipped).toEqual([]);
    const sent = patch.persons!.find(person => person.wcaUserId === 987654)!;
    expect(sent.registration).toEqual({ isCompeting: false });
    expect(sent.assignments).toHaveLength(1);
    // Their properties are personal: never sent.
    expect(sent.extensions.find(item => item.id === "org.cubingusa.natshelper.v1.Person")).toBeUndefined();
    // Only new people carry a registration: the WCA would otherwise touch existing ones.
    expect(patch.persons!.filter(person => person.registration)).toHaveLength(1);
    // Once the WCA has them, their tasks come back to the volunteer, not to a new person.
    const reread = { ...competition, schedule: patch.schedule, persons: [...competition.persons!, { name: volunteer.name, wcaUserId: 987654, registrantId: 999, registration: { status: "accepted", isCompeting: false, eventIds: [] }, roles: [], assignments: sent.assignments }] };
    const imported = groupsFromWcif(reread, slots, new Map([[987654, "vol-1"]]));
    expect(imported.assignments.find(item => item.personId === "vol-1")?.tasks).toEqual([{ group: 1, role: "judge" }]);
    const again = buildPatch({ fresh: reread, assignments: [...assignments, row], rounds, slots, schedule, people, settings: await settingsExtension(saved) });
    expect(again.summary.newStaff).toBe(0);
    expect(again.patch.persons!.some(person => person.registration)).toBe(false);
  });

  it("registers staff listed without a registration when they get tasks, so the WCA keeps them", async () => {
    const organizer = { name: "Olga Organiza", wcaUserId: 555001, wcaId: null, registrantId: null, roles: ["organizer"], assignments: [], extensions: [] };
    const delegate = { ...organizer, name: "Dani Delega", wcaUserId: 555002, roles: ["delegate"] };
    const fresh = { ...competition, persons: [...competition.persons!, organizer, delegate] };
    const round = rounds[0];
    const row = { id: `${round.id}:${organizer.name}`, roundId: round.id, eventId: round.eventId, personId: organizer.name, name: organizer.name, inRound: false, tasks: [{ group: 1, role: "judge" as const }] };
    const { patch, summary } = buildPatch({ fresh, assignments: [...assignments, row], rounds, slots, schedule, settings: await settingsExtension(saved) });
    expect(summary.newStaff).toBe(1);
    expect(patch.persons!.find(person => person.wcaUserId === 555001)).toMatchObject({ registration: { isCompeting: false } });
    expect(patch.persons!.find(person => person.wcaUserId === 555001)!.assignments).toHaveLength(1);
    // Without tasks nobody is registered.
    expect(patch.persons!.find(person => person.wcaUserId === 555002)?.registration).toBeUndefined();
  });

  it("publishes nothing personal, and loading from the WCA keeps this browser's personal data", async () => {
    const [first, second] = competition.persons!;
    const key = String(first.registrantId);
    const people = {
      propertyKeys: ["phone", "team"],
      properties: { [key]: { phone: "600123123", team: "Mezcladores" } },
      volunteers: [{ key: "vol-1", name: "Ana Sin Marca", wcaId: "2020ANAS01" }],
      unavailable: [{ id: "u1", personKey: key, start: "2026-10-24T10:00", end: "2026-10-24T12:00", note: "Médico" }],
    };
    const segments = [{ id: "family", name: "Familia", match: "all" as const, rules: [{ kind: "people" as const, keys: [key] }, { kind: "newcomer" as const }] }];
    const leaving = [{ id: "u9", personKey: key, start: "2026-10-24T17:00", end: "2026-10-24T20:00", note: "Se va pronto" }];
    const personal: WorkspaceSettings = { ...settings, people: { ...settings.people, roles: { ...settings.people.roles, notasks: [key], avoid: [key], staff: [key] }, unavailable: leaving }, pro: { enabled: true, schedule, people, segments } };
    const extension = await settingsExtension({ ...saved, settings: personal, generatedWith: JSON.stringify({ people }) });
    const read = (await readSettings({ ...competition, extensions: [extension] }))!;
    const text = JSON.stringify(read);
    for (const secret of ["600123123", "Mezcladores", "phone", "Ana Sin Marca", "2020ANAS01", "Médico", "Se va pronto"]) expect(text).not.toContain(secret);
    expect(read.settings.people).not.toHaveProperty("unavailable");
    expect(read.generatedWith).toBeUndefined();
    expect(read.settings.people.roles).not.toHaveProperty("notasks");
    expect(read.settings.people.roles).not.toHaveProperty("avoid");
    // Staff lists and cluster rules are not personal and travel as before.
    expect(read.settings.people.roles.staff).toEqual([key]);
    expect(read.settings.pro?.segments?.[0].rules).toEqual([{ kind: "people", keys: [] }, { kind: "newcomer" }]);
    // Back on a device that has them, they are kept.
    const merged = withPrivateSettings(read.settings, personal);
    expect(merged.pro?.people).toEqual(people);
    expect(merged.pro?.segments).toEqual(segments);
    expect(merged.people.roles).toMatchObject({ notasks: [key], avoid: [key], staff: [key] });
    expect(merged.people.unavailable).toEqual(leaving);
    expect(withPrivateSettings(read.settings, undefined)).toBe(read.settings);

    // natshelper properties already at the WCA are taken out; the rest of the extension stays.
    const natshelper = "org.cubingusa.natshelper.v1.Person";
    const fresh = { ...competition, persons: competition.persons!.map(person => person === first ? { ...person, extensions: [{ id: natshelper, specUrl: "https://example.org", data: { properties: { phone: "600123123" }, other: 1 } }] } : person === second ? { ...person, extensions: [{ id: natshelper, specUrl: "https://example.org", data: { properties: { phone: "600999999" } } }] } : person) };
    const { patch } = buildPatch({ fresh, assignments, rounds, slots, schedule, people, settings: extension });
    expect(JSON.stringify(patch)).not.toContain("600123123");
    expect(JSON.stringify(patch)).not.toContain("600999999");
    expect(patch.persons!.find(person => person.wcaUserId === first.wcaUserId)?.extensions.find(item => item.id === natshelper)?.data).toEqual({ other: 1 });
    expect(patch.persons!.find(person => person.wcaUserId === second.wcaUserId)?.extensions.some(item => item.id === natshelper)).toBe(false);
  });

  it("notices round times changed at the WCA since the import", () => {
    const moved = structuredClone(competition);
    const room = moved.schedule!.venues![0].rooms![0];
    const round = room.activities!.find(activity => /-r\d+$/.test(activity.activityCode))!;
    round.startTime = "2030-01-01T09:00:00Z";
    expect(changedRounds(competition, moved)).toEqual([round.activityCode]);
    expect(changedRounds(competition, structuredClone(competition))).toEqual([]);
  });
});
