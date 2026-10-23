/*
 * Scorecard documents, ported from Groupifier (https://github.com/jonatanklosko/groupifier),
 * src/logic/documents/scorecards.js, pdf-utils.js and src/logic/formatters.js, licensed under
 * the Apache License 2.0 (see licenses/groupifier-LICENSE.txt).
 *
 * Modified: TypeScript; reads this app's assignments instead of WCIF activities; only the
 * Roboto font is bundled, so non-Latin local names fall back to the Latin name and the
 * Chinese layouts are not offered; no featured-competitor star. See THIRD_PARTY_NOTICES.md.
 */
import { competingGroup, type GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition, WcifPerson, WcifRound } from "@/lib/competition-store";
import { groupSizes } from "@/lib/group-generator";
import { scheduleLanes, targetKey, type GroupSlot, type ProSchedule } from "@/lib/pro/schedule";
import { personKey, usesFixedStations, type RoundConfig, type ZoneMode } from "@/lib/rounds";
import type { PaperSize, PrintingOptions } from "@/lib/scorecards/options";
import { translation, type ScorecardTexts } from "@/lib/scorecards/translations";

/* eslint-disable @typescript-eslint/no-explicit-any -- pdfmake document nodes are loosely typed. */
type Node = any;

/* See: https://github.com/bpampuch/pdfmake/blob/3da11bd8148b190808b06f7bc27883102bf82917/src/standardPageSizes.js#L10 */
const PAPER: Record<PaperSize, { pageWidth: number; pageHeight: number; scorecardsPerRow: number; scorecardsPerPage: number; horizontalMargin: number; verticalMargin: number }> = {
  a4: { pageWidth: 595.28, pageHeight: 841.89, scorecardsPerRow: 2, scorecardsPerPage: 4, horizontalMargin: 15, verticalMargin: 15 },
  a6: { pageWidth: 297.64, pageHeight: 419.53, scorecardsPerRow: 1, scorecardsPerPage: 1, horizontalMargin: 15, verticalMargin: 15 },
  letter: { pageWidth: 612.0, pageHeight: 792.0, scorecardsPerRow: 2, scorecardsPerPage: 4, horizontalMargin: 15, verticalMargin: 10 },
};

const MAX_ATTEMPTS_BY_FORMAT: Record<string, number> = { "1": 1, "2": 2, "3": 3, "5": 5, m: 3, a: 5, h: 5 };
const SHORT_EVENT_NAMES: Record<string, string> = { "333": "3x3", "222": "2x2", "444": "4x4", "555": "5x5", "666": "6x6", "777": "7x7", "333bf": "3BLD", "333fm": "FMC", "333oh": "3OH", "333ft": "3WF", minx: "Minx", pyram: "Pyra", clock: "Clock", skewb: "Skewb", sq1: "Sq1", "444bf": "4BLD", "555bf": "5BLD", "333mbf": "MBLD" };
const EVENT_NAMES_EN: Record<string, string> = { "333": "3x3x3 Cube", "222": "2x2x2 Cube", "444": "4x4x4 Cube", "555": "5x5x5 Cube", "666": "6x6x6 Cube", "777": "7x7x7 Cube", "333bf": "3x3x3 Blindfolded", "333fm": "3x3x3 Fewest Moves", "333oh": "3x3x3 One-Handed", "333ft": "3x3x3 With Feet", minx: "Megaminx", pyram: "Pyraminx", clock: "Clock", skewb: "Skewb", sq1: "Square-1", "444bf": "4x4x4 Blindfolded", "555bf": "5x5x5 Blindfolded", "333mbf": "3x3x3 Multi-Blind" };

/** Languages whose texts need a CJK font, which is not bundled. */
export const UNSUPPORTED_SCORECARD_LANGUAGES = ["cn", "zh"];

type CardCompetitor = { name: string | null; registrantId: number | null; wcaId: string | null; personalBests?: WcifPerson["personalBests"]; featured?: boolean };

