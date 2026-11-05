/*
 * Group overview and competitor cards ("hojas de tareas"), ported from Groupifier
 * (https://github.com/jonatanklosko/groupifier), src/logic/documents/group-overview.js and
 * competitor-cards.js, licensed under the Apache License 2.0 (see licenses/groupifier-LICENSE.txt).
 *
 * Modified: TypeScript; reads this app's assignments instead of WCIF activities; texts in the
 * app's language; every duty is listed, not only scramblers, runners and judges; the rounds are the
 * ones chosen to print, not always the first ones; a card only for people with a task in them;
 * groups that share a number across stages carry the stage's initial. See THIRD_PARTY_NOTICES.md.
 */
import { competingGroups, DUTY_ROLES, type GeneratedAssignment, type TaskRole } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import { roundIdOf, scheduleLanes, targetKey, type GroupSlot, type ScheduleLane } from "@/lib/pro/schedule";
import { personKey, type RoundConfig } from "@/lib/rounds";
import type { PaperSize } from "@/lib/scorecards/options";
import { competitorCardOrder, pdfName, type GroupFilter, type ScorecardSource } from "@/lib/scorecards/scorecards";

/* eslint-disable @typescript-eslint/no-explicit-any -- pdfmake document nodes are loosely typed. */
type Node = any;

/** Every printed text, in the app's language. */
export type DocumentLabels = {
  locale: string;
  eventName: (eventId: string) => string;
  /** "Round {number}" and so on. */
  round: (number: number) => string;
  group: (number: number) => string;
  attempt: (number: number) => string;
  time: (value: string) => string;
  room: (value: string) => string;
  stage: (value: string) => string;
  page: (current: number, total: number) => string;
  /** Overview columns ("Judges") and card columns ("Judge"). */
  people: Record<TaskRole, string>;
  duty: Record<TaskRole, string>;
  event: string;
  id: string;
  wcaId: string;
};

/** Competitors first, then Groupifier's order; the other duties only appear when someone has them. */
const ROLE_ORDER: TaskRole[] = ["competitor", "scrambler", "runner", "judge", ...DUTY_ROLES.filter(role => !["scrambler", "runner", "judge"].includes(role))];

/** A6 is for single scorecards: these documents print on the page size it is cut from. */
const pageOf = (paperSize: PaperSize) => paperSize === "letter" ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 };

const generatedRounds = (rounds: RoundConfig[], assignments: GeneratedAssignment[], roundIds: string[]) =>
  roundIds.flatMap(id => rounds.find(round => round.id === id) ?? []).filter(round => assignments.some(item => item.roundId === round.id));

/* ---------- group overview ---------- */

type OverviewGroup = { title: string; start?: number; number: number; time?: string; room?: string; stage?: string; people: Array<[TaskRole, string[]]> };

/** A local time ("2026-12-05T10:00") goes through the UTC formatter, so that it stays as it is. */
function timeRange(start: Date, end: Date, timeZone: string | undefined, locale: string) {
  const options = { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone } as const;
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(start);
  return `${day} ${new Intl.DateTimeFormat(locale, options).format(start)}–${new Intl.DateTimeFormat(locale, options).format(end)}`;
}

const localDate = (time: string) => new Date(`${time.slice(0, 16)}:00Z`);

/** Normal mode has no group times of its own: the round's first activity, split evenly, as when publishing. */
function evenWindows(competition: StoredCompetition, round: RoundConfig) {
  for (const venue of competition.schedule?.venues ?? []) for (const room of venue.rooms ?? []) {
    const parent = room.activities?.find(activity => roundIdOf(activity.activityCode) === round.id);
    if (!parent) continue;
    const start = Date.parse(parent.startTime);
    const length = (Date.parse(parent.endTime) - start) / Math.max(1, round.groups);
    return { room: room.name, timeZone: venue.timezone, at: (group: number) => [new Date(start + (group - 1) * length), new Date(start + group * length)] as const };
  }
  return undefined;
}

