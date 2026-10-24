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
import { buildPatch, changedRounds, checkPublished, readSettings, settingsExtension, SETTINGS_EXTENSION_ID } from "@/lib/wca-sync";

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
    expect(read).toEqual({ ...saved, settings: parseDraft(JSON.stringify({ version: 3, settings, assignments: [] }))!.settings });
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
    expect(sent.extensions.find(item => item.id === "org.cubingusa.natshelper.v1.Person")?.data).toEqual({ properties: { team: "Voluntario normal" } });
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

  it("notices round times changed at the WCA since the import", () => {
    const moved = structuredClone(competition);
    const room = moved.schedule!.venues![0].rooms![0];
    const round = room.activities!.find(activity => /-r\d+$/.test(activity.activityCode))!;
    round.startTime = "2030-01-01T09:00:00Z";
    expect(changedRounds(competition, moved)).toEqual([round.activityCode]);
    expect(changedRounds(competition, structuredClone(competition))).toEqual([]);
  });
});
