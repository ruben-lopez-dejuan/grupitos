/*
 * The proposal as a WCIF file to download (no sync with the WCA yet). It is the stored WCIF with:
 *  - group activities for every column: reused when the WCIF already has one in the same room and
 *    stage at the same start, created otherwise (PRO times, or the round split evenly), and removed
 *    when the proposal no longer uses them;
 *  - the proposal's assignments (competitor and staff-*, with stations) for those groups;
 *  - Groupifier's featured competitors, natshelper person properties and room stages.
 * Everything else (formatVersion, id, other extensions, results) is kept as it was.
 */
import { wcifAssignmentCode, type GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition, WcifActivity, WcifExtension, WcifRoom } from "@/lib/competition-store";
import type { ProPeople } from "@/lib/pro/people";
import { GROUP_EXTENSION_ID, isoToLocal, localToIso, ROOM_EXTENSION_ID, roundIdOf, type GroupSlot, type ProSchedule } from "@/lib/pro/schedule";
import { personKey } from "@/lib/rounds";
import { EVENT_NAMES_EN } from "@/lib/scorecards/scorecards";

const PERSON_EXTENSION_ID = "org.cubingusa.natshelper.v1.Person";
const FEATURED_EXTENSION_ID = "groupifier.ActivityConfig";
const GROUP_CODE = /-g\d+(?:-a\d+)?$/;

export type WcifExportReport = { people: number; assignments: number; groupsReused: number; groupsCreated: number; groupsRemoved: number; skipped: string[] };

function setExtension(extensions: WcifExtension[] | undefined, id: string, change: (data: Record<string, unknown>) => Record<string, unknown>) {
  const list = [...(extensions ?? [])];
  const index = list.findIndex(item => item.id === id);
  const current = index >= 0 && list[index].data && typeof list[index].data === "object" ? list[index].data as Record<string, unknown> : {};
  const next = { id, specUrl: index >= 0 ? list[index].specUrl : undefined, data: change(current) };
  if (!next.specUrl) delete next.specUrl;
  if (index >= 0) list[index] = next;
  else list.push(next);
  return list;
}

/** Property values as natshelper stores them: numbers when they read as numbers. */
const propertyValue = (text: string) => text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text;

