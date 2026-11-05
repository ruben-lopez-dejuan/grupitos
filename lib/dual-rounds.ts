import type { GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import type { GroupSlot } from "@/lib/pro/schedule";
import { registrationRoundIds } from "@/lib/rounds";

/** Each dual round (Regulation 9v) with the other round of its pair: 333-r1 ↔ 333-r2. */
export function dualPartners(competition: StoredCompetition) {
  const partners = new Map<string, string>();
  for (const second of registrationRoundIds(competition)) {
    const first = `${second.split("-")[0]}-r1`;
    partners.set(first, second);
    partners.set(second, first);
  }
  return partners;
}

/**
 * The proposal with round `toId` made an exact copy of round `fromId`: the same people, groups,
 * stations and tasks. The copy takes the place of the round it replaces (or follows the source).
 */
export function copyRoundTasks(assignments: GeneratedAssignment[], fromId: string, toId: string): GeneratedAssignment[] {
  const copies = assignments.filter(item => item.roundId === fromId).map(item => ({
    ...item,
    id: `${toId}:${item.personId}`,
    roundId: toId,
    tasks: item.tasks.map(task => ({ ...task })),
    ...(item.why ? { why: item.why.map(entry => ({ ...entry })) } : {}),
  }));
  const at = assignments.findIndex(item => item.roundId === toId);
  const rest = assignments.filter(item => item.roundId !== toId);
  // Rows before the first one replaced are all kept, so the copy goes at that position.
  const afterSource = rest.length - [...rest].reverse().findIndex(item => item.roundId === fromId);
  const index = at >= 0 ? at : afterSource > rest.length ? rest.length : afterSource;
  return [...rest.slice(0, index), ...copies, ...rest.slice(index)];
}

/**
 * Group times of a round that is generated once for both dual rounds: each group of the first round
 * also takes the times of the same group of the second, so whoever competes or works in it is busy
 * at both times.
 */
export function withPartnerTimes(slots: Map<string, GroupSlot[]> | undefined, firstId: string, secondId: string) {
  const first = slots?.get(firstId);
  const second = slots?.get(secondId);
  if (!slots || !first || !second) return slots;
  const merged = new Map(slots);
  merged.set(firstId, first.map(slot => ({ ...slot, windows: [...slot.windows, ...second.filter(other => other.group === slot.group).flatMap(other => other.windows)] })));
  return merged;
}