export function groupOverviewGroups({ competition, assignments, rounds, schedule, slots }: ScorecardSource, roundIds: string[], labels: DocumentLabels, includeGroup: GroupFilter = () => true): OverviewGroup[] {
  const persons = new Map((competition.persons ?? []).map(person => [personKey(person), person]));
  const lanes = schedule ? scheduleLanes(schedule) : [];
  return generatedRounds(rounds, assignments, roundIds).flatMap(round => {
    const rows = assignments.filter(item => item.roundId === round.id);
    const cardOrder = competitorCardOrder(competition, persons, round.id);
    const even = evenWindows(competition, round);
    const columns = [...new Set([...Array.from({ length: round.groups }, (_, index) => index + 1), ...(slots?.get(round.id) ?? []).map(slot => slot.group)])];
    return columns.filter(group => includeGroup(round.id, group)).flatMap((group): OverviewGroup[] => {
      const slot = slots?.get(round.id)?.find(item => item.group === group);
      const lane = slot ? lanes.find(item => item.key === targetKey(slot.roomId, slot.stageId)) : undefined;
      const window = slot?.windows[0];
      const people = ROLE_ORDER.map((role): [TaskRole, string[]] => {
        const holders = rows.filter(item => item.tasks.some(task => task.group === group && task.role === role));
        // Competitors as on the scorecards, best first and so numbered from 1; the rest by name.
        const sorted = role === "competitor"
          ? holders.sort((a, b) => -cardOrder(a, b) || (a.station ?? Number.MAX_SAFE_INTEGER) - (b.station ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, labels.locale))
          : holders.sort((a, b) => a.name.localeCompare(b.name, labels.locale));
        return [role, sorted.map(item => pdfName(item.name, { short: true }) as string)];
      }).filter(([, names]) => names.length > 0);
      if (!people.length) return [];
      const number = slot?.number ?? group;
      const title = [labels.eventName(round.eventId), labels.round(round.roundNumber), labels.group(number), ...(slot?.attempt ? [labels.attempt(slot.attempt)] : [])].join(", ");
      if (window) return [{ title, number, people, start: localDate(window.start).getTime(), time: timeRange(localDate(window.start), localDate(window.end), "UTC", labels.locale), room: lane?.roomName, stage: slot?.stageId !== undefined ? lane?.name : undefined }];
      if (slots?.has(round.id) || !even) return [{ title, number, people }];
      const [start, end] = even.at(group);
      return [{ title, number, people, start: start.getTime(), time: timeRange(start, end, even.timeZone, labels.locale), room: even.room }];
    });
  }).sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || a.number - b.number);
}

export function groupOverviewPdfDefinition(groups: OverviewGroup[], labels: DocumentLabels, paperSize: PaperSize): Node {
  return {
    pageSize: pageOf(paperSize),
    footer: (currentPage: number, pageCount: number) => ({ text: labels.page(currentPage, pageCount), alignment: "center", fontSize: 10 }),
    content: groups.map(group => ({
      unbreakable: true,
      margin: [0, 0, 0, 10],
      stack: [
        { text: group.title, bold: true, fontSize: 14 },
        {
          columns: [
            ...(group.time ? [labels.time(group.time)] : []),
            ...(group.room ? [labels.room(group.room)] : []),
            ...(group.stage ? [labels.stage(group.stage)] : []),
          ],
          margin: [0, 5, 0, 5],
        },
        {
          fontSize: 8,
          columns: group.people.map(([role, names]) => [
            { text: `${labels.people[role]} (${names.length})`, bold: true, fontSize: 10, margin: [0, 0, 0, 2] },
            { [role === "competitor" ? "ol" : "ul"]: names },
          ]),
        },
      ],
    })),
  };
}

/* ---------- competitor cards ---------- */

/** The shortest initials that tell the stages apart: B and G for Bizkaia and Gipuzkoa. */
export function stageCodes(lanes: ScheduleLane[]) {
  const stages = lanes.filter(lane => lane.stageId !== undefined);
  if (stages.length < 2) return new Map<string, string>();
  const longest = Math.max(...stages.map(lane => lane.name.length));
  let size = 1;
  while (size < longest && new Set(stages.map(lane => lane.name.slice(0, size).toUpperCase())).size < stages.length) size += 1;
  return new Map(stages.map(lane => [lane.key, lane.name.slice(0, size).toUpperCase()]));
}

function groupLabeler(slots: Map<string, GroupSlot[]> | undefined, codes: Map<string, string>) {
  return (roundId: string, group: number) => {
    const slot = slots?.get(roundId)?.find(item => item.group === group);
    if (!slot) return { label: String(group), code: undefined };
    const code = codes.get(targetKey(slot.roomId, slot.stageId));
    return { label: `${slot.number}${code ?? ""}`, code };
  };
}

