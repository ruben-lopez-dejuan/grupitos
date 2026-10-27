/*
 * Working on several devices: the exported WCIF carries the whole draft (settings and proposal,
 * with hand edits) in a competition extension, so importing that file elsewhere picks up exactly
 * where the work was left. A WCIF without it still opens, with its groups as the proposal.
 */
import type { StoredCompetition, WcifExtension } from "@/lib/competition-store";
import { parseDraft, type Draft } from "@/lib/draft";

/** WCA extension ids are dot-separated words. Files from the app's first name (WCA Easy Groups) are still read. */
export const DRAFT_EXTENSION_ID = "grupitos.Draft";
const OLD_DRAFT_EXTENSION_IDS = ["wcaEasyGroups.Draft", "wca-easy-groups.Draft"];
export const isDraftExtension = (id: string) => id === DRAFT_EXTENSION_ID || OLD_DRAFT_EXTENSION_IDS.includes(id);

type WithExtensions = StoredCompetition & { extensions?: WcifExtension[] };

/**
 * The WCIF with the draft in its extension, replacing an older one. It holds personal data (the
 * proposal), so it is only for files: a future PATCH to the WCA must strip it with `withoutDraft`.
 */
export function withDraft(wcif: StoredCompetition, draft: Draft): StoredCompetition {
  const own = wcif as WithExtensions;
  const extensions = (own.extensions ?? []).filter(item => !isDraftExtension(item.id));
  return { ...own, extensions: [...extensions, { id: DRAFT_EXTENSION_ID, data: { ...draft, savedAt: new Date().toISOString() } }] } as StoredCompetition;
}

/** The WCIF without the app's draft. */
export function withoutDraft(wcif: StoredCompetition): StoredCompetition {
  const own = wcif as WithExtensions;
  if (!own.extensions?.some(item => isDraftExtension(item.id))) return wcif;
  return { ...own, extensions: own.extensions.filter(item => !isDraftExtension(item.id)) } as StoredCompetition;
}

export type ReadSession =
  | { ok: true; competition: StoredCompetition; draft?: Draft; savedAt?: string }
  | { ok: false; reason: "not-json" | "not-wcif" };

/** Reads a WCIF file: the competition (without the draft) and, when the app exported it, the draft. */
export function readSession(text: string): ReadSession {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }
  const wcif = data as Partial<WithExtensions> | null;
  if (!wcif || typeof wcif !== "object" || typeof wcif.id !== "string" || typeof wcif.name !== "string" || !Array.isArray(wcif.persons)) return { ok: false, reason: "not-wcif" };
  const stored = (wcif.extensions ?? []).find(item => isDraftExtension(item.id))?.data as (Draft & { savedAt?: string }) | undefined;
  const draft = stored ? parseDraft(JSON.stringify(stored)) : undefined;
  return { ok: true, competition: withoutDraft(wcif as StoredCompetition), draft, savedAt: draft ? stored?.savedAt : undefined };
}
