/*
 * PRO templates: the rules part of a PRO setup as a JSON file that works in another competition.
 * Rooms and stages are saved by name and team busy times by day number (0 = first day), because
 * ids and dates change between competitions. Nothing personal is saved: no properties, volunteers
 * or unavailabilities, and no schedule (it comes from each competition's WCIF).
 */
import type { WorkspaceSettings } from "@/lib/draft";
import { normalizeOptions, type AssignmentOptions } from "@/lib/group-generator";
import type { AssignmentSetConfig } from "@/lib/pro/assignment-sets";
import { EMPTY_PRO_PEOPLE } from "@/lib/pro/people";
import { normalizeScoring, type ScoringConfig } from "@/lib/pro/scoring";
import { normalizeJobs, normalizeSegments, type JobEligibility, type Segment } from "@/lib/pro/segments";
import { newStageId, roundIdOf, scheduleLanes, type LaneStaffing, type ProRoundBlock, type ProSchedule } from "@/lib/pro/schedule";
import type { StationRuleConfig } from "@/lib/pro/station-rules";
import { normalizeTeams, type ClusterBusy, type TeamBusy, type TeamSetup } from "@/lib/pro/teams";
import type { PrintingOptions } from "@/lib/scorecards/options";

export const TEMPLATE_FORMAT = "grupitos/pro-template";
/** Templates saved under the app's first name (WCA Easy Groups) are still read. */
const OLD_TEMPLATE_FORMAT = "wca-easy-groups/pro-template";

/** A team busy time on the competition's n-th day. */
export type TemplateBusy = Omit<TeamBusy, "day"> & { dayIndex: number };

/**
 * A room's stages by name, and which of them each round uses. Applying it adds the missing stages
 * and moves the room's rounds onto them, so the room itself is no longer a column with tasks.
 */
export type TemplateStageLayout = {
  room: string;
  stages: Array<{ name: string; color: string }>;
  /** By round id: its stages (all by default) and groups per stage (when it has no exact groups). */
  rounds?: Record<string, { stages?: string[]; groups?: number }>;
};

export type ProTemplate = {
  format: typeof TEMPLATE_FORMAT;
  version: 1;
  name: string;
  /** Free text shown when the template is applied (numbers to adjust, sources…). */
  note?: string;
  options?: Partial<AssignmentOptions>;
  printing?: Partial<PrintingOptions>;
  /** Scramblers and runners per round id, set by hand (`staffSetByHand`). */
  rounds?: Record<string, { scramblers?: number; runners?: number }>;
  pro: {
    stages?: TemplateStageLayout[];
    segments?: Segment[];
    jobs?: JobEligibility;
    scoring?: ScoringConfig;
    /** Keyed by room or stage name. */
    staffing?: Record<string, LaneStaffing>;
    /** `lanes` hold room or stage names. */
    sets?: AssignmentSetConfig[];
    stationRules?: StationRuleConfig[];
    clusterBusy?: Array<Omit<ClusterBusy, "day"> & { dayIndex: number }>;
    teams?: { property: string; setup: Record<string, Omit<TeamSetup, "busy"> & { busy?: TemplateBusy[] }> };
  };
};

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** The current PRO rules as a template. */
export function exportTemplate(settings: WorkspaceSettings, name: string): ProTemplate {
  const pro = settings.pro;
  const lanes = pro ? scheduleLanes(pro.schedule) : [];
  const nameOf = (key: string) => lanes.find(lane => lane.key === key)?.name ?? key;
  const days = pro?.schedule.days ?? [];
  const rounds = Object.fromEntries(settings.rounds.filter(round => round.staffSetByHand).map(round => [round.id, { scramblers: round.scramblers, runners: round.runners }]));
  const teams = pro?.people?.teams;
  return {
    format: TEMPLATE_FORMAT,
    version: 1,
    name,
    options: settings.options,
    printing: settings.printing,
    ...(Object.keys(rounds).length ? { rounds } : {}),
    pro: {
      segments: pro?.segments ?? [],
      jobs: pro?.jobs ?? {},
      ...(pro?.scoring ? { scoring: pro.scoring } : {}),
      staffing: Object.fromEntries(Object.entries(pro?.staffing ?? {}).map(([key, own]) => [nameOf(key), own])),
      sets: (pro?.sets ?? []).map(set => ({ ...set, lanes: set.lanes.map(nameOf) })),
      stationRules: (pro?.stationRules ?? []).map(rule => ({ ...rule, lanes: rule.lanes.map(nameOf) })),
      ...(pro?.clusterBusy?.length ? { clusterBusy: pro.clusterBusy.map(({ day, ...rest }) => ({ ...rest, dayIndex: Math.max(0, days.indexOf(day)) })) } : {}),
      ...(teams ? {
        teams: {
          property: teams.property,
          setup: Object.fromEntries(Object.entries(teams.setup).map(([team, { busy, ...setup }]) => [team, {
            ...setup,
            ...(setup.lane ? { lane: nameOf(setup.lane) } : {}),
            ...(busy ? { busy: busy.map(({ day, ...rest }) => ({ ...rest, dayIndex: Math.max(0, days.indexOf(day)) })) } : {}),
          }])),
        },
      } : {}),
    },
  };
}