export function competitorCardsContent({ competition, assignments, rounds, printing, schedule, slots }: ScorecardSource, roundIds: string[], labels: DocumentLabels) {
  const chosen = generatedRounds(rounds, assignments, roundIds);
  const lanes = schedule ? scheduleLanes(schedule) : [];
  const codes = stageCodes(lanes);
  const labeler = groupLabeler(slots, codes);
  const usedCodes = new Set<string>();
  const persons = new Map((competition.persons ?? []).map(person => [personKey(person), person]));
  const ids = new Set(chosen.map(round => round.id));
  const byPerson = new Map<string, GeneratedAssignment[]>();
  for (const item of assignments) if (ids.has(item.roundId) && item.tasks.length) byPerson.set(item.personId, [...(byPerson.get(item.personId) ?? []), item]);
  /** Rounds of an event get a number only when the event appears more than once. */
  const repeated = (eventId: string) => chosen.filter(round => round.eventId === eventId).length > 1;
  const rowName = (round: RoundConfig) => repeated(round.eventId) || round.roundNumber > 1 ? `${labels.eventName(round.eventId)} R${round.roundNumber}` : labels.eventName(round.eventId);

  const cards = [...byPerson.entries()]
    .map(([personId, items]) => ({ person: persons.get(personId), name: items[0].name, wcaId: items[0].wcaId, items }))
    .sort((a, b) => a.name.localeCompare(b.name, labels.locale))
    .map(({ person, name, wcaId, items }): Node => {
      const groupsOf = (item: GeneratedAssignment, role: TaskRole) => role === "competitor" ? competingGroups(item) : item.tasks.filter(task => task.role === role).map(task => task.group);
      const roles = ROLE_ORDER.filter(role => items.some(item => groupsOf(item, role).length > 0));
      const cell = (round: RoundConfig, role: TaskRole) => {
        const item = items.find(row => row.roundId === round.id);
        const groups = item ? [...groupsOf(item, role)].sort((a, b) => a - b).map(group => labeler(round.id, group)) : [];
        for (const { code } of groups) if (code) usedCodes.add(code);
        return { text: [...new Set(groups.map(group => group.label))].join(", "), alignment: "center" };
      };
      const id = person?.registrantId;
      return {
        stack: [
          { text: pdfName(name, { swapLatinWithLocalNames: printing.localNamesFirst, short: printing.printOneName }), fontSize: 10, maxHeight: 20 },
          { columns: [`${labels.id}: ${id ?? ""}`, { text: wcaId ? `${labels.wcaId}: ${wcaId}` : "", alignment: "right" }] },
          {
            table: {
              widths: ["auto", ...roles.map(() => "*")],
              body: [
                [labels.event, ...roles.map(role => ({ text: labels.duty[role], alignment: "center" }))],
                ...chosen.map(round => [rowName(round), ...roles.map(role => cell(round, role))]),
              ],
            },
            layout: { paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1, paddingBottom: () => 1 },
          },
          // Some empty space if there are few events.
          ...Array.from({ length: Math.max(0, 12 - chosen.length) }, () => ({ text: " " })),
        ],
      };
    });
  const legend = lanes.filter(lane => usedCodes.has(codes.get(lane.key) ?? "")).map(lane => `${codes.get(lane.key)}: ${lane.name}`).join(" · ");
  return { cards, legend };
}

const LEGEND_SPACE = 16;
const legendFooter = (legend: string) => legend ? { text: legend, alignment: "center", fontSize: 7, margin: [0, 2, 0, 0] } : undefined;
const inRows = (cards: Node[], perRow: number) => {
  const padded = cards.length % perRow ? [...cards, ...Array.from({ length: perRow - cards.length % perRow }, () => ({}))] : cards;
  return Array.from({ length: padded.length / perRow }, (_, index) => padded.slice(index * perRow, (index + 1) * perRow));
};

/** Three cards a row, as many rows as fit. */
export function competitorCardsPdfDefinition(cards: Node[], legend: string, paperSize: PaperSize): Node {
  return {
    pageSize: pageOf(paperSize),
    pageMargins: [5, 5, 5, legend ? LEGEND_SPACE : 5],
    footer: legendFooter(legend),
    content: inRows(cards, 3).map(row => ({ columns: row, margin: [5, 5], columnGap: 10, fontSize: 8, unbreakable: true })),
  };
}

/** Four evenly spaced cards a page, for cutting. */
export function competitorCardsEvenlySpacedPdfDefinition(cards: Node[], legend: string, paperSize: PaperSize): Node {
  const { width, height } = pageOf(paperSize);
  const cardsPerRow = 2;
  const margin = 20;
  return {
    pageSize: { width, height },
    pageMargins: [margin, margin],
    footer: legendFooter(legend),
    content: {
      fontSize: 8,
      layout: {
        paddingLeft: (i: number) => (i % cardsPerRow === 0 ? 0 : margin),
        paddingRight: (i: number) => (i % cardsPerRow === cardsPerRow - 1 ? 0 : margin),
        paddingTop: (i: number) => (i % cardsPerRow === 0 ? 0 : margin),
        paddingBottom: (i: number) => (i % cardsPerRow === cardsPerRow - 1 ? 0 : margin),
        hLineWidth: () => 0,
        vLineWidth: () => 0,
      },
      table: { widths: Array(cardsPerRow).fill("*"), heights: height / cardsPerRow - 2 * margin, dontBreakRows: true, body: inRows(cards, cardsPerRow) },
    },
  };
}
