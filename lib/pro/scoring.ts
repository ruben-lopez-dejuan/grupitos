/*
 * Weighted staff scoring, the visual version of CompScript's scorers (staff/scorers.js, MIT):
 * every criterion turns a fact about a person, a group and a job into a number, and its weight
 * says how much it counts. The engine (lib/pro/staff-ilp.ts) picks, group by group, the people
 * and jobs with the highest total, as CompScript's AssignStaff does with an integer program.
 */
import type { TaskRole } from "@/lib/assignments";

export const CRITERIA = ["load", "hoursToday", "keepSameJob", "longStreak", "beforeCompeting", "competesInEvent", "eliminated", "reserveScramblers", "staff", "wcaJob", "trusted", "speed", "preferences", "young"] as const;
export type Criterion = typeof CRITERIA[number];
export type Weights = Record<Criterion, number>;

export type ScoringConfig = { enabled: boolean; weights: Weights };

/** Facts about one person for one job in one group; the engine fills them in. */
export type ScoringFacts = {
  /** Staff tasks already given. */
  load: number;
  /** Hours of staff tasks earlier the same day. */
  hoursToday: number;
  /** Minutes of the same job in a row right before this group (0 when the previous task differs or there is a gap). */
  sameJobStreak: number;
  /** Minutes of any staff tasks in a row right before this group, plus this group. */
  staffStreak: number;
  /** Competes in a group starting within 10 minutes after this one ends. */
  competesRightAfter: boolean;
  /** Registered for the round's event and not a delegate. */
  competesInEvent: boolean;
  /** Competed in the previous round of the event and did not advance: free, and at hand. */
  eliminated: boolean;
  /** Could scramble this event (scrambler segment or the faster half). */
  canScramble: boolean;
  isStaff: boolean;
  /** Has the WCA role for this job (`staff-judge`, `staff-scrambler`, `staff-runner`). */
  wcaJob: boolean;
  isTrusted: boolean;
  /** 0–1: 1 for the fastest in the round, 0 without a result. */
  speed: number;
  /** Numeric value of the person's `weight-<job>` property (natshelper's preference weights), 0 if none. */
  preference: number;
  youngerThan10: boolean;
};

/** CompScript's SameJobScorer(60, …): continuing the same job is welcome up to an hour. */
const SAME_JOB_MINUTES = 60;
/** CompScript's ConsecutiveJobScorer(90, …): more than 90 minutes in a row starts to weigh. */
const STREAK_MINUTES = 90;

export function criterionValues(facts: ScoringFacts, job: TaskRole): Record<Criterion, number> {
  return {
    load: facts.load,
    hoursToday: facts.hoursToday,
    keepSameJob: facts.sameJobStreak > 0 ? Math.max(0, (SAME_JOB_MINUTES - facts.sameJobStreak) / SAME_JOB_MINUTES) : 0,
    longStreak: Math.max(0, (facts.staffStreak - STREAK_MINUTES) / STREAK_MINUTES),
    beforeCompeting: facts.competesRightAfter ? 1 : 0,
    competesInEvent: facts.competesInEvent ? 1 : 0,
    eliminated: facts.eliminated ? 1 : 0,
    reserveScramblers: facts.canScramble && (job === "judge" || job === "runner") ? 1 : 0,
    staff: facts.isStaff ? 1 : 0,
    wcaJob: facts.wcaJob ? 1 : 0,
    trusted: facts.isTrusted && job === "scrambler" ? 1 : 0,
    speed: job === "scrambler" ? facts.speed : 0,
    preferences: facts.preference,
    young: facts.youngerThan10 ? 1 : 0,
  };
}

/** Each criterion's contribution (weight × value); zero contributions are left out. */
export function scoreBreakdown(facts: ScoringFacts, job: TaskRole, weights: Weights) {
  const values = criterionValues(facts, job);
  const breakdown: Partial<Record<Criterion, number>> = {};
  for (const criterion of CRITERIA) {
    const contribution = Math.round(weights[criterion] * values[criterion] * 10) / 10;
    if (contribution) breakdown[criterion] = contribution;
  }
  return breakdown;
}

export const SCORING_PROFILES = ["balanced", "amore"] as const;
export type ScoringProfile = typeof SCORING_PROFILES[number];

/** Presets. "amore" mirrors the VolunteerScorers of the Amore Open 2026 scripts. */
export const PROFILE_WEIGHTS: Record<ScoringProfile, Weights> = {
  balanced: { load: -10, hoursToday: -4, keepSameJob: 10, longStreak: -20, beforeCompeting: -50, competesInEvent: 20, eliminated: 40, reserveScramblers: -20, staff: 30, wcaJob: 40, trusted: 30, speed: 10, preferences: 10, young: -40 },
  amore: { load: -10, hoursToday: -5, keepSameJob: 4, longStreak: -3, beforeCompeting: -50, competesInEvent: 50, eliminated: 0, reserveScramblers: -50, staff: 0, wcaJob: 0, trusted: 0, speed: 0, preferences: 0, young: 0 },
};

export const DEFAULT_SCORING: ScoringConfig = { enabled: false, weights: PROFILE_WEIGHTS.balanced };

/** Which preset the weights match, if any. */
export function matchingProfile(weights: Weights): ScoringProfile | undefined {
  return SCORING_PROFILES.find(profile => CRITERIA.every(criterion => PROFILE_WEIGHTS[profile][criterion] === weights[criterion]));
}

export function normalizeScoring(value: unknown): ScoringConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<ScoringConfig>;
  // Criteria added later take the value of the preset the saved weights match, so a preset stays one.
  const saved = (criterion: Criterion) => raw.weights?.[criterion];
  const preset = SCORING_PROFILES.find(profile => CRITERIA.every(criterion => saved(criterion) === undefined || saved(criterion) === PROFILE_WEIGHTS[profile][criterion]));
  const weights = { ...(preset ? PROFILE_WEIGHTS[preset] : DEFAULT_SCORING.weights) };
  for (const criterion of CRITERIA) {
    const weight = raw.weights?.[criterion];
    if (typeof weight === "number" && Number.isFinite(weight)) weights[criterion] = weight;
  }
  return { enabled: !!raw.enabled, weights };
}
