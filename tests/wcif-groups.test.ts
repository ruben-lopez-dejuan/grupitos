import { describe, expect, it } from "vitest";
import type { StoredCompetition, WcifActivity } from "@/lib/competition-store";
import { groupSlots, importSchedule } from "@/lib/pro/schedule";
import { groupsFromWcif, hasWcifGroups, roleOfAssignmentCode, wcifGroupsNeedStages } from "@/lib/wcif-groups";

/** One room with two natshelper stages (333 in two groups each) and a side room (4BLD). */
function wcif(): StoredCompetition {
  const group = (id: number, code: string, start: string, end: string, stageId?: number, featured?: number[]): WcifActivity => ({
    id, name: code, activityCode: code, startTime: start, endTime: end,
    extensions: [
      ...(stageId === undefined ? [] : [{ id: "org.cubingusa.natshelper.v1.Group", data: { stageId } }]),
      ...(featured ? [{ id: "groupifier.ActivityConfig", data: { featuredCompetitorWcaUserIds: featured } }] : []),
    ],
  });
  return {
    id: "Groups2026", name: "Groups 2026",
    events: [{ id: "333", rounds: [{ id: "333-r1" }] }, { id: "444bf", rounds: [{ id: "444bf-r1" }] }],
    schedule: {
      startDate: "2026-12-05", numberOfDays: 1,
      venues: [{ id: 1, timezone: "UTC", rooms: [
        { id: 1, name: "Pabellón", extensions: [{ id: "org.cubingusa.natshelper.v1.Room", data: { stages: [{ id: 0, name: "Araba", color: "#f39200" }, { id: 1, name: "Bizkaia", color: "#008b3b" }] } }], activities: [
          { id: 10, name: "333", activityCode: "333-r1", startTime: "2026-12-05T10:00:00Z", endTime: "2026-12-05T11:00:00Z", childActivities: [
            group(11, "333-r1-g1", "2026-12-05T10:00:00Z", "2026-12-05T10:30:00Z", 0),
            group(12, "333-r1-g2", "2026-12-05T10:30:00Z", "2026-12-05T11:00:00Z", 0),
            group(13, "333-r1-g1", "2026-12-05T10:00:00Z", "2026-12-05T10:30:00Z", 1, [501]),
            group(14, "333-r1-g2", "2026-12-05T10:30:00Z", "2026-12-05T11:00:00Z", 1),
          ] },
        ] },
        { id: 2, name: "Sala Auxiliar", activities: [
          { id: 20, name: "4BLD", activityCode: "444bf-r1", startTime: "2026-12-05T10:00:00Z", endTime: "2026-12-05T10:45:00Z", childActivities: [group(21, "444bf-r1-g1", "2026-12-05T10:00:00Z", "2026-12-05T10:45:00Z")] },
        ] },
      ] }],
    },
    persons: [
      { registrantId: 1, wcaUserId: 501, name: "Ana", wcaId: "2015ANAA01", registration: { status: "accepted", eventIds: ["333", "444bf"] }, assignments: [
        { activityId: 13, assignmentCode: "competitor", stationNumber: 3 }, { activityId: 12, assignmentCode: "staff-judge" }, { activityId: 21, assignmentCode: "competitor" },
      ] },
      { registrantId: 2, wcaUserId: 502, name: "Beñat", wcaId: "2016BENA01", registration: { status: "accepted", eventIds: ["333"] }, assignments: [
        { activityId: 14, assignmentCode: "competitor" }, { activityId: 21, assignmentCode: "staff-scrambler" }, { activityId: 11, assignmentCode: "staff-Delegate" }, { activityId: 10, assignmentCode: "staff-judge" },
      ] },
    ],
  };
}

