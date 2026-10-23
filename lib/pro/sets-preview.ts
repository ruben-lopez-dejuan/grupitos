/*
 * What the assignment sets would do with the people registered now: per set and round, the people
 * it wants, the seats its groups have (the even group size) and the people it places. The
 * sets panel uses it to show where a set asks for more people than fit.
 */
import type { StoredCompetition } from "@/lib/competition-store";
import { splitWithSets } from "@/lib/group-generator";
import { resolveSets, type AssignmentSetConfig } from "@/lib/pro/assignment-sets";
import type { GroupSlot } from "@/lib/pro/schedule";
import { roundCompetitors } from "@/lib/rounds";

export type SetPreview = { roundId: string; wanted: number; seats: number; placed: number };

export function previewSets({ competition, sets, rounds, slots, membersOf }: {
  competition: StoredCompetition;
  sets: AssignmentSetConfig[];
  rounds: Array<{ id: string; eventId: string; roundNumber: number; groups: number; enabled?: boolean }>;
  slots?: Map<string, GroupSlot[]>;
  membersOf: (segmentId: string, eventId: string) => Set<string> | undefined;
}) {
  const result = new Map<string, SetPreview[]>();
  for (const round of rounds) {
    if (round.enabled === false) continue;
    const { people, known } = roundCompetitors(competition, round.id);
    if (!known || !people.length) continue;
    // Later multi-blind attempts repeat attempt 1, so only attempt-1 columns take people.
    const primary = Math.max(1, round.groups - (slots?.get(round.id)?.filter(slot => slot.linkedTo).length ?? 0));
    const resolved = resolveSets(sets, { ...round, groups: primary }, slots?.get(round.id), membersOf);
    if (!resolved.length) continue;
    for (const stats of splitWithSets(people, primary, resolved, "ranks", round.eventId).stats) {
      result.set(stats.id, [...(result.get(stats.id) ?? []), { roundId: round.id, wanted: stats.wanted, seats: stats.seats, placed: stats.placed }]);
    }
  }
  return result;
}
