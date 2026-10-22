/*
 * PRO mode schedule: stages (WCIF rooms) and the time slots of every round, split into
 * groups the way CompScript's CreateGroups does (https://github.com/cubingusa/compscript, MIT).
 * Times are wall-clock times in the venue's time zone, "YYYY-MM-DDTHH:mm", so they compare as text.
 */
import type { StoredCompetition, WcifActivity } from "@/lib/competition-store";

export type LocalTime = string;
export type TimeWindow = { start: LocalTime; end: LocalTime };

/** A WCIF room; CompScript calls them stages when several run in parallel. */
export type ProStage = { id: number; name: string; color: string };

/** One round (or one attempt of it) in one stage, split into `groups` consecutive groups of equal length. */
export type ProRoundBlock = TimeWindow & { id: string; activityCode: string; stageId: number; groups: number };

export const OTHER_KINDS = ["checkin", "registration", "tutorial", "lunch", "awards", "multi", "misc"] as const;
export type OtherKind = typeof OTHER_KINDS[number];
/** Activities without groups: check-in, lunch, awards… (CompScript's CreateMiscActivity). */
export type ProActivity = TimeWindow & { id: string; kind: OtherKind; name: string; stageId: number };

export type ProSchedule = {
  timeZone: string;
  days: string[];
  stages: ProStage[];
  blocks: ProRoundBlock[];
  activities: ProActivity[];
};

export type ProConfig = { enabled: boolean; schedule: ProSchedule };

/** A group as the matrix sees it: number G1…Gn in time order, with its stage and times. */
export type GroupSlot = { group: number; stageId: number; number: number; windows: TimeWindow[] };

export const STAGE_COLORS = ["#d93636", "#2f9e44", "#2563eb", "#e8a317", "#9c36b5", "#0c8599", "#f76707", "#495057"];

const ROUND_CODE = /^([a-z0-9]+-r\d+)(?:-a(\d+))?$/;

export function roundIdOf(activityCode: string) {
  return activityCode.match(ROUND_CODE)?.[1];
}

