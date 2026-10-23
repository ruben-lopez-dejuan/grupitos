/*
 * Teams: a person property (natshelper's `team`, filled from the volunteer form) read live, as the
 * Spanish Championship 2026 scripts do with InTeam(...). Each team value has a setup:
 *  - kind: what its people do (volunteers work in any event, like CanVolunteer; a team with
 *    another job gets no tasks or avoids them; data entry enters results; "inherit" keeps roles);
 *  - lane: the room or stage where they work first (Side room), or only there;
 *  - jobs: the only jobs they do;
 *  - busy: times when they cannot have tasks (room setup, multi scrambling).
 * Nothing is copied into the role lists: changing a team or re-importing the sheet takes effect.
 */
import type { PeopleSettings, PersonRole } from "@/lib/people";
import type { ProPeople, Unavailability } from "@/lib/pro/people";

export const TEAM_KINDS = ["inherit", "volunteer", "avoid", "notasks", "dataentry"] as const;
export type TeamKind = typeof TEAM_KINDS[number];
export const TEAM_JOBS = ["judge", "scrambler", "runner"] as const;
export type TeamJob = typeof TEAM_JOBS[number];

/** A busy time on one day, as local wall-clock times. */
export type TeamBusy = { day: string; start: string; end: string };
export type TeamSetup = { kind: TeamKind; lane?: string; laneOnly?: boolean; jobs?: TeamJob[]; busy?: TeamBusy[] };
export type TeamsConfig = { property: string; setup: Record<string, TeamSetup> };

/** Role list each kind puts people in; "inherit" leaves the lists alone. */
const KIND_ROLE: Record<Exclude<TeamKind, "inherit">, PersonRole> = { volunteer: "staff", avoid: "avoid", notasks: "notasks", dataentry: "dataentry" };
/** The lists a team decides. Delegate and organizer roles always come from the WCA. */
const TEAM_DECIDED: PersonRole[] = ["staff", "avoid", "notasks", "dataentry"];

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A first guess, following CanVolunteer in the Spanish Championship 2026 scripts: volunteer teams
 * work in any event, the side room team works first in its room, data entry enters results,
 * organizer and delegate teams keep their WCA roles, and any other team has another job.
 */
export function suggestTeamSetup(team: string, lanes: Array<{ key: string; name: string; hasStages?: boolean }>): TeamSetup {
  const name = plain(team);
  if (/data/.test(name)) return { kind: "dataentry" };
  if (/organi|delegad|delegate/.test(name)) return { kind: "inherit" };
  if (/side|aux|blind|ciega/.test(name)) {
    const side = lanes.filter(lane => !lane.hasStages && /aux|side|blind|ciega/.test(plain(lane.name)));
    return { kind: "volunteer", ...(side.length === 1 ? { lane: side[0].key } : {}) };
  }
  if (/voluntari|volunteer|staff|juez|judge|scrambl|mezcl|runner/.test(name)) return { kind: "volunteer" };
  return { kind: "notasks" };
}

/** Each person's team value (trimmed), for people who have one. */
export function teamValues(people: ProPeople, property: string) {
  const values = new Map<string, string>();
  for (const [key, own] of Object.entries(people.properties)) {
    const value = own[property]?.trim();
    if (value) values.set(key, value);
  }
  return values;
}

/** The setup of every team value: the saved one, or the suggestion. */
export function teamSetups(people: ProPeople, config: TeamsConfig | undefined, lanes: Array<{ key: string; name: string; hasStages?: boolean }>) {
  const property = config?.property ?? defaultTeamProperty(people);
  const setups = new Map<string, TeamSetup>();
  if (!property) return { property, setups, values: new Map<string, string>() };
  const values = teamValues(people, property);
  for (const value of new Set(values.values())) setups.set(value, config?.property === property && config.setup[value] ? config.setup[value] : suggestTeamSetup(value, lanes));
  return { property, setups, values };
}

export function defaultTeamProperty(people: ProPeople) {
  return people.propertyKeys.find(key => /^(team|equipo)$/i.test(key)) ?? "";
}

/**
 * Role lists with teams applied: for people whose team has a kind, that kind decides staff,
 * avoid, no tasks and data entry (above the WCA roles and the lists); other roles stay.
 * `fromTeam` tells which team placed each person, for the people panel.
 */