/**
 * The schedule with a template's stages: missing stages are added by name; each round of the room
 * goes on its stages (all by default), so blocks of the whole room become one block per stage and
 * blocks on other stages go. `groups` sets the groups per stage of blocks without exact groups.
 */
export function applyStageLayout(schedule: ProSchedule, layout: TemplateStageLayout[], warnings: TemplateWarnings): ProSchedule {
  let rooms = schedule.rooms;
  let blocks = schedule.blocks;
  for (const item of layout) {
    const room = rooms.find(own => plain(own.name) === plain(item.room));
    if (!room) {
      if (!warnings.lanes.includes(item.room)) warnings.lanes.push(item.room);
      continue;
    }
    const stages = [...room.stages];
    for (const { name, color } of item.stages) {
      if (stages.some(stage => plain(stage.name) === plain(name))) continue;
      stages.push({ id: newStageId(rooms.map(own => own.id === room.id ? { ...own, stages } : own)), name, color });
    }
    rooms = rooms.map(own => own.id === room.id ? { ...own, stages } : own);
    const stageId = (name: string) => {
      const id = stages.find(stage => plain(stage.name) === plain(name))?.id;
      if (id === undefined && !warnings.lanes.includes(name)) warnings.lanes.push(name);
      return id;
    };
    const roundStages = new Map(Object.entries(item.rounds ?? {}).map(([roundId, own]) => [roundId, {
      ids: own.stages ? own.stages.map(stageId).filter((id): id is number => id !== undefined) : stages.map(stage => stage.id),
      groups: own.groups,
    }]));
    blocks = blocks.flatMap((block): ProRoundBlock[] => {
      const roundId = roundIdOf(block.activityCode);
      if (block.roomId !== room.id || !roundId) return [block];
      const own = roundStages.get(roundId);
      const ids = own?.ids ?? stages.map(stage => stage.id);
      const groups = (current: number) => block.groupWindows ? current : own?.groups ?? current;
      if (block.stageId !== undefined) return ids.includes(block.stageId) ? [{ ...block, groups: groups(block.groups) }] : [];
      // The whole room's groups: the same window on each stage, its groups shared out.
      const { groupWindows: _, ...rest } = block;
      const perStage = own?.groups ?? Math.max(1, Math.ceil(block.groups / Math.max(1, ids.length)));
      return ids.map(id => ({ ...rest, id: `${block.id}-s${id}`, stageId: id, groups: perStage }));
    });
  }
  return { ...schedule, rooms, blocks };
}

/** A template from a file; undefined when it is not one. */
export function parseTemplate(text: string): ProTemplate | undefined {
  try {
    const data = JSON.parse(text) as Partial<ProTemplate>;
    if ((data?.format !== TEMPLATE_FORMAT && data?.format !== OLD_TEMPLATE_FORMAT) || data.version !== 1 || !data.pro || typeof data.pro !== "object") return undefined;
    return { ...data, name: typeof data.name === "string" && data.name ? data.name : "PRO", pro: data.pro } as ProTemplate;
  } catch {
    return undefined;
  }
}

export type TemplateWarnings = { lanes: string[]; rounds: string[]; days: number[] };