/** Groupifier prints featured competitors with a star; Roboto has no ★, so it is drawn. */
const STAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000" d="M12 1.5l3.1 6.9 7.4.7-5.6 5 1.7 7.4L12 17.6l-6.6 3.9 1.7-7.4-5.6-5 7.4-.7z"/></svg>';
const NAMELESS: CardCompetitor = { name: null, registrantId: null, wcaId: null };

const parseActivityCode = (code: string) => {
  const [eventId, ...parts] = code.split("-");
  const value = (prefix: string) => Number(parts.find(part => part.startsWith(prefix))?.slice(1)) || undefined;
  return { eventId, roundNumber: value("r"), groupNumber: value("g") };
};

const times = <T,>(count: number, fn: (index: number) => T) => Array.from({ length: Math.max(0, count) }, (_, index) => fn(index));
const chunk = <T,>(items: T[], size: number): T[][] => items.length <= size ? [items] : [items.slice(0, size), ...chunk(items.slice(size), size)];

/* ---------- formatters (formatters.js) ---------- */

export function centisecondsToClockFormat(centiseconds: number) {
  const date = new Date(0);
  date.setUTCMilliseconds(centiseconds * 10);
  return date.toISOString().substr(11, 11).replace(/^[0:]*(?!\.)/g, "");
}

const multibldResultValueToPoints = (value: number) => 99 - (Math.floor(value / 10000000) % 100);

function cutoffToString(cutoff: NonNullable<WcifRound["cutoff"]>, eventId: string) {
  const value = cutoff.resultValue ?? cutoff.attemptResult ?? 0;
  if (eventId === "333mbf") return `> ${multibldResultValueToPoints(value)} points`;
  if (eventId === "333fm") return `< ${value} moves`;
  return `< ${centisecondsToClockFormat(value)}`;
}

function timeLimitToString(timeLimit: NonNullable<WcifRound["timeLimit"]>, totalText: string) {
  const clock = centisecondsToClockFormat(timeLimit.centiseconds);
  return timeLimit.cumulativeRoundIds.length === 0 ? clock : `${clock} ${totalText}`;
}

function cumulativeRoundsToString(timeLimit: NonNullable<WcifRound["timeLimit"]>) {
  if (timeLimit.cumulativeRoundIds.length <= 1) return null;
  return timeLimit.cumulativeRoundIds.map(roundId => {
    const { eventId, roundNumber } = parseActivityCode(roundId);
    return `${SHORT_EVENT_NAMES[eventId] ?? eventId} R${roundNumber}`;
  }).join(" + ");
}

/* ---------- names (pdf-utils.js) ---------- */

/** Roboto covers Latin, Greek and Cyrillic (U+0000–U+052F). */
const robotoCovers = (text: string) => [...text].every(char => (char.codePointAt(0) ?? 0) <= 0x052f || /\s/.test(char));

export function pdfName(name: string, { swapLatinWithLocalNames = false, short = false } = {}): Node {
  /* Note: support normal and fullwidth parentheses. */
  const [, latinName, localName] = name.match(/(.+)\s*[(（](.+)[)）]/) ?? [null, name, null];
  if (!localName) return latinName;
  if (!robotoCovers(localName)) return latinName!.trim();
  const names = [latinName!.trim(), localName];
  const [first, second] = swapLatinWithLocalNames ? names.reverse() : names;
  return short ? first : [first, " (", second, ")"];
}