export function withTeams(settings: PeopleSettings, values: Map<string, string>, setups: Map<string, TeamSetup>) {
  const decided = new Map<string, { role: PersonRole; team: string }>();
  for (const [key, team] of values) {
    const kind = setups.get(team)?.kind ?? "inherit";
    if (kind !== "inherit") decided.set(key, { role: KIND_ROLE[kind], team });
  }
  if (!decided.size) return { settings, fromTeam: new Map<string, string>() };
  const roles = { ...settings.roles };
  for (const role of TEAM_DECIDED) roles[role] = (roles[role] ?? []).filter(key => !decided.has(key));
  for (const [key, { role }] of decided) roles[role] = [...(roles[role] ?? []), key];
  return { settings: { ...settings, roles }, fromTeam: new Map([...decided].map(([key, { team }]) => [key, team])) };
}

/** Busy times of team members, as unavailabilities. */
export function teamUnavailability(values: Map<string, string>, setups: Map<string, TeamSetup>): Unavailability[] {
  const result: Unavailability[] = [];
  for (const [key, team] of values) {
    (setups.get(team)?.busy ?? []).forEach((busy, index) => {
      if (busy.day && busy.start && busy.end && busy.end > busy.start) result.push({ id: `team:${team}:${index}:${key}`, personKey: key, start: `${busy.day}T${busy.start}`, end: `${busy.day}T${busy.end}` });
    });
  }
  return result;
}

/** People kept away from a job by their team (keys), per job. */
export function teamJobExclusions(values: Map<string, string>, setups: Map<string, TeamSetup>) {
  const excluded: Record<TeamJob, Set<string>> = { judge: new Set(), scrambler: new Set(), runner: new Set() };
  for (const [key, team] of values) {
    const jobs = setups.get(team)?.jobs;
    if (!jobs?.length) continue;
    for (const job of TEAM_JOBS) if (!jobs.includes(job)) excluded[job].add(key);
  }
  return excluded;
}

/** Members of teams with a room or stage: who works there first, and who works only there. */
export function teamLanes(values: Map<string, string>, setups: Map<string, TeamSetup>) {
  const first = new Map<string, Set<string>>();
  const only = new Set<string>();
  for (const [key, team] of values) {
    const setup = setups.get(team);
    if (!setup?.lane) continue;
    first.set(setup.lane, new Set([...(first.get(setup.lane) ?? []), key]));
    if (setup.laneOnly) only.add(key);
  }
  return { first, only };
}

/** Cluster id under which a team can be chosen in sets, station rules and job eligibility. */
export const teamClusterId = (team: string) => `team:${team}`;
export const teamOfClusterId = (id: string) => id.startsWith("team:") ? id.slice(5) : undefined;

/** Teams saved by older drafts as one choice (role or room) become setups. */
export function migrateTeamRoles(value: unknown): TeamsConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { property?: unknown; map?: Record<string, unknown> };
  if (typeof raw.property !== "string" || !raw.map || typeof raw.map !== "object") return undefined;
  const setup: Record<string, TeamSetup> = {};
  for (const [team, choice] of Object.entries(raw.map)) {
    if (choice === "staff") setup[team] = { kind: "volunteer" };
    else if (choice === "dataentry" || choice === "notasks") setup[team] = { kind: choice };
    else if (choice === "none") setup[team] = { kind: "inherit" };
    // A room team used to work only in its room.
    else if (typeof choice === "string" && choice.startsWith("lane:")) setup[team] = { kind: "volunteer", lane: choice.slice(5), laneOnly: true };
  }
  return { property: raw.property, setup };
}

export function normalizeTeams(value: unknown): TeamsConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<TeamsConfig>;
  if (typeof raw.property !== "string" || !raw.setup || typeof raw.setup !== "object") return undefined;
  const setup: Record<string, TeamSetup> = {};
  for (const [team, item] of Object.entries(raw.setup)) {
    if (!item || !TEAM_KINDS.includes(item.kind)) continue;
    setup[team] = {
      kind: item.kind,
      ...(typeof item.lane === "string" && item.lane ? { lane: item.lane, ...(item.laneOnly ? { laneOnly: true } : {}) } : {}),
      ...(Array.isArray(item.jobs) && item.jobs.length ? { jobs: item.jobs.filter(job => TEAM_JOBS.includes(job)) } : {}),
      ...(Array.isArray(item.busy) && item.busy.length ? { busy: item.busy.filter(busy => busy && typeof busy.day === "string" && typeof busy.start === "string" && typeof busy.end === "string") } : {}),
    };
  }
  return { property: raw.property, setup };
}
