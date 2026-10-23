/*
 * PRO schedule. WCIF rooms are physical spaces; stages are optional subdivisions
 * declared by natshelper. Times are venue-local wall-clock values, YYYY-MM-DDTHH:mm.
 */
import type { StoredCompetition, WcifActivity, WcifExtension, WcifRoom } from "@/lib/competition-store";
import type { ProPeople } from "@/lib/pro/people";
import type { JobEligibility, Segment } from "@/lib/pro/segments";

export type LocalTime = string;
export type TimeWindow = { start: LocalTime; end: LocalTime };

export type ProStage = { id: number; name: string; color: string; groupNamePrefix?: string };
export type ProRoom = { id: number; name: string; color: string; stages: ProStage[] };

export type ProRoundBlock = TimeWindow & {
  id: string;
  activityCode: string;
  roomId: number;
  stageId?: number;
  groups: number;
  /** Exact imported child-activity windows. Omitted for visually-created equal groups. */
  groupWindows?: TimeWindow[];
};

export const OTHER_KINDS = ["checkin", "registration", "tutorial", "lunch", "awards", "multi", "setup", "misc"] as const;
export type OtherKind = typeof OTHER_KINDS[number];
export type ProActivity = TimeWindow & { id: string; kind: OtherKind; name: string; roomId: number; stageId?: number };

export type ProSchedule = {
  timeZone: string;
  days: string[];
  rooms: ProRoom[];
  blocks: ProRoundBlock[];
  activities: ProActivity[];
};

/** `people` is absent until the PRO people panel is first used. */
export type ProConfig = { enabled: boolean; schedule: ProSchedule; people?: ProPeople; segments?: Segment[]; jobs?: JobEligibility };

export type ScheduleLane = { key: string; roomId: number; stageId?: number; name: string; color: string; roomName: string };
/**
 * `group` is the matrix column (G1…Gn in time order, then lane order). `number` is the group
 * number people see and the WCIF uses (-g{number}): by convention, groups that start at the same
 * time in different stages share it, and each new start time takes the next number.
 */
export type GroupSlot = { group: number; roomId: number; stageId?: number; number: number; windows: TimeWindow[] };

export const STAGE_COLORS = ["#d93636", "#2f9e44", "#2563eb", "#e8a317", "#9c36b5", "#0c8599", "#f76707", "#495057"];

export const ROOM_EXTENSION_ID = "org.cubingusa.natshelper.v1.Room";
export const GROUP_EXTENSION_ID = "org.cubingusa.natshelper.v1.Group";
const ROUND_CODE = /^([a-z0-9]+-r\d+)(?:-a(\d+))?$/;

export function roundIdOf(activityCode: string) {
  return activityCode.match(ROUND_CODE)?.[1];
}

function attemptOf(activityCode: string) {
  return Number(activityCode.match(ROUND_CODE)?.[2] ?? 1);
}

export function targetKey(roomId: number, stageId?: number) {
  return `${roomId}:${stageId ?? "room"}`;
}

/** Timeline columns, in room order and then stage order. */
export function scheduleLanes(schedule: ProSchedule): ScheduleLane[] {
  return schedule.rooms.flatMap(room => {
    const needsRoomLane = room.stages.length === 0 || schedule.blocks.some(block => block.roomId === room.id && block.stageId === undefined);
    const roomLane: ScheduleLane[] = needsRoomLane ? [{ key: targetKey(room.id), roomId: room.id, name: room.name, color: room.color, roomName: room.name }] : [];
    return [...roomLane, ...room.stages.map(stage => ({ key: targetKey(room.id, stage.id), roomId: room.id, stageId: stage.id, name: stage.name, color: stage.color, roomName: room.name }))];
  });
}

export function laneForItem(schedule: ProSchedule, item: { roomId: number; stageId?: number }) {
  const lanes = scheduleLanes(schedule);
  return lanes.find(lane => lane.roomId === item.roomId && lane.stageId === item.stageId)
    ?? lanes.find(lane => lane.roomId === item.roomId)
    ?? lanes[0];
}

/** Minutes since 1970 on the wall clock; only differences and order matter. */
export function toMinutes(time: LocalTime) {
  const [date, clock = "00:00"] = time.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = clock.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes) / 60000;
}

export function fromMinutes(total: number): LocalTime {
  return new Date(Math.round(total) * 60000).toISOString().slice(0, 16);
}

