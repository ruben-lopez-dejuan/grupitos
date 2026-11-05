import { describe, expect, it } from "vitest";
// @ts-expect-error -- pdfmake's server build ships without types
import pdfmake from "pdfmake";
import type { TaskRole } from "@/lib/assignments";
import { demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { groupSlots, withScheduledGroups, type ProSchedule } from "@/lib/pro/schedule";
import { initialRounds } from "@/lib/rounds";
import { competitorCardsContent, competitorCardsEvenlySpacedPdfDefinition, competitorCardsPdfDefinition, groupOverviewGroups, groupOverviewPdfDefinition, stageCodes, type DocumentLabels } from "@/lib/scorecards/group-documents";
import { DEFAULT_PRINTING } from "@/lib/scorecards/options";

const fonts = "node_modules/pdfmake/fonts/Roboto/";
pdfmake.addFonts({ Roboto: { normal: `${fonts}Roboto-Regular.ttf`, bold: `${fonts}Roboto-Medium.ttf`, italics: `${fonts}Roboto-Italic.ttf`, bolditalics: `${fonts}Roboto-MediumItalic.ttf` } });

async function pageCount(definition: unknown) {
  const buffer: Buffer = await pdfmake.createPdf(definition).getBuffer();
  return (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

const roles = (suffix: string) => ({ competitor: `competitor${suffix}`, judge: `judge${suffix}`, scrambler: `scrambler${suffix}`, runner: `runner${suffix}`, delegate: `delegate${suffix}`, stagelead: `lead${suffix}`, announcer: `announcer${suffix}`, dataentry: `data${suffix}`, other: `other${suffix}` }) as Record<TaskRole, string>;
const labels: DocumentLabels = {
  locale: "en",
  eventName: id => id,
  round: number => `Round ${number}`,
  group: number => `Group ${number}`,
  attempt: number => `Attempt ${number}`,
  time: value => `Time: ${value}`,
  room: value => `Room: ${value}`,
  stage: value => `Stage: ${value}`,
  page: (current, total) => `${current} of ${total}`,
  people: roles("s"),
  duty: roles(""),
  event: "Event",
  id: "ID",
  wcaId: "WCA ID",
};

const competition = demoCompetition("small");
const rounds = initialRounds(competition, 12, "fixed");
const assignments = generateAssignments({ competition, rounds, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS });
const source = { competition, assignments, rounds, stations: 12, zoneMode: "fixed" as const, printing: DEFAULT_PRINTING };
const generated = [...new Set(assignments.map(item => item.roundId))];

describe("group overview", () => {
  it("has everyone in a round, each in their group, competitors first", () => {
    const groups = groupOverviewGroups(source, ["333-r1"], labels);
    expect(groups.map(group => group.number)).toEqual(Array.from({ length: rounds.find(round => round.id === "333-r1")!.groups }, (_, index) => index + 1));
    const listed = groups.flatMap(group => group.people.filter(([role]) => role === "competitor").flatMap(([, names]) => names));
    expect(listed.length).toBe(assignments.filter(item => item.roundId === "333-r1" && item.tasks.some(task => task.role === "competitor")).length);
    for (const group of groups) expect(group.people[0][0]).toBe("competitor");
  });

  it("lists every duty, with Groupifier's three first", () => {
    const forced = assignments.map((item, index) => item.roundId === "333-r1" && index === 0 ? { ...item, tasks: [...item.tasks.filter(task => task.group !== 1), { group: 1, role: "announcer" as const }] } : item);
    const [first] = groupOverviewGroups({ ...source, assignments: forced }, ["333-r1"], labels);
    const order = first.people.map(([role]) => role);
    expect(order).toContain("announcer");
    expect(order.indexOf("announcer")).toBeGreaterThan(order.indexOf("competitor"));
  });

  it("skips rounds without a proposal", () => {
    expect(groupOverviewGroups({ ...source, assignments: [] }, ["333-r1"], labels)).toEqual([]);
  });

  it("makes one PDF of all rounds, with each group whole", async () => {
    const groups = groupOverviewGroups(source, generated, labels);
    expect(await pageCount(groupOverviewPdfDefinition(groups, labels, "a4"))).toBeGreaterThan(0);
  }, 30000);
});

describe("with stages", () => {
  const rooms = [{ id: 1, name: "Pabellón", color: "#d93636", stages: [{ id: 0, name: "Gipuzkoa", color: "#d93636" }, { id: 1, name: "Bizkaia", color: "#2f9e44" }] }];
  const schedule: ProSchedule = { timeZone: "UTC", days: ["2026-12-05"], rooms, activities: [], blocks: [0, 1].flatMap(stageId => [{ id: `b${stageId}`, activityCode: "333-r1", roomId: 1, stageId, start: "2026-12-05T10:00", end: "2026-12-05T11:00", groups: 2 }, { id: `c${stageId}`, activityCode: "222-r1", roomId: 1, stageId, start: "2026-12-05T09:00", end: "2026-12-05T10:00", groups: 1 }]) };
  const slots = groupSlots(schedule);
  const staged = withScheduledGroups(rounds, slots);
  const withStages = generateAssignments({ competition, rounds: staged, stations: 12, zoneMode: "fixed", people: peopleFromWcif(competition), options: DEFAULT_OPTIONS, slots });
  const stagedSource = { ...source, rounds: staged, assignments: withStages, schedule, slots };

  it("orders groups by time, with their stage and local time", () => {
    const groups = groupOverviewGroups(stagedSource, ["333-r1", "222-r1"], labels);
    expect(groups[0].title).toContain("222");
    expect(groups[0].time).toContain("09:00–10:00");
    expect(groups.map(group => group.stage)).toEqual(expect.arrayContaining(["Bizkaia", "Gipuzkoa"]));
  });

  it("follows the stage filter", () => {
    const only = (roundId: string, group: number) => slots.get(roundId)?.find(slot => slot.group === group)?.stageId === 1;
    const groups = groupOverviewGroups(stagedSource, ["333-r1"], labels, only);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every(group => group.stage === "Bizkaia")).toBe(true);
  });

  it("tells stages apart on the task sheets, with a legend", () => {
    const { cards, legend } = competitorCardsContent(stagedSource, ["333-r1"], labels);
    expect(legend).toBe("G: Gipuzkoa · B: Bizkaia");
    expect(JSON.stringify(cards)).toMatch(/"text":"[12][BG]/);
  });

  it("uses longer initials when stages share one", () => {
    const codes = stageCodes([{ key: "a", roomId: 1, stageId: 0, name: "Sala A", color: "", roomName: "" }, { key: "b", roomId: 1, stageId: 1, name: "Sala B", color: "", roomName: "" }]);
    expect([...codes.values()]).toEqual(["SALA A", "SALA B"]);
  });
});

describe("task sheets", () => {
  it("gives each person with a task one card, by name, in the chosen rounds", () => {
    const { cards, legend } = competitorCardsContent(source, ["333-r1"], labels);
    const people = new Set(assignments.filter(item => item.roundId === "333-r1" && item.tasks.length).map(item => item.personId));
    expect(cards.length).toBe(people.size);
    expect(legend).toBe("");
    const names = cards.map(card => JSON.stringify(card.stack[0].text));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("keeps cards whole in both layouts", async () => {
    const { cards, legend } = competitorCardsContent(source, generated, labels);
    expect(cards.length).toBeGreaterThan(4);
    expect(await pageCount(competitorCardsPdfDefinition(cards, legend, "a4"))).toBeGreaterThan(0);
    expect(await pageCount(competitorCardsEvenlySpacedPdfDefinition(cards, legend, "a4"))).toBe(Math.ceil(cards.length / 4));
    expect(await pageCount(competitorCardsEvenlySpacedPdfDefinition(cards, "G: Gipuzkoa · B: Bizkaia", "letter"))).toBe(Math.ceil(cards.length / 4));
  }, 30000);
});
