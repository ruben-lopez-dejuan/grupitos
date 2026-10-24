import { describe, expect, it } from "vitest";
import { parseDraft, type Draft } from "@/lib/draft";
import { demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, importSchedule, withScheduledGroups } from "@/lib/pro/schedule";
import { initialRounds } from "@/lib/rounds";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";
import { exportWcif } from "@/lib/wcif-export";
import { DRAFT_EXTENSION_ID, readSession, withDraft, withoutDraft } from "@/lib/wcif-session";

describe("carrying on from another device", () => {
  const competition = demoCompetition("large");
  const base = initialRounds(competition, 12, "fixed");
  const schedule = importSchedule(competition, id => base.find(round => round.id === id)?.groups ?? 1);
  const slots = groupSlots(schedule);
  const rounds = withScheduledGroups(base, slots).filter(round => round.enabled);
  const people = peopleFromWcif(competition);
  const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people, options: DEFAULT_OPTIONS, slots });
  // A hand edit: the first competitor is also a judge in the round's last group.
  const edited = assignments.map((item, index) => index === 0 ? { ...item, tasks: [...item.tasks, { group: 99, role: "judge" as const }] } : item);
  const draft: Draft = {
    version: 3,
    settings: { stations: 12, zoneMode: "fixed", rounds: base, options: DEFAULT_OPTIONS, people, printing: DEFAULT_PRINTING, pro: { enabled: true, schedule, people: { propertyKeys: ["team"], properties: {}, volunteers: [{ key: "vol-1", name: "Ana Voluntaria" }], unavailable: [] } } },
    generatedWith: "signature",
    assignments: edited,
  };

  it("reads back the exported WCIF's draft as it was, hand edits and app-only volunteers included", () => {
    const { wcif } = exportWcif({ competition, assignments: edited, rounds, slots, schedule });
    const file = JSON.stringify(withDraft(wcif, draft));
    const read = readSession(file);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // The same as reloading in this browser: the draft goes through the same reading.
    expect(read.draft?.settings).toEqual(parseDraft(JSON.stringify(draft))!.settings);
    expect(read.draft?.settings?.pro?.people?.volunteers).toEqual([{ key: "vol-1", name: "Ana Voluntaria" }]);
    expect(read.draft?.generatedWith).toBe("signature");
    expect(read.draft?.assignments[0].tasks).toEqual(edited[0].tasks);
    expect(read.savedAt).toEqual(expect.any(String));
    // The competition keeps the groups and assignments, without the app's draft.
    expect(read.competition.id).toBe(competition.id);
    expect((read.competition as { extensions?: Array<{ id: string }> }).extensions?.some(item => item.id === DRAFT_EXTENSION_ID)).toBe(false);
    expect(read.competition.persons?.some(person => person.assignments?.length)).toBe(true);
  });

  it("replaces an older draft instead of adding a second one", () => {
    const twice = withDraft(withDraft(competition, draft), { ...draft, generatedWith: "newer" });
    const extensions = (twice as { extensions?: Array<{ id: string }> }).extensions ?? [];
    expect(extensions.filter(item => item.id === DRAFT_EXTENSION_ID)).toHaveLength(1);
    expect(withoutDraft(twice)).toEqual({ ...competition, extensions: [] });
  });

  it("opens any WCIF without a draft, and refuses files that are not one", () => {
    const read = readSession(JSON.stringify(competition));
    expect(read.ok && read.draft).toBe(undefined);
    expect(readSession("{ nope")).toEqual({ ok: false, reason: "not-json" });
    expect(readSession(JSON.stringify({ id: "X", name: "No people" }))).toEqual({ ok: false, reason: "not-wcif" });
  });
});