export function exportWcif({ competition, assignments, rounds, slots, schedule, people }: {
  competition: StoredCompetition;
  assignments: GeneratedAssignment[];
  rounds: Array<{ id: string; eventId: string; roundNumber: number; groups: number }>;
  /** PRO mode: columns with rooms, stages and times. */
  slots?: Map<string, GroupSlot[]>;
  schedule?: ProSchedule;
  people?: ProPeople;
}): { wcif: StoredCompetition; report: WcifExportReport } {
  const wcif = structuredClone(competition) as StoredCompetition & { importedAt?: string };
  delete wcif.importedAt;
  const venues = wcif.schedule?.venues ?? [];
  const timeZone = venues.find(venue => venue.timezone)?.timezone ?? schedule?.timeZone ?? "UTC";
  const rooms = venues.flatMap(venue => venue.rooms ?? []);
  let nextId = 1 + Math.max(0, ...rooms.flatMap(room => {
    const ids: number[] = [];
    const visit = (activity: WcifActivity) => { ids.push(activity.id); (activity.childActivities ?? []).forEach(visit); };
    (room.activities ?? []).forEach(visit);
    return ids;
  }));
  const report: WcifExportReport = { people: 0, assignments: 0, groupsReused: 0, groupsCreated: 0, groupsRemoved: 0, skipped: [] };
  const exported = new Set(assignments.map(item => item.roundId));
  /** Group activity of each column, per round. */
  const columns = new Map<string, Map<number, WcifActivity>>();
  const used = new Set<number>();
  const local = (iso: string) => isoToLocal(iso, timeZone);
  const stageOf = (activity: WcifActivity) => (activity.extensions?.find(item => item.id === GROUP_EXTENSION_ID)?.data as { stageId?: number } | undefined)?.stageId;
  const roundActivities = (room: WcifRoom, roundId: string) => (room.activities ?? []).filter(activity => roundIdOf(activity.activityCode) === roundId);
  const eventName = (round: { eventId: string; roundNumber: number }) => `${EVENT_NAMES_EN[round.eventId] ?? round.eventId}, Round ${round.roundNumber}`;

  for (const round of rounds.filter(item => exported.has(item.id))) {
    const byColumn = new Map<number, WcifActivity>();
    columns.set(round.id, byColumn);
    const roundSlots = slots?.get(round.id);
    if (roundSlots) {
      for (const slot of roundSlots) {
        const room = rooms.find(item => item.id === slot.roomId);
        const window = slot.windows[0];
        if (!room || !window) continue;
        const attempt = slot.attempt ?? 1;
        const isAttempt = (code: string) => (code.match(/-a(\d+)$/)?.[1] ?? "1") === String(attempt);
        let parent = roundActivities(room, round.id).find(activity => !GROUP_CODE.test(activity.activityCode) && isAttempt(activity.activityCode) && local(activity.startTime) <= window.start && window.end <= local(activity.endTime));
        if (!parent) {
          const hasAttempts = roundSlots.some(item => item.attempt);
          parent = { id: nextId++, name: `${eventName(round)}${hasAttempts ? `, Attempt ${attempt}` : ""}`, activityCode: hasAttempts ? `${round.id}-a${attempt}` : round.id, startTime: localToIso(window.start, timeZone), endTime: localToIso(window.end, timeZone), childActivities: [], extensions: [] };
          room.activities = [...(room.activities ?? []), parent];
        } else {
          // A group outside its round activity widens it.
          if (window.start < local(parent.startTime)) parent.startTime = localToIso(window.start, timeZone);
          if (window.end > local(parent.endTime)) parent.endTime = localToIso(window.end, timeZone);
        }
        const suffix = roundSlots.some(item => item.attempt) ? `-a${attempt}` : "";
        let child = (parent.childActivities ?? []).find(item => GROUP_CODE.test(item.activityCode) && !used.has(item.id) && local(item.startTime) === window.start && stageOf(item) === slot.stageId);
        if (child) report.groupsReused += 1;
        else {
          child = { id: nextId++, name: `${eventName(round)}, Group ${slot.number}`, activityCode: `${round.id}-g${slot.number}${suffix}`, startTime: localToIso(window.start, timeZone), endTime: localToIso(window.end, timeZone), childActivities: [], extensions: slot.stageId === undefined ? [] : [{ id: GROUP_EXTENSION_ID, data: { stageId: slot.stageId } }] };
          parent.childActivities = [...(parent.childActivities ?? []), child];
          report.groupsCreated += 1;
        }
        used.add(child.id);
        byColumn.set(slot.group, child);
      }
    } else {
      // Normal mode: the round's first activity, split evenly like Groupifier.
      const room = rooms.find(item => roundActivities(item, round.id).length);
      const parent = room && roundActivities(room, round.id)[0];
      if (!parent) continue;
      const existing = (parent.childActivities ?? []).filter(item => GROUP_CODE.test(item.activityCode));
      const start = Date.parse(parent.startTime);
      const length = (Date.parse(parent.endTime) - start) / Math.max(1, round.groups);
      for (let group = 1; group <= round.groups; group += 1) {
        let child = existing.find(item => item.activityCode === `${round.id}-g${group}` && !used.has(item.id));
        if (child) report.groupsReused += 1;
        else {
          const iso = (time: number) => new Date(Math.round(time / 60000) * 60000).toISOString().replace(".000", "");
          child = { id: nextId++, name: `${eventName(round)}, Group ${group}`, activityCode: `${round.id}-g${group}`, startTime: iso(start + (group - 1) * length), endTime: iso(start + group * length), childActivities: [], extensions: [] };
          parent.childActivities = [...(parent.childActivities ?? []), child];
          report.groupsCreated += 1;
        }
        used.add(child.id);
        byColumn.set(group, child);
      }
    }
  }

  // Old groups of exported rounds that no column uses go away, with their assignments.
  const removed = new Set<number>();
  for (const room of rooms) for (const activity of room.activities ?? []) {
    const roundId = roundIdOf(activity.activityCode);
    if (!roundId || !columns.has(roundId)) continue;
    activity.childActivities = (activity.childActivities ?? []).filter(child => {
      const stale = GROUP_CODE.test(child.activityCode) && !used.has(child.id);
      if (stale) removed.add(child.id);
      return !stale;
    });
  }
  report.groupsRemoved = removed.size;

  // Assignments: the proposal replaces whatever the exported rounds' groups had.
  const groupIds = new Set([...used, ...removed]);
  const byKey = new Map((wcif.persons ?? []).map(person => [personKey(person), person]));
  for (const person of wcif.persons ?? []) person.assignments = (person.assignments ?? []).filter(item => !groupIds.has(item.activityId));
  const featured = new Map<number, number[]>();
  const withTasks = new Set<string>();
  for (const item of assignments) {
    const person = byKey.get(item.personId);
    const byColumn = columns.get(item.roundId);
    if (!byColumn || !item.tasks.length) continue;
    if (!person) { if (!report.skipped.includes(item.name)) report.skipped.push(item.name); continue; }
    for (const task of item.tasks) {
      const activity = byColumn.get(task.group);
      if (!activity) continue;
      const first = task.role === "competitor" && !(task.attempt && task.attempt > 1);
      person.assignments = [...(person.assignments ?? []), { activityId: activity.id, assignmentCode: wcifAssignmentCode(task.role), stationNumber: first && item.station !== undefined ? item.station : null }];
      report.assignments += 1;
      withTasks.add(item.personId);
      if (first && item.featured && person.wcaUserId !== undefined) featured.set(activity.id, [...(featured.get(activity.id) ?? []), person.wcaUserId]);
    }
  }
  report.people = withTasks.size;
  for (const byColumn of columns.values()) for (const activity of byColumn.values()) {
    activity.extensions = setExtension(activity.extensions, FEATURED_EXTENSION_ID, data => ({ ...data, featuredCompetitorWcaUserIds: featured.get(activity.id) ?? [] }));
  }

  // natshelper: person properties and the stages of each room.
  if (people) for (const person of wcif.persons ?? []) {
    const own = people.properties[personKey(person)];
    if (!own || !Object.keys(own).length) continue;
    person.extensions = setExtension(person.extensions, PERSON_EXTENSION_ID, data => ({ ...data, properties: Object.fromEntries(Object.entries(own).map(([key, value]) => [key, propertyValue(value)])) }));
  }
  if (schedule) for (const room of rooms) {
    const own = schedule.rooms.find(item => item.id === room.id);
    if (!own?.stages.length) continue;
    room.extensions = setExtension(room.extensions, ROOM_EXTENSION_ID, data => ({ ...data, stages: own.stages.map(stage => ({ id: stage.id, name: stage.name, color: stage.color })) }));
  }
  return { wcif, report };
}

export function wcifFileName(competition: StoredCompetition) {
  return `${competition.id}-wcif.json`;
}