describe("groups already in the WCIF", () => {
  it("are found, and need PRO when they use stages", () => {
    const competition = wcif();
    expect(hasWcifGroups(competition)).toBe(true);
    expect(wcifGroupsNeedStages(competition)).toBe(true);
    expect(hasWcifGroups({ ...competition, persons: competition.persons!.map(person => ({ ...person, assignments: [] })) })).toBe(false);
  });

  it("read the assignment codes like the WCIF writes them", () => {
    expect(["competitor", "staff-judge", "staff-scrambler", "staff-Delegate", "staff-dataentry", "staff-other", "staff-TableManager", "something"].map(roleOfAssignmentCode))
      .toEqual(["competitor", "judge", "scrambler", "delegate", "dataentry", "other", "other", undefined]);
  });

  it("land in the PRO columns of their room, stage and time, with stations and stars", () => {
    const competition = wcif();
    const slots = groupSlots(importSchedule(competition, () => 1));
    const column = (roundId: string, stage: number | undefined, start: string) => slots.get(roundId)!.find(slot => slot.stageId === stage && slot.windows[0].start === start)!.group;
    const { assignments, unplaced } = groupsFromWcif(competition, slots);
    expect(unplaced).toBe(0);
    const ana = assignments.find(item => item.id === "333-r1:1")!;
    expect(ana).toMatchObject({ inRound: true, station: 3, featured: true });
    expect(ana.tasks).toEqual([{ group: column("333-r1", 1, "2026-12-05T10:00"), role: "competitor" }, { group: column("333-r1", 0, "2026-12-05T10:30"), role: "judge" }].sort((a, b) => a.group - b.group));
    const benat = assignments.find(item => item.id === "333-r1:2")!;
    // A staff code on the round activity itself (not a group) is not a group task.
    expect(benat.tasks).toEqual([{ group: column("333-r1", 0, "2026-12-05T10:00"), role: "delegate" }, { group: column("333-r1", 1, "2026-12-05T10:30"), role: "competitor" }].sort((a, b) => a.group - b.group));
    expect(benat.featured).toBeUndefined();
    expect(assignments.find(item => item.id === "444bf-r1:2")).toMatchObject({ inRound: false, tasks: [{ group: 1, role: "scrambler" }] });
  });

  it("use the group number without a PRO schedule", () => {
    const competition = wcif();
    const { assignments, groupsByRound } = groupsFromWcif(competition);
    expect(Object.fromEntries(groupsByRound)).toEqual({ "333-r1": 2, "444bf-r1": 1 });
    expect(assignments.find(item => item.id === "333-r1:1")!.tasks).toEqual([{ group: 1, role: "competitor" }, { group: 2, role: "judge" }]);
  });

  it("place later multi-blind attempts in their own column", () => {
    const competition = wcif();
    const room = competition.schedule!.venues![0].rooms![1];
    room.activities!.push(
      { id: 30, name: "MBLD A1", activityCode: "333mbf-r1-a1", startTime: "2026-12-05T15:00:00Z", endTime: "2026-12-05T16:00:00Z", childActivities: [{ id: 31, name: "", activityCode: "333mbf-r1-g1-a1", startTime: "2026-12-05T15:00:00Z", endTime: "2026-12-05T16:00:00Z" }] },
      { id: 40, name: "MBLD A2", activityCode: "333mbf-r1-a2", startTime: "2026-12-05T17:00:00Z", endTime: "2026-12-05T18:00:00Z", childActivities: [{ id: 41, name: "", activityCode: "333mbf-r1-g1-a2", startTime: "2026-12-05T17:00:00Z", endTime: "2026-12-05T18:00:00Z" }] },
    );
    competition.events!.push({ id: "333mbf", rounds: [{ id: "333mbf-r1" }] });
    competition.persons![0].assignments!.push({ activityId: 31, assignmentCode: "competitor" }, { activityId: 41, assignmentCode: "competitor" });
    competition.persons![1].assignments!.push({ activityId: 41, assignmentCode: "staff-judge" });
    const slots = groupSlots(importSchedule(competition, () => 1));
    const { assignments } = groupsFromWcif(competition, slots);
    expect(assignments.find(item => item.id === "333mbf-r1:1")!.tasks).toEqual([{ group: 1, role: "competitor" }, { group: 2, role: "competitor", attempt: 2 }]);
    expect(assignments.find(item => item.id === "333mbf-r1:2")).toMatchObject({ inRound: false, tasks: [{ group: 2, role: "judge" }] });
  });
});