/** Background images go through images.weserv.nl, as in Groupifier, to get a faded, CORS-friendly JPEG. */
export async function getImageDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  const params = new URLSearchParams({ url, bri: "50", bg: "white", w: "800", h: "800", t: "letterbox", output: "jpg", encoding: "base64" });
  try {
    const response = await fetch(`https://images.weserv.nl/?${params.toString()}`);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/* ---------- document layout ---------- */

function prepareScorecardsPages(cards: Node[], scorecardsPerPage: number, order: PrintingOptions["order"]) {
  const onLastPage = cards.length % scorecardsPerPage;
  if (onLastPage !== 0) cards = cards.concat(times(scorecardsPerPage - onLastPage, () => ({})));
  if (order === "stacked") {
    const sections = cards.length / scorecardsPerPage;
    cards = cards
      .map((card, index) => ({ index, card }))
      .sort((a, b) => (a.index % sections) - (b.index % sections) || a.index - b.index)
      .map(({ card }) => card);
  }
  return cards;
}

const cutLine = (properties: Record<string, number>) => ({ ...properties, type: "line", lineWidth: 0.1, dash: { length: 10 }, lineColor: "#888888" });

export function scorecardsPdfDefinition(cards: Node[], imageData: string | null, paperSize: PaperSize, backPages = false): Node {
  const { pageWidth, pageHeight, scorecardsPerRow, scorecardsPerPage, horizontalMargin, verticalMargin } = PAPER[paperSize];
  /* Determined empirically to fit results table. */
  const imagePositions = [{ x: 60, y: 170 }, { x: 360, y: 170 }, { x: 60, y: 590 }, { x: 360, y: 590 }].slice(0, scorecardsPerPage);
  const cutLines = scorecardsPerPage === 4 ? {
    canvas: [
      cutLine({ x1: horizontalMargin, y1: pageHeight / 2, x2: pageWidth - horizontalMargin, y2: pageHeight / 2 }),
      cutLine({ x1: pageWidth / 2, y1: verticalMargin, x2: pageWidth / 2, y2: pageHeight - verticalMargin }),
    ],
  } : {};
  return {
    // With back pages, every second page is a back: no background image or cut lines there.
    background: (currentPage: number) => backPages && currentPage % 2 === 0 ? [] : [
      ...(imageData === null ? [] : imagePositions.map(absolutePosition => ({ absolutePosition, image: imageData, width: 200, height: 200 }))),
      cutLines,
    ],
    pageSize: { width: pageWidth, height: pageHeight },
    pageMargins: [horizontalMargin, verticalMargin],
    content: {
      layout: {
        /* Outer margin is done using pageMargins, we use padding for the remaining inner margins. */
        paddingLeft: (i: number) => (i % scorecardsPerRow === 0 ? 0 : horizontalMargin),
        paddingRight: (i: number) => (i % scorecardsPerRow === scorecardsPerRow - 1 ? 0 : horizontalMargin),
        paddingTop: (i: number) => (i % scorecardsPerRow === 0 ? 0 : verticalMargin),
        paddingBottom: (i: number) => (i % scorecardsPerRow === scorecardsPerRow - 1 ? 0 : verticalMargin),
        /* Get rid of borders. */
        hLineWidth: () => 0,
        vLineWidth: () => 0,
      },
      table: {
        widths: Array(scorecardsPerRow).fill("*"),
        heights: pageHeight / scorecardsPerRow - 2 * verticalMargin,
        dontBreakRows: true,
        body: chunk(cards, scorecardsPerRow),
      },
    },
  };
}

/* ---------- scorecards ---------- */

function isFinal(competition: StoredCompetition, roundId: string) {
  const { eventId, roundNumber } = parseActivityCode(roundId);
  const event = competition.events?.find(item => item.id === eventId);
  return roundNumber === event?.rounds?.length;
}

function shouldPrintScrambleChecker(competitor: CardCompetitor, roundId: string | undefined, competition: StoredCompetition, printing: PrintingOptions) {
  const eventId = roundId ? parseActivityCode(roundId).eventId : undefined;
  if (eventId && ["555", "666", "777", "minx"].includes(eventId) && !printing.scrambleCheckerBigCubes) return false;
  if (printing.scrambleCheckerTopRanked && eventId) {
    const single = competitor.personalBests?.find(best => best.eventId === eventId && best.type === "single");
    const average = competitor.personalBests?.find(best => best.eventId === eventId && best.type === "average");
    if ((single?.worldRanking && single.worldRanking <= 50) || (average && ((average.worldRanking && average.worldRanking <= 50) || (average.nationalRanking && average.nationalRanking <= 15 && average.nationalRanking > 0)))) return true;
  }
  return !!(printing.scrambleCheckerFinalRounds && roundId && isFinal(competition, roundId));
}

const noBorder = { border: [false, false, false, false] };
/** pdfmake's default cell padding (4 + 4) plus one border. */
const CELL_CHROME = 9;

/**
 * Keeps a text on one line inside `width` points: shrinks the font down to `min`, then cuts
 * the text. Every card must keep its height, or it pushes the next card off its quarter
 * of the page (Groupifier lets long texts wrap). Roboto averages ~0.55em per character.
 */
export function fitText(text: string, width: number, size: number, { bold = false, min = 6 } = {}) {
  const factor = bold ? 0.6 : 0.55;
  if (!text) return { text, fontSize: size };
  const fontSize = Math.max(min, Math.min(size, Math.floor((width / (text.length * factor)) * 2) / 2));
  const maxChars = Math.floor(width / (fontSize * factor));
  return { text: text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...` : text, fontSize };
}

const LABEL_SIZE = 9;
const label = (text: string, width: number, style: Record<string, unknown> = {}) => ({ ...style, ...noBorder, ...fitText(text, width - CELL_CHROME, LABEL_SIZE, { min: 5 }) });

const attemptRow = (attemptNumber: number | string, needsScrambleChecker: boolean) => [
  { text: attemptNumber, ...noBorder, fontSize: 18, bold: true, alignment: "center" },
  {},
  ...(needsScrambleChecker ? [{}] : []),
  {},
  {},
  {},
];

const attemptsSeparator = (cutoffLine: boolean, scorecardWidth: number, printScrambleChecker: boolean) => [{
  ...noBorder,
  colSpan: 5 + Number(printScrambleChecker),
  // Separator rows only space the attempts; a tiny font keeps them from adding a text line.
  fontSize: 3,
  margin: [0, 0],
  columns: !cutoffLine ? [] : [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: scorecardWidth, y2: 0, dash: { length: 5 } }] }],
}];

const attemptRows = (cutoff: WcifRound["cutoff"], attemptCount: number, scorecardWidth: number, printScrambleChecker: boolean) =>
  times(attemptCount, index => attemptRow(index + 1, printScrambleChecker)).reduce<Node[]>((rows, row, index) =>
    index + 1 === attemptCount ? [...rows, row] : [...rows, row, attemptsSeparator(!!cutoff && index + 1 === cutoff.numberOfAttempts, scorecardWidth, printScrambleChecker)], []);

type ScorecardInput = {
  scorecardNumber?: number;
  stationNumber?: number;
  competitionName: string;
  activityCode?: string;
  round?: WcifRound;
  attemptCount?: number;
  competitor?: CardCompetitor;
  printing: PrintingOptions;
  printStations?: boolean;
  printScrambleCheckerBox: boolean;
  /** PRO mode: the stage, printed small under the group number. */
  stageName?: string;
};

function scorecard({ scorecardNumber, stationNumber, competitionName, activityCode, round, attemptCount = 5, competitor = NAMELESS, printing, printStations = false, printScrambleCheckerBox, stageName }: ScorecardInput): Node {
  const fallback = translation("en");
  const texts = translation(printing.language);
  const t = (key: Exclude<keyof ScorecardTexts, "eventName">) => texts[key] || fallback[key] || "";
  const eventName = (eventId: string) => texts.eventName?.[eventId] || fallback.eventName?.[eventId] || EVENT_NAMES_EN[eventId] || eventId;

  const { eventId, roundNumber, groupNumber } = activityCode ? parseActivityCode(activityCode) : { eventId: undefined, roundNumber: undefined, groupNumber: undefined };
  const { cutoff, timeLimit } = round ?? {};
  const cumulativeRounds = timeLimit ? cumulativeRoundsToString(timeLimit) : null;
  const { pageWidth, scorecardsPerRow, horizontalMargin } = PAPER[printing.paperSize];
  const scorecardWidth = pageWidth / scorecardsPerRow - 2 * horizontalMargin;
  const checker = printScrambleCheckerBox;
  const smallColumns = printStations ? 3 : 2;
  const eventWidth = scorecardWidth - 25 - smallColumns * 30 - (smallColumns + 1) * CELL_CHROME;
  const nameWidth = scorecardWidth - 25 - 30 - 2 * CELL_CHROME;
  const competitorTag = competitor.wcaId || (competitor.name && competitor.registrantId != null ? t("newCompetitor") : " ");
  const nameLabelWidth = Math.min(nameWidth / 2, t("name").length * LABEL_SIZE * 0.55 + 4);
  const resultWidth = scorecardWidth - (16 + 25 * (3 + Number(checker))) - (5 + Number(checker)) * CELL_CHROME;
  const footerWidth = scorecardWidth / 2 - 4;
  const limitText = timeLimit ? `${t("timeLimit")}: ${timeLimitToString(timeLimit, t("total"))}` : "";

  return [
    { fontSize: 10, columns: [{ text: scorecardNumber ? `${scorecardNumber}` : "", alignment: "left" }, competitor.featured ? { svg: STAR_SVG, width: 10, height: 10, alignment: "right" } : {}] },
    { ...fitText(competitionName, scorecardWidth, 15, { bold: true, min: 9 }), bold: true, margin: [0, 0, 0, 6], alignment: "center" },
    {
      margin: [25, 0, 0, 0],
      table: {
        widths: ["*", 30, 30, ...(printStations ? [30] : [])],
        body: [
          [label(t("eventLabel"), eventWidth + CELL_CHROME), label(t("round"), 30 + CELL_CHROME, { alignment: "center" }), label(t("group"), 30 + CELL_CHROME, { alignment: "center" }), ...(printStations ? [label(t("station"), 30 + CELL_CHROME, { alignment: "center" })] : [])],
          [
            eventId ? fitText(eventName(eventId), eventWidth, 12, { min: 7 }) : " ",
            { text: roundNumber ?? "", alignment: "center" },
            stageName
              ? { alignment: "center", stack: [{ text: groupNumber ?? "" }, { ...fitText(stageName, 30, 6, { min: 4 }), color: "#444" }] }
              : { text: groupNumber ?? "", alignment: "center" },
            ...(printStations ? [{ text: stationNumber ?? "", alignment: "center" }] : []),
          ],
        ],
      },
    },
    {
      margin: [25, 0, 0, 0],
      table: {
        widths: [30, "*"],
        body: [
          [
            label(t("id"), 30 + CELL_CHROME),
            {
              ...noBorder,
              columns: [
                { ...fitText(t("name"), nameLabelWidth, LABEL_SIZE, { min: 5 }), alignment: "left", width: nameLabelWidth },
                // registrantId null means a manually entered name, not a registered new competitor.
                { ...fitText(competitorTag, nameWidth - nameLabelWidth, LABEL_SIZE, { min: 5 }), alignment: "right" },
              ],
            },
          ],
          [
            { text: competitor.registrantId ?? " ", alignment: "center" },
            { text: pdfName(competitor.name || " ", { swapLatinWithLocalNames: printing.localNamesFirst, short: printing.printOneName }), maxHeight: 20 },
          ],
        ],
      },
    },
    {
      margin: [0, 6, 0, 0],
      table: {
        /* Note: 16 (width) + 4 + 4 (default left and right padding) + 1 (left border) = 25 */
        widths: [16, 25, ...(checker ? [25] : []), "*", 25, 25],
        body: [
          [
            label("", 16 + CELL_CHROME),
            label(t("scr"), 25 + CELL_CHROME, { alignment: "center" }),
            ...(checker ? [label(t("check"), 25 + CELL_CHROME, { alignment: "center" })] : []),
            label(t("result"), resultWidth + CELL_CHROME, { alignment: "center" }),
            label(t("judge"), 25 + CELL_CHROME, { alignment: "center" }),
            label(t("comp"), 25 + CELL_CHROME, { alignment: "center" }),
          ],
          ...attemptRows(cutoff, attemptCount, scorecardWidth, checker),
          [{ ...fitText(`${t("extra")} (${t("delegateInitials")} _______)`, scorecardWidth - CELL_CHROME, 10, { min: 6 }), ...noBorder, colSpan: 5 + Number(checker), margin: [0, 1] }],
          attemptRow("_", checker),
          [{ text: "", ...noBorder, colSpan: 5 + Number(checker), fontSize: 3, margin: [0, 0] }],
        ],
      },
    },
    {
      fontSize: 10,
      columns: [
        cutoff && eventId ? { ...fitText(`${t("cutoff")}: ${cutoffToString(cutoff, eventId)}`, footerWidth, 10, { min: 6 }), alignment: "center" } : {},
        timeLimit ? {
          alignment: "center",
          stack: [
            fitText(limitText, footerWidth, 10, { min: 6 }),
            ...(cumulativeRounds ? [fitText(`(${cumulativeRounds})`, footerWidth, 7, { min: 5 })] : []),
          ],
        } : {},
      ],
    },
  ];
}

const initialsField = (person: string) => ({ text: [{ text: `${person} initials`, bold: true }, " ______"], alignment: "center", fontSize: 10 });

function coverSheet({ competitionName, activityCode, numberOfScorecards, roomName }: { competitionName: string; activityCode: string; numberOfScorecards: number; roomName: string }): Node {
  const { eventId, roundNumber, groupNumber } = parseActivityCode(activityCode);
  return [
    { text: competitionName, bold: true, fontSize: 15, margin: [0, 6], alignment: "center" },
    { text: `${EVENT_NAMES_EN[eventId] ?? eventId} Round ${roundNumber}`, fontSize: 15, margin: [0, 6], alignment: "center" },
    { text: `Group ${groupNumber} (${roomName})`, fontSize: 15, margin: [0, 6], alignment: "center" },
    { text: "-------------------- FOR DELEGATE --------------------", alignment: "center", margin: [0, 6] },
    { text: ["1. Bundled all ", { text: numberOfScorecards, bold: true }, " scorecards [  ]"], fontSize: 10, alignment: "left", margin: [20, 6, 0, 6] },
    { text: "2. Checked for missing signatures [  ]", fontSize: 10, alignment: "left", margin: [20, 6, 0, 6] },
    { text: "3. Number of scorecards with incidents: ______", fontSize: 10, margin: [20, 6, 0, 6] },
    initialsField("Delegate"),
    { text: "-------------------- FOR DATA ENTRY --------------------", alignment: "center", margin: [0, 6] },
    { text: "4. Results entered by Scoretaker", fontSize: 10, margin: [20, 6, 0, 6] },
    initialsField("Scoretaker"),
    { text: "5. Incidents logged by Delegate", fontSize: 10, margin: [20, 6, 0, 6] },
    initialsField("Delegate"),
    { text: "6. Results checked by Delegate", fontSize: 10, margin: [20, 6, 0, 6] },
    initialsField("Delegate"),
  ];
}

function findRound(competition: StoredCompetition, roundId: string) {
  for (const event of competition.events ?? []) for (const round of event.rounds ?? []) if (round.id === roundId) return round;
  return undefined;
}

export type ScorecardSource = {
  competition: StoredCompetition;
  assignments: GeneratedAssignment[];
  rounds: RoundConfig[];
  stations: number;
  zoneMode: ZoneMode;
  printing: PrintingOptions;
  /** PRO mode: group numbers and stages come from the schedule. */
  schedule?: ProSchedule;
  slots?: Map<string, GroupSlot[]>;
};

/** Which matrix columns of a round to print; all of them when absent. */
export type GroupFilter = (roundId: string, group: number) => boolean;

/**
 * Scorecards for the chosen rounds. Rounds with assignments get one card per competitor,
 * grouped and numbered as in Groupifier; planned rounds without known competitors get
 * nameless cards sized from the expected number of competitors.
 */
export function roundScorecards({ competition, assignments, rounds, stations, zoneMode, printing, schedule, slots }: ScorecardSource, roundIds: string[], includeGroup: GroupFilter = () => true) {
  const persons = new Map((competition.persons ?? []).map(person => [personKey(person), person]));
  const competitionName = competition.shortName ?? competition.name;
  const roomName = competition.schedule?.venues?.[0]?.rooms?.[0]?.name ?? "";
  const { scorecardsPerPage } = PAPER[printing.paperSize];
  const lanes = schedule ? scheduleLanes(schedule) : [];
  const laneOrder = new Map(lanes.map((lane, index) => [lane.key, index]));

  const cards = roundIds.flatMap(roundId => {
    const config = rounds.find(round => round.id === roundId);
    const wcifRound = findRound(competition, roundId);
    if (!config || !wcifRound) return [];
    const attemptCount = MAX_ATTEMPTS_BY_FORMAT[wcifRound.format ?? "a"] ?? 5;
    const rows = assignments.filter(item => item.roundId === roundId && competingGroup(item) !== undefined);
    const fixed = usesFixedStations(config.roundNumber, rows.length || config.competitors, stations, zoneMode);

    // Later multi-blind attempts are columns of their own with the same people: cards come from attempt 1.
    const attemptColumns = new Set((slots?.get(roundId) ?? []).filter(slot => slot.linkedTo).map(slot => slot.group));
    const groups: Array<{ group: number; competitors: Array<{ competitor: CardCompetitor; station?: number }> }> = (rows.length
      ? times(config.groups, index => ({
        group: index + 1,
        competitors: rows
          .filter(item => competingGroup(item) === index + 1)
          .sort((a, b) => (b.seedResult ?? Number.MAX_SAFE_INTEGER) - (a.seedResult ?? Number.MAX_SAFE_INTEGER) || (a.station ?? 0) - (b.station ?? 0) || a.name.localeCompare(b.name))
          .map(item => {
            const person = persons.get(item.personId);
            return { competitor: { name: item.name, registrantId: person?.registrantId ?? null, wcaId: item.wcaId ?? null, personalBests: person?.personalBests, featured: item.featured }, station: item.station };
          }),
      }))
      : groupSizes(config.competitors, config.groups - attemptColumns.size).map((size, index) => ({ group: index + 1, competitors: times(size, () => ({ competitor: NAMELESS })) }))).filter(item => !attemptColumns.has(item.group));

    // PRO: print each stage's groups together, in time order, with the number people know.
    const roundSlots = slots?.get(roundId);
    const slotOf = (group: number) => roundSlots?.find(slot => slot.group === group);
    const laneOf = (group: number) => {
      const slot = slotOf(group);
      return slot ? lanes.find(lane => lane.key === targetKey(slot.roomId, slot.stageId)) : undefined;
    };
    const printed = groups
      .filter(({ group }) => includeGroup(roundId, group))
      .sort((a, b) => roundSlots ? (laneOrder.get(laneOf(a.group)?.key ?? "") ?? 0) - (laneOrder.get(laneOf(b.group)?.key ?? "") ?? 0) || a.group - b.group : 0);
    const stagesInRound = new Set(roundSlots?.map(slot => targetKey(slot.roomId, slot.stageId)));
    // Numbers count down over the whole round, so a filtered print keeps each card's number.
    const total = groups.reduce((sum, item) => sum + item.competitors.length, 0);
    const firstNumber = (group: number) => total - groups.filter(item => item.group < group).reduce((sum, item) => sum + item.competitors.length, 0);
    return printed.flatMap(({ group, competitors }) => {
      let scorecardNumber = firstNumber(group);
      const activityCode = `${roundId}-g${slotOf(group)?.number ?? group}`;
      const stageName = stagesInRound.size > 1 && printing.stageInGroupCell ? laneOf(group)?.name : undefined;
      let inGroupNumber = competitors.length;
      const groupCards: Node[] = competitors.map(({ competitor, station }) => withBackLabel(competitor.registrantId, scorecard({
        scorecardNumber: scorecardNumber--,
        stationNumber: station ?? inGroupNumber--,
        competitionName,
        activityCode,
        round: wcifRound,
        attemptCount,
        competitor,
        printing,
        printStations: !!station || (!competitor.registrantId && fixed),
        printScrambleCheckerBox: shouldPrintScrambleChecker(competitor, roundId, competition, printing),
        stageName,
      })));
      if (printing.coverSheets) groupCards.unshift(coverSheet({ competitionName, activityCode, numberOfScorecards: competitors.length, roomName: laneOf(group)?.name ?? roomName }));
      const onLastPage = groupCards.length % scorecardsPerPage;
      return onLastPage === 0 || printing.order === "stacked" ? groupCards : groupCards.concat(times(scorecardsPerPage - onLastPage, () => ({})));
    });
  });

  const pages = prepareScorecardsPages(cards, scorecardsPerPage, printing.order);
  return printing.registrantOnBack ? withBackPages(pages, printing.paperSize) : pages;
}

/** Registrant id to print on the back of a scorecard (cover sheets and padding have none). */
const BACK_LABELS = new WeakMap<object, string>();

function withBackLabel(registrantId: number | null | undefined, card: Node) {
  if (registrantId !== null && registrantId !== undefined && card && typeof card === "object") BACK_LABELS.set(card as object, String(registrantId));
  return card;
}

/**
 * After every page of scorecards, a page with each card's registrant id in large type. Each row
 * is mirrored, so with long-edge duplex printing every number lands behind its own scorecard.
 */
export function withBackPages(cards: Node[], paperSize: PaperSize): Node[] {
  const { pageWidth, scorecardsPerRow, scorecardsPerPage, horizontalMargin } = PAPER[paperSize];
  const cellWidth = pageWidth / scorecardsPerRow - 2 * horizontalMargin;
  const back = (card: Node): Node => {
    const label = card && typeof card === "object" ? BACK_LABELS.get(card as object) : undefined;
    return label ? { ...fitText(label, cellWidth - 20, 140, { bold: true, min: 40 }), bold: true, alignment: "center", margin: [0, 120, 0, 0] } : {};
  };
  const result: Node[] = [];
  for (let start = 0; start < cards.length; start += scorecardsPerPage) {
    const page = cards.slice(start, start + scorecardsPerPage);
    result.push(...page);
    for (let row = 0; row < page.length; row += scorecardsPerRow) result.push(...page.slice(row, row + scorecardsPerRow).reverse().map(back));
  }
  return result;
}

/** A page of blank scorecards for every distinct attempt count (FMC excluded), as in Groupifier. */
export function blankScorecards({ competition, printing }: Pick<ScorecardSource, "competition" | "printing">) {
  const attemptCounts = [...new Set((competition.events ?? []).filter(event => event.id !== "333fm").flatMap(event => event.rounds ?? []).map(round => MAX_ATTEMPTS_BY_FORMAT[round.format ?? "a"] ?? 5))];
  const { scorecardsPerPage } = PAPER[printing.paperSize];
  return attemptCounts.flatMap(attemptCount => times(scorecardsPerPage, () => scorecard({
    competitionName: competition.shortName ?? competition.name,
    attemptCount,
    printing,
    printScrambleCheckerBox: printing.scrambleCheckerBlank,
  })));
}
