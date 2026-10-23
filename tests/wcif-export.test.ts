import { describe, expect, it } from "vitest";
import { demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, importSchedule, isoToLocal, localToIso, withScheduledGroups } from "@/lib/pro/schedule";
import { initialRounds, personKey } from "@/lib/rounds";
import { exportWcif } from "@/lib/wcif-export";
import { groupsFromWcif, hasWcifGroups } from "@/lib/wcif-groups";

const sameTasks = (a: Array<{ id: string; tasks: unknown[] }>, b: Array<{ id: string; tasks: unknown[] }>) => {
  const key = (rows: Array<{ id: string; tasks: unknown[] }>) => Object.fromEntries(rows.filter(row => row.tasks.length).map(row => [row.id, row.tasks]));
  expect(key(b)).toEqual(key(a));
};

describe("WCIF export", () => {
  it("converts wall-clock times back to UTC, across daylight saving", () => {
    for (const iso of ["2026-12-05T08:30:00Z", "2026-07-02T16:15:00Z", "2026-03-29T00:30:00Z", "2026-10-25T02:30:00Z"]) {
      expect(localToIso(isoToLocal(iso, "Europe/Madrid"), "Europe/Madrid")).toBe(iso);
    }
  });

  it("writes a PRO proposal that reads back the same, groups and all", () => {
    const competition = demoCompetition("large");
    const base = initialRounds(competition, 12, "fixed");
    const schedule = importSchedule(competition, id => base.find(round => round.id === id)?.groups ?? 1);
    const slots = groupSlots(schedule);
    const rounds = withScheduledGroups(base, slots).filter(round => round.enabled);
    const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: { ...DEFAULT_OPTIONS, assignDelegateDuties: true }, slots });
    const withStar = assignments.map((item, index) => index === 0 && item.inRound ? { ...item, featured: true } : item);
    const people = { propertyKeys: ["team"], properties: { [personKey(competition.persons![0])]: { team: "Data entry", "weight-judge": "3" } }, volunteers: [], unavailable: [] };
    const { wcif, report } = exportWcif({ competition, assignments: withStar, rounds, slots, schedule, people });
    expect(report.groupsCreated).toBeGreaterThan(0);
    expect(report.skipped).toEqual([]);
    expect(wcif).toMatchObject({ id: competition.id });
    expect(hasWcifGroups(wcif)).toBe(true);
    // Read back through the WCIF's own schedule: same columns, same tasks, stations and star.
    const slotsBack = groupSlots(importSchedule(wcif, () => 1));
    const back = groupsFromWcif(wcif, slotsBack);
    expect(back.unplaced).toBe(0);
    sameTasks(withStar, back.assignments);
    for (const item of withStar.filter(row => row.inRound && row.station !== undefined)) expect(back.assignments.find(row => row.id === item.id)!.station).toBe(item.station);
    expect(back.assignments.find(row => row.id === withStar[0].id)!.featured).toBe(withStar[0].featured);
    const person = wcif.persons!.find(item => personKey(item) === personKey(competition.persons![0]))!;
    expect(person.extensions!.find(item => item.id === "org.cubingusa.natshelper.v1.Person")!.data).toMatchObject({ properties: { team: "Data entry", "weight-judge": 3 } });
    // Exporting the exported file again reuses every group.
    const again = exportWcif({ competition: wcif, assignments: back.assignments, rounds, slots: slotsBack, schedule: importSchedule(wcif, () => 1) });
    expect([again.report.groupsCreated, again.report.groupsRemoved]).toEqual([0, 0]);
  });

  it("splits each round evenly in normal mode", () => {
    const competition = demoCompetition("small");
    const rounds = initialRounds(competition, 8, "fixed").filter(round => round.enabled);
    const assignments = generateAssignments({ competition, rounds, stations: 8, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS });
    const { wcif } = exportWcif({ competition, assignments, rounds });
    sameTasks(assignments, groupsFromWcif(wcif).assignments);
  });
});
