/*
 * One group's staff as an integer program, as in CompScript's staff/assign.js (MIT): one 0/1
 * variable per person and job, at most one job per person, at most the needed people per job,
 * and the total score as objective. Filling a seat is worth far more than any score, so every
 * seat that can be filled is filled. The constraint matrix is that of an assignment problem, so
 * the linear relaxation is already integral and the solver needs no branching.
 */
import solver from "javascript-lp-solver";
import type { TaskRole } from "@/lib/assignments";

/** Worth of filling a seat; scores are kept well below it. */
const SEAT = 100000;

export type IlpCandidate = { key: string; job: TaskRole; score: number };

/** The chosen key for each filled seat, as [personKey, job] pairs. */
export function solveGroupStaff(needs: Partial<Record<TaskRole, number>>, candidates: IlpCandidate[]): Array<[string, TaskRole]> {
  const ints: Record<string, number> = {};
  const model: solver.Model = { optimize: "value", opType: "max", constraints: {}, variables: {}, ints };
  const jobs = Object.entries(needs).filter(([, need]) => (need ?? 0) > 0) as Array<[TaskRole, number]>;
  if (!jobs.length || !candidates.length) return [];
  for (const [job, need] of jobs) model.constraints[`job:${job}`] = { max: need };
  const people = [...new Set(candidates.map(candidate => candidate.key))];
  const index = new Map(people.map((key, position) => [key, position]));
  for (const position of index.values()) model.constraints[`p:${position}`] = { max: 1 };
  candidates.forEach((candidate, position) => {
    if (!needs[candidate.job]) return;
    const variable = `x:${position}`;
    model.variables[variable] = { value: SEAT + Math.max(-SEAT / 2, Math.min(SEAT / 2, candidate.score)), [`p:${index.get(candidate.key)}`]: 1, [`job:${candidate.job}`]: 1 };
    ints[variable] = 1;
  });
  const solution = solver.Solve(model) as Record<string, number | boolean>;
  if (!solution.feasible) return [];
  return Object.entries(solution)
    .filter(([key, value]) => key.startsWith("x:") && typeof value === "number" && value > 0.5)
    .map(([key]) => candidates[Number(key.slice(2))])
    .sort((a, b) => a.key.localeCompare(b.key) || a.job.localeCompare(b.job))
    .map(candidate => [candidate.key, candidate.job]);
}