function attemptOf(activityCode: string) {
  return Number(activityCode.match(ROUND_CODE)?.[2] ?? 1);
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

/**
 * Reads the WCIF schedule: every room becomes a stage, every round activity a block (with as
 * many groups as it already has, or `suggestedGroups` shared among its rooms), and every
 * `other-*` activity an activity.
 */
export function importSchedule(competition: StoredCompetition, suggestedGroups: (roundId: string) => number): ProSchedule {
  const venues = competition.schedule?.venues ?? [];
  const timeZone = venues.find(venue => venue.timezone)?.timezone ?? "UTC";
  const stages: ProStage[] = [];
  const blocks: ProRoundBlock[] = [];
  const activities: ProActivity[] = [];
  const local = (iso: string) => isoToLocal(iso, timeZone);
  const roomsPerRound = new Map<string, number>();
  for (const room of venues.flatMap(venue => venue.rooms ?? [])) {
    for (const code of new Set((room.activities ?? []).map(activity => roundIdOf(activity.activityCode)).filter(Boolean))) {
      roomsPerRound.set(code!, (roomsPerRound.get(code!) ?? 0) + 1);
    }
  }
  venues.forEach(venue => (venue.rooms ?? []).forEach(room => {
    const stageId = room.id ?? stages.length + 1;
    stages.push({ id: stageId, name: room.name ?? `#${stageId}`, color: room.color ?? STAGE_COLORS[stages.length % STAGE_COLORS.length] });
    for (const activity of room.activities ?? []) {
      const roundId = roundIdOf(activity.activityCode);
      const window = { start: local(activity.startTime), end: local(activity.endTime) };
      if (roundId) {
        const groups = groupChildren(activity).length || Math.max(1, Math.ceil(suggestedGroups(roundId) / (roomsPerRound.get(roundId) ?? 1)));
        blocks.push({ id: `b${activity.id}`, activityCode: activity.activityCode, stageId, groups, ...window });
      } else if (activity.activityCode.startsWith("other-")) {
        activities.push({ id: `a${activity.id}`, kind: otherKind(activity.activityCode), name: activity.name, stageId, ...window });
      }
    }
  }));
  const used = [...blocks, ...activities].map(item => dayOf(item.start));
  const startDate = competition.schedule?.startDate;
  const days = startDate ? dateRange(startDate, Math.max(1, competition.schedule?.numberOfDays ?? 1)) : [];
  return { timeZone, days: [...new Set([...days, ...used])].sort(), stages, blocks: sortByTime(blocks), activities: sortByTime(activities) };
}

function groupChildren(activity: WcifActivity) {
  return (activity.childActivities ?? []).filter(child => /-g\d+/.test(child.activityCode));
}

export function sortByTime<T extends TimeWindow>(items: T[]) {
  return [...items].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/** Equal parts of a block, like CreateGroups. */
export function splitBlock(block: TimeWindow & { groups: number }): TimeWindow[] {
  const count = Math.max(1, block.groups);
  const start = toMinutes(block.start);
  const length = (toMinutes(block.end) - start) / count;
  return Array.from({ length: count }, (_, index) => ({ start: fromMinutes(start + index * length), end: fromMinutes(start + (index + 1) * length) }));
}

/**
 * The groups of every round. Within a stage, groups are numbered in time order (Rojo 1, Rojo 2…);
 * the round's G1…Gn follow start time, then stage order, so parallel groups sit side by side.
 * Later attempts (multi-blind) add time windows to the groups with the same stage and number.
 */
export function groupSlots(schedule: ProSchedule): Map<string, GroupSlot[]> {
  const stageOrder = new Map(schedule.stages.map((stage, index) => [stage.id, index]));
  const byRound = new Map<string, ProRoundBlock[]>();
  for (const block of schedule.blocks) {
    const roundId = roundIdOf(block.activityCode);
    if (roundId && stageOrder.has(block.stageId)) byRound.set(roundId, [...(byRound.get(roundId) ?? []), block]);
  }
  const result = new Map<string, GroupSlot[]>();
  for (const [roundId, blocks] of byRound) {
    const parts = (attempt: number) => {
      const numbered: Array<{ stageId: number; number: number; window: TimeWindow }> = [];
      for (const stage of schedule.stages) {
        let number = 0;
        for (const block of sortByTime(blocks.filter(item => item.stageId === stage.id && attemptOf(item.activityCode) === attempt))) {
          for (const window of splitBlock(block)) numbered.push({ stageId: stage.id, number: ++number, window });
        }
      }
      return numbered;
    };
    const slots = parts(1)
      .sort((a, b) => a.window.start.localeCompare(b.window.start) || stageOrder.get(a.stageId)! - stageOrder.get(b.stageId)! || a.number - b.number)
      .map((part, index): GroupSlot => ({ group: index + 1, stageId: part.stageId, number: part.number, windows: [part.window] }));
    const attempts = [...new Set(blocks.map(block => attemptOf(block.activityCode)))].filter(attempt => attempt > 1).sort();
    for (const attempt of attempts) {
      for (const part of parts(attempt)) slots.find(slot => slot.stageId === part.stageId && slot.number === part.number)?.windows.push(part.window);
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

/** What is wrong with the schedule itself, before anyone is assigned. */
export function scheduleProblems(schedule: ProSchedule, roundIds: string[]): ScheduleProblem[] {
  const problems: ScheduleProblem[] = [];
  const stageIds = new Set(schedule.stages.map(stage => stage.id));
  for (const item of [...schedule.blocks, ...schedule.activities]) {
    if (item.end <= item.start) problems.push({ code: "bad-times", severity: "error", itemId: item.id, roundId: "activityCode" in item ? roundIdOf(item.activityCode) : undefined });
    if (!stageIds.has(item.stageId)) problems.push({ code: "unknown-stage", severity: "error", itemId: item.id });
  }
  const scheduled = new Set(schedule.blocks.map(block => roundIdOf(block.activityCode)));
  for (const roundId of roundIds) if (!scheduled.has(roundId)) problems.push({ code: "unscheduled", severity: "warning", roundId });
  // Different rounds sharing a stage at the same time (blind events often do, on purpose).
  const blocks = sortByTime(schedule.blocks);
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length && blocks[j].start < blocks[i].end; j += 1) {
      const [a, b] = [blocks[i], blocks[j]];
      if (a.stageId === b.stageId && roundIdOf(a.activityCode) !== roundIdOf(b.activityCode)) problems.push({ code: "stage-overlap", severity: "warning", itemId: b.id, roundId: roundIdOf(b.activityCode), otherRoundId: roundIdOf(a.activityCode) });
    }
  }
  // A round cannot start before the previous round of its event has finished.
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

/** A fresh id that does not clash with imported ones (`b123`, `a45`). */
export function newItemId(prefix: "b" | "a", existing: Array<{ id: string }>) {
  let index = existing.length + 1;
  while (existing.some(item => item.id === `${prefix}n${index}`)) index += 1;
  return `${prefix}n${index}`;
}

export function newStageId(stages: ProStage[]) {
  return Math.max(0, ...stages.map(stage => stage.id)) + 1;
}

/** Rounds with the number of groups the schedule gives them; unscheduled rounds keep theirs. */
export function withScheduledGroups<T extends { id: string; groups: number }>(rounds: T[], slots: Map<string, GroupSlot[]>): T[] {
  return rounds.map(round => slots.has(round.id) ? { ...round, groups: slots.get(round.id)!.length } : round);
}
