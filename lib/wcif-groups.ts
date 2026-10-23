/*
 * Groups already in the WCIF (made with CompScript, Groupifier or by hand) as a proposal to review.
 * Each group activity is placed in the matrix: in PRO mode by room, stage and start time (the
 * number people see stays the WCIF's); otherwise by its group number. Assignment codes follow the
 * WCIF (`competitor`, `staff-judge`…); unknown staff codes become "other".
 */
import { sortTasks, type GeneratedAssignment, type TaskRole } from "@/lib/assignments";
import type { StoredCompetition, WcifActivity } from "@/lib/competition-store";
import { isoToLocal, type GroupSlot } from "@/lib/pro/schedule";
import { personKey, seedResult } from "@/lib/rounds";

const GROUP_CODE = /^([a-z0-9]+-r\d+)-g(\d+)(?:-a(\d+))?$/;
const GROUP_EXTENSION_ID = "org.cubingusa.natshelper.v1.Group";
const FEATURED_EXTENSION_ID = "groupifier.ActivityConfig";

/** The app's task for a WCIF assignment code. */
export function roleOfAssignmentCode(code: string): TaskRole | undefined {
  if (code === "competitor") return "competitor";
  if (!code.startsWith("staff-")) return undefined;
  const job = code.slice(6).toLowerCase().replace(/[^a-z]/g, "");
  const known: Record<string, TaskRole> = { judge: "judge", scrambler: "scrambler", runner: "runner", delegate: "delegate", dataentry: "dataentry", stagelead: "stagelead", announcer: "announcer" };
  return known[job] ?? "other";
}

type GroupActivity = { id: number; roundId: string; number: number; attempt: number; roomId?: number; stageId?: number; start: string; featured: number[] };

function groupActivities(competition: StoredCompetition) {
  const venues = competition.schedule?.venues ?? [];
  const timeZone = venues.find(venue => venue.timezone)?.timezone ?? "UTC";
  const result = new Map<number, GroupActivity>();
  const visit = (activity: WcifActivity, roomId?: number) => {
    const match = activity.activityCode.match(GROUP_CODE);
    if (match) {
      const data = activity.extensions?.find(item => item.id === GROUP_EXTENSION_ID)?.data as { stageId?: unknown } | undefined;
      const config = activity.extensions?.find(item => item.id === FEATURED_EXTENSION_ID)?.data as { featuredCompetitorWcaUserIds?: unknown } | undefined;
      result.set(activity.id, {
        id: activity.id, roundId: match[1], number: Number(match[2]), attempt: Number(match[3] ?? 1), roomId,
        stageId: typeof data?.stageId === "number" ? data.stageId : undefined,
        start: isoToLocal(activity.startTime, timeZone),
        featured: Array.isArray(config?.featuredCompetitorWcaUserIds) ? config.featuredCompetitorWcaUserIds.filter((id): id is number => typeof id === "number") : [],
      });
    }
    for (const child of activity.childActivities ?? []) visit(child, roomId);
  };
  for (const venue of venues) for (const room of venue.rooms ?? []) for (const activity of room.activities ?? []) visit(activity, room.id);
  return result;
}

/** Whether anyone in the WCIF has a group assignment the app understands. */
export function hasWcifGroups(competition: StoredCompetition) {
  const groups = groupActivities(competition);
  return (competition.persons ?? []).some(person => (person.assignments ?? []).some(item => groups.has(item.activityId) && roleOfAssignmentCode(item.assignmentCode)));
}

/** Groups on stages, or one round in several rooms: only PRO mode tells their columns apart. */
export function wcifGroupsNeedStages(competition: StoredCompetition) {
  const groups = [...groupActivities(competition).values()];
  const roomsByRound = new Map<string, Set<number | undefined>>();
  for (const group of groups) roomsByRound.set(group.roundId, new Set([...(roomsByRound.get(group.roundId) ?? []), group.roomId]));
  return groups.some(group => group.stageId !== undefined) || [...roomsByRound.values()].some(rooms => rooms.size > 1);
}

export type ImportedGroups = {
  assignments: GeneratedAssignment[];
  /** Normal mode: groups per round, from the highest group number. */
  groupsByRound: Map<string, number>;
  /** Assignments whose group has no column in the PRO schedule. */
  unplaced: number;
};

/** The WCIF's group assignments as a proposal. `slots`: PRO schedule columns (imported from this WCIF). */
export function groupsFromWcif(competition: StoredCompetition, slots?: Map<string, GroupSlot[]>): ImportedGroups {
  const groups = groupActivities(competition);
  const column = (group: GroupActivity) => {
    if (!slots) return group.number;
    const roundSlots = slots.get(group.roundId) ?? [];
    const sameLane = (slot: GroupSlot) => slot.roomId === group.roomId && slot.stageId === group.stageId;
    // Same room and stage at the same start time; later attempts (multi-blind) start later.
    return (roundSlots.find(slot => sameLane(slot) && slot.windows.some(window => window.start === group.start))
      ?? roundSlots.find(slot => sameLane(slot) && slot.number === group.number)
      ?? roundSlots.find(slot => slot.roomId === group.roomId && slot.number === group.number))?.group;
  };
  const eventOf = (roundId: string) => roundId.split("-")[0];
  const rows = new Map<string, GeneratedAssignment>();
  const groupsByRound = new Map<string, number>();
  let unplaced = 0;
  for (const person of competition.persons ?? []) {
    for (const item of person.assignments ?? []) {
      const group = groups.get(item.activityId);
      const role = roleOfAssignmentCode(item.assignmentCode);
      if (!group || !role) continue;
      const at = column(group);
      if (at === undefined) { unplaced += 1; continue; }
      groupsByRound.set(group.roundId, Math.max(groupsByRound.get(group.roundId) ?? 0, at));
      const key = personKey(person);
      const id = `${group.roundId}:${key}`;
      const row = rows.get(id) ?? {
        id, roundId: group.roundId, eventId: eventOf(group.roundId), personId: key, name: person.name, wcaId: person.wcaId, birthdate: person.birthdate,
        seedResult: seedResult(person, eventOf(group.roundId)), inRound: false, tasks: [],
      };
      // A multi-blind person has a group per attempt in the same column: one task is enough.
      if (!row.tasks.some(task => task.group === at && task.role === role)) row.tasks = sortTasks([...row.tasks, { group: at, role }]);
      if (role === "competitor") {
        row.inRound = true;
        if (typeof item.stationNumber === "number") row.station = item.stationNumber;
        if (person.wcaUserId !== undefined && group.featured.includes(person.wcaUserId)) row.featured = true;
      }
      rows.set(id, row);
    }
  }
  return { assignments: [...rows.values()], groupsByRound, unplaced };
}