/**
 * Applies a template: every section it has replaces the current one; the schedule (but for the
 * stages the template lays out), people's properties, volunteers and unavailabilities stay. Names that match no room or stage, and rounds
 * the competition does not have, are left out and reported.
 */
export function applyTemplate(settings: WorkspaceSettings, original: ProSchedule, template: ProTemplate): { settings: WorkspaceSettings; warnings: TemplateWarnings } {
  const warnings: TemplateWarnings = { lanes: [], rounds: [], days: [] };
  const schedule = template.pro.stages ? applyStageLayout(original, template.pro.stages, warnings) : original;
  const lanes = scheduleLanes(schedule);
  const keyOf = (name: string) => {
    const key = lanes.find(lane => plain(lane.name) === plain(name))?.key;
    if (!key && !warnings.lanes.includes(name)) warnings.lanes.push(name);
    return key;
  };
  const keys = (names: string[]) => names.map(keyOf).filter((key): key is string => !!key);
  const roundIds = new Set(settings.rounds.map(round => round.id));
  const knownRounds = (ids: string[]) => ids.filter(id => {
    if (!roundIds.has(id) && !warnings.rounds.includes(id)) warnings.rounds.push(id);
    return roundIds.has(id);
  });
  const { pro } = template;
  const current = settings.pro ?? { enabled: true, schedule };
  const people = current.people ?? EMPTY_PRO_PEOPLE;

  const next = { ...current, enabled: true, schedule };
  if (pro.segments) next.segments = normalizeSegments(pro.segments);
  if (pro.jobs) next.jobs = normalizeJobs(pro.jobs);
  if (pro.scoring) next.scoring = normalizeScoring(pro.scoring);
  if (pro.staffing) next.staffing = Object.fromEntries(Object.entries(pro.staffing).flatMap(([name, own]) => {
    const key = keyOf(name);
    return key ? [[key, own]] : [];
  }));
  if (pro.sets) next.sets = pro.sets.map(set => ({ ...set, lanes: keys(set.lanes ?? []), rounds: Array.isArray(set.rounds) ? knownRounds(set.rounds) : set.rounds }));
  if (pro.stationRules) next.stationRules = pro.stationRules.map(rule => ({ ...rule, lanes: keys(rule.lanes ?? []), exclusions: rule.exclusions ?? [], rounds: Array.isArray(rule.rounds) ? knownRounds(rule.rounds) : rule.rounds }));
  if (pro.clusterBusy) next.clusterBusy = pro.clusterBusy.flatMap(({ dayIndex, ...rest }) => {
    const day = schedule.days[dayIndex];
    if (!day && !warnings.days.includes(dayIndex + 1)) warnings.days.push(dayIndex + 1);
    return day ? [{ ...rest, day }] : [];
  });
  if (pro.teams) {
    const setup = Object.fromEntries(Object.entries(pro.teams.setup).map(([team, item]) => {
      const lane = item.lane ? keyOf(item.lane) : undefined;
      const busy = (item.busy ?? []).flatMap(({ dayIndex, ...rest }) => {
        const day = schedule.days[dayIndex];
        if (!day && !warnings.days.includes(dayIndex + 1)) warnings.days.push(dayIndex + 1);
        return day ? [{ ...rest, day }] : [];
      });
      return [team, { ...item, lane, ...(lane ? {} : { laneOnly: undefined }), busy }];
    }));
    next.people = { ...people, teams: normalizeTeams({ property: pro.teams.property, setup }) };
  }

  const rounds = template.rounds ? settings.rounds.map(round => {
    const own = template.rounds?.[round.id];
    return own ? { ...round, ...own, staffSetByHand: true } : round;
  }) : settings.rounds;
  if (template.rounds) knownRounds(Object.keys(template.rounds));
  for (const item of pro.stages ?? []) knownRounds(Object.keys(item.rounds ?? {}));
  return {
    settings: {
      ...settings,
      rounds,
      options: normalizeOptions({ ...settings.options, ...template.options }),
      printing: { ...settings.printing, ...template.printing },
      pro: next,
    },
    warnings,
  };
}

export function templateFileName(name: string) {
  return `${plain(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pro"}.json`;
}