export function addMinutes(time: LocalTime, minutes: number) {
  return fromMinutes(toMinutes(time) + minutes);
}

export function dayOf(time: LocalTime) {
  return time.slice(0, 10);
}

export function clockOf(time: LocalTime) {
  return time.slice(11, 16);
}

export function overlaps(a: TimeWindow, b: TimeWindow) {
  return a.start < b.end && b.start < a.end;
}

/** A WCIF timestamp as wall-clock time in `timeZone`. */
export function isoToLocal(iso: string, timeZone: string): LocalTime {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function dateRange(startDate: string, count: number) {
  return Array.from({ length: count }, (_, index) => fromMinutes(toMinutes(startDate) + index * 1440).slice(0, 10));
}

function otherKind(activityCode: string): OtherKind {
  const kind = activityCode.replace(/^other-/, "");
  return (OTHER_KINDS as readonly string[]).includes(kind) ? kind as OtherKind : "misc";
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function extension(extensions: WcifExtension[] | undefined, id: string) {
  return extensions?.find(item => item.id === id)?.data;
}

function stagesOf(room: WcifRoom): ProStage[] {
  const data = extension(room.extensions, ROOM_EXTENSION_ID);
  const stages = record(data) && Array.isArray(data.stages) ? data.stages : [];
  return stages.flatMap((value, index): ProStage[] => {
    if (!record(value) || typeof value.id !== "number") return [];
    return [{
      id: value.id,
      name: typeof value.name === "string" ? value.name : `#${value.id}`,
      color: typeof value.color === "string" ? value.color : STAGE_COLORS[index % STAGE_COLORS.length],
      ...(typeof value.groupNamePrefix === "string" ? { groupNamePrefix: value.groupNamePrefix } : {}),
    }];
  });
}

function stageIdOf(activity: WcifActivity) {
  const data = extension(activity.extensions, GROUP_EXTENSION_ID);
  return record(data) && typeof data.stageId === "number" ? data.stageId : undefined;
}

function groupChildren(activity: WcifActivity) {
  // Attempt-based rounds (multi-blind, FMC) name their groups 333mbf-r1-g1-a1.
  return (activity.childActivities ?? []).filter(child => /-g\d+(?:-a\d+)?$/.test(child.activityCode));
}

function childWindow(activity: WcifActivity, timeZone: string): TimeWindow | undefined {
  if (!activity.startTime || !activity.endTime || Number.isNaN(Date.parse(activity.startTime)) || Number.isNaN(Date.parse(activity.endTime))) return undefined;
  return { start: isoToLocal(activity.startTime, timeZone), end: isoToLocal(activity.endTime, timeZone) };
}

/** Import rooms, their natshelper stages, exact group children, and room-wide activities. */
export function importSchedule(competition: StoredCompetition, suggestedGroups: (roundId: string) => number): ProSchedule {
  const venues = competition.schedule?.venues ?? [];
  const timeZone = venues.find(venue => venue.timezone)?.timezone ?? "UTC";
  const sourceRooms = venues.flatMap(venue => venue.rooms ?? []);
  let fallbackRoomId = Math.max(0, ...sourceRooms.map(room => room.id ?? 0)) + 1;
  const roomPairs = sourceRooms.map((source, index) => {
    const id = source.id ?? fallbackRoomId++;
    return { source, room: { id, name: source.name ?? `#${id}`, color: source.color ?? STAGE_COLORS[index % STAGE_COLORS.length], stages: stagesOf(source) } satisfies ProRoom };
  });
  const rooms = roomPairs.map(pair => pair.room);
  const blocks: ProRoundBlock[] = [];
  const activities: ProActivity[] = [];
  const local = (iso: string) => isoToLocal(iso, timeZone);

  const targetCountByRound = new Map<string, number>();
  for (const { source, room } of roomPairs) {
    for (const roundId of new Set((source.activities ?? []).map(activity => roundIdOf(activity.activityCode)).filter(Boolean))) {
      targetCountByRound.set(roundId!, (targetCountByRound.get(roundId!) ?? 0) + Math.max(1, room.stages.length));
    }
  }

  for (const { source, room } of roomPairs) {
    for (const activity of source.activities ?? []) {
      const roundId = roundIdOf(activity.activityCode);
      const parentWindow = { start: local(activity.startTime), end: local(activity.endTime) };
      if (roundId) {
        const children = groupChildren(activity);
        if (children.length) {
          const byStage = new Map<number | undefined, WcifActivity[]>();
          for (const child of children) {
            const stageId = stageIdOf(child);
            byStage.set(stageId, [...(byStage.get(stageId) ?? []), child]);
          }
          for (const [stageId, ownChildren] of byStage) {
            const exact = ownChildren.map(child => childWindow(child, timeZone));
            const groupWindows = exact.every(Boolean) ? sortByTime(exact as TimeWindow[]) : undefined;
            const window = groupWindows?.length ? { start: groupWindows[0].start, end: groupWindows.at(-1)!.end } : parentWindow;
            blocks.push({ id: `b${activity.id}-${stageId ?? "room"}`, activityCode: activity.activityCode, roomId: room.id, stageId, groups: ownChildren.length, groupWindows, ...window });
          }
        } else {
          const targets = room.stages.length ? room.stages.map(stage => stage.id) : [undefined];
          const groups = Math.max(1, Math.ceil(suggestedGroups(roundId) / (targetCountByRound.get(roundId) ?? 1)));
          for (const stageId of targets) blocks.push({ id: `b${activity.id}-${stageId ?? "room"}`, activityCode: activity.activityCode, roomId: room.id, stageId, groups, ...parentWindow });
        }
      } else if (activity.activityCode.startsWith("other-")) {
        activities.push({ id: `a${activity.id}`, kind: otherKind(activity.activityCode), name: activity.name, roomId: room.id, ...parentWindow });
      }
    }
  }
  const used = [...blocks, ...activities].map(item => dayOf(item.start));
  const startDate = competition.schedule?.startDate;
  const days = startDate ? dateRange(startDate, Math.max(1, competition.schedule?.numberOfDays ?? 1)) : [];
  return { timeZone, days: [...new Set([...days, ...used])].sort(), rooms, blocks: sortByTime(blocks), activities: sortByTime(activities) };
}

export function sortByTime<T extends TimeWindow>(items: T[]) {
  return [...items].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** Exact imported windows when present; otherwise equal parts like CompScript CreateGroups. */
export function splitBlock(block: TimeWindow & { groups: number; groupWindows?: TimeWindow[] }): TimeWindow[] {
  if (block.groupWindows?.length === block.groups) return sortByTime(block.groupWindows);
  const count = Math.max(1, block.groups);
  const start = toMinutes(block.start);
  const length = (toMinutes(block.end) - start) / count;
  return Array.from({ length: count }, (_, index) => ({ start: fromMinutes(start + index * length), end: fromMinutes(start + (index + 1) * length) }));
}

/** Columns follow time then room/stage order; numbers follow start times (see GroupSlot). */
export function groupSlots(schedule: ProSchedule): Map<string, GroupSlot[]> {
  const lanes = scheduleLanes(schedule);
  const laneOrder = new Map(lanes.map((lane, index) => [lane.key, index]));
  const byRound = new Map<string, ProRoundBlock[]>();
  for (const block of schedule.blocks) {
    const roundId = roundIdOf(block.activityCode);
    if (roundId && laneOrder.has(targetKey(block.roomId, block.stageId))) byRound.set(roundId, [...(byRound.get(roundId) ?? []), block]);
  }
  const result = new Map<string, GroupSlot[]>();
  for (const [roundId, blocks] of byRound) {
    // `position` is the order within the lane; later attempts (multi-blind) match on it.
    const parts = (attempt: number) => {
      const numbered: Array<{ roomId: number; stageId?: number; position: number; window: TimeWindow }> = [];
      for (const lane of lanes) {
        let position = 0;
        for (const block of sortByTime(blocks.filter(item => targetKey(item.roomId, item.stageId) === lane.key && attemptOf(item.activityCode) === attempt))) {
          for (const window of splitBlock(block)) numbered.push({ roomId: lane.roomId, stageId: lane.stageId, position: ++position, window });
        }
      }
      return numbered;
    };
    const first = parts(1).sort((a, b) => a.window.start.localeCompare(b.window.start) || laneOrder.get(targetKey(a.roomId, a.stageId))! - laneOrder.get(targetKey(b.roomId, b.stageId))! || a.position - b.position);
    const starts = [...new Set(first.map(part => part.window.start))];
    const slots = first.map((part, index): GroupSlot => ({ group: index + 1, roomId: part.roomId, stageId: part.stageId, number: starts.indexOf(part.window.start) + 1, windows: [part.window] }));
    const attempts = [...new Set(blocks.map(block => attemptOf(block.activityCode)))].filter(attempt => attempt > 1).sort();
    for (const attempt of attempts) {
      for (const part of parts(attempt)) {
        const match = first.findIndex(candidate => candidate.roomId === part.roomId && candidate.stageId === part.stageId && candidate.position === part.position);
        if (match >= 0) slots[match].windows.push(part.window);
      }
    }
    result.set(roundId, slots);
  }
  return result;
}

export function slotsOverlap(a: GroupSlot, b: GroupSlot) {
  return a.windows.some(x => b.windows.some(y => overlaps(x, y)));
}

export type ScheduleProblemCode = "bad-times" | "unknown-stage" | "unscheduled" | "stage-overlap" | "before-previous-round";
export type ScheduleProblem = { code: ScheduleProblemCode; severity: "error" | "warning"; itemId?: string; roundId?: string; otherRoundId?: string };

export function scheduleProblems(schedule: ProSchedule, roundIds: string[]): ScheduleProblem[] {
  const problems: ScheduleProblem[] = [];
  const validTargets = new Set(scheduleLanes(schedule).map(lane => lane.key));
  for (const item of [...schedule.blocks, ...schedule.activities]) {
    if (item.end <= item.start) problems.push({ code: "bad-times", severity: "error", itemId: item.id, roundId: "activityCode" in item ? roundIdOf(item.activityCode) : undefined });
    const room = schedule.rooms.find(candidate => candidate.id === item.roomId);
    const valid = room && (item.stageId === undefined || room.stages.some(stage => stage.id === item.stageId));
    if (!valid || ("activityCode" in item && !validTargets.has(targetKey(item.roomId, item.stageId)))) problems.push({ code: "unknown-stage", severity: "error", itemId: item.id });
  }
  const scheduled = new Set(schedule.blocks.map(block => roundIdOf(block.activityCode)));
  for (const roundId of roundIds) if (!scheduled.has(roundId)) problems.push({ code: "unscheduled", severity: "warning", roundId });
  const blocks = sortByTime(schedule.blocks);
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length && blocks[j].start < blocks[i].end; j += 1) {
      const [a, b] = [blocks[i], blocks[j]];
      if (targetKey(a.roomId, a.stageId) === targetKey(b.roomId, b.stageId) && roundIdOf(a.activityCode) !== roundIdOf(b.activityCode)) problems.push({ code: "stage-overlap", severity: "warning", itemId: b.id, roundId: roundIdOf(b.activityCode), otherRoundId: roundIdOf(a.activityCode) });
    }
  }
  const span = new Map<string, TimeWindow>();
  for (const block of blocks) {
    const roundId = roundIdOf(block.activityCode)!;
    const current = span.get(roundId);
    span.set(roundId, current ? { start: current.start < block.start ? current.start : block.start, end: current.end > block.end ? current.end : block.end } : { start: block.start, end: block.end });
  }
  for (const [roundId, window] of span) {
    const previous = roundId.replace(/-r(\d+)$/, (_, number) => `-r${Number(number) - 1}`);
    const before = span.get(previous);
    if (previous !== roundId && before && window.start < before.end) problems.push({ code: "before-previous-round", severity: "error", roundId, otherRoundId: previous });
  }
  return problems;
}

export function newItemId(prefix: "b" | "a", existing: Array<{ id: string }>) {
  let index = existing.length + 1;
  while (existing.some(item => item.id === `${prefix}n${index}`)) index += 1;
  return `${prefix}n${index}`;
}

export function newRoomId(rooms: ProRoom[]) {
  return Math.max(0, ...rooms.map(room => room.id)) + 1;
}

export function newStageId(rooms: ProRoom[]) {
  return Math.max(0, ...rooms.flatMap(room => room.stages.map(stage => stage.id))) + 1;
}

/** Convert phase-1 drafts where every room was incorrectly stored as a stage. */
export function normalizeProSchedule(value: unknown): ProSchedule {
  const schedule = record(value) ? value : {};
  const blocks = Array.isArray(schedule.blocks) ? schedule.blocks as Array<Record<string, unknown>> : [];
  const activities = Array.isArray(schedule.activities) ? schedule.activities as Array<Record<string, unknown>> : [];
  if (Array.isArray(schedule.rooms)) return schedule as unknown as ProSchedule;
  const legacyStages = Array.isArray(schedule.stages) ? schedule.stages as ProStage[] : [];
  return {
    timeZone: typeof schedule.timeZone === "string" ? schedule.timeZone : "UTC",
    days: Array.isArray(schedule.days) ? schedule.days.filter((day): day is string => typeof day === "string") : [],
    rooms: legacyStages.map(stage => ({ id: stage.id, name: stage.name, color: stage.color, stages: [] })),
    blocks: blocks.map(block => ({ ...block, roomId: Number(block.stageId), stageId: undefined })) as ProRoundBlock[],
    activities: activities.map(activity => ({ ...activity, roomId: Number(activity.stageId), stageId: undefined })) as ProActivity[],
  };
}

/**
 * Times outside any group when an event's competitors are busy anyway: multi-blind cube
 * submission (`other-multi`) for 333mbf.
 */
export function eventBusyWindows(schedule: ProSchedule): Map<string, TimeWindow[]> {
  const submissions = schedule.activities.filter(activity => activity.kind === "multi").map(({ start, end }) => ({ start, end }));
  return new Map(submissions.length ? [["333mbf", submissions]] : []);
}

/** Blocks of a round's first attempt (all of them for rounds without attempts). */
function firstAttemptBlocks(schedule: ProSchedule, roundId: string) {
  return sortByTime(schedule.blocks.filter(block => roundIdOf(block.activityCode) === roundId && attemptOf(block.activityCode) === 1));
}

/** Fewest groups a round can have in the schedule: one per block. */
export function minScheduledGroups(schedule: ProSchedule, roundId: string) {
  return Math.max(1, firstAttemptBlocks(schedule, roundId).length);
}

/**
 * Sets a round's total groups from the rounds table: the total is spread over its blocks in
 * proportion to their length (at least one each), and later attempts copy their lane's count.
 * Blocks whose count changes lose their imported exact windows and are split evenly.
 */
export function setRoundGroups(schedule: ProSchedule, roundId: string, total: number): ProSchedule {
  const first = firstAttemptBlocks(schedule, roundId);
  if (!first.length) return schedule;
  const target = Math.max(first.length, Math.round(total));
  const lengths = first.map(block => Math.max(1, toMinutes(block.end) - toMinutes(block.start)));
  const sum = lengths.reduce((a, b) => a + b, 0);
  const extra = target - first.length;
  const shares = lengths.map(length => (extra * length) / sum);
  const counts = shares.map(share => 1 + Math.floor(share));
  let left = target - counts.reduce((a, b) => a + b, 0);
  for (const index of shares.map((share, index) => ({ index, rest: share - Math.floor(share) })).sort((a, b) => b.rest - a.rest || a.index - b.index).map(item => item.index)) {
    if (left <= 0) break;
    counts[index] += 1;
    left -= 1;
  }
  const byId = new Map(first.map((block, index) => [block.id, counts[index]]));
  const laneCounts = new Map<string, number[]>();
  first.forEach((block, index) => laneCounts.set(targetKey(block.roomId, block.stageId), [...(laneCounts.get(targetKey(block.roomId, block.stageId)) ?? []), counts[index]]));
  const laterSeen = new Map<string, number>();
  const blocks = sortByTime(schedule.blocks).map(block => {
    if (roundIdOf(block.activityCode) !== roundId) return block;
    let groups = byId.get(block.id);
    if (groups === undefined) {
      const key = `${attemptOf(block.activityCode)}|${targetKey(block.roomId, block.stageId)}`;
      const position = laterSeen.get(key) ?? 0;
      laterSeen.set(key, position + 1);
      groups = laneCounts.get(targetKey(block.roomId, block.stageId))?.[position] ?? block.groups;
    }
    if (groups === block.groups) return block;
    const { groupWindows: _exact, ...rest } = block;
    return { ...rest, groups };
  });
  return { ...schedule, blocks };
}

export function withScheduledGroups<T extends { id: string; groups: number }>(rounds: T[], slots: Map<string, GroupSlot[]>): T[] {
  return rounds.map(round => slots.has(round.id) ? { ...round, groups: slots.get(round.id)!.length } : round);
}
