"use client";

import { useRef, useState } from "react";
import { Hint } from "@/components/hint";
import { useI18n } from "@/components/i18n";
import { saveCompetition } from "@/lib/competition-store";
import { draftStorageKey } from "@/lib/draft";
import { readSession, type ReadSession } from "@/lib/wcif-session";

export type ReadFile = Extract<ReadSession, { ok: true }>;

/**
 * Saves a WCIF read from a file in this browser: the competition, and the draft the app put in it
 * (or none, so its groups open as the proposal).
 */
export async function storeSession(read: ReadFile) {
  await saveCompetition(read.competition);
  try {
    if (read.draft) localStorage.setItem(draftStorageKey(read.competition.id), JSON.stringify(read.draft));
    else localStorage.removeItem(draftStorageKey(read.competition.id));
  } catch {
    // Storage blocked: the competition is saved and the draft lives in memory for this visit.
  }
}

/** "Continue on another device": opens a WCIF exported by this app (or any WCIF) from a file. */
export function ResumeFromFile({ competitionId, onRead }: {
  /** In a competition: the file must be of this one. */
  competitionId?: string;
  /** Returns a message to show, or nothing when it navigates away. */
  onRead: (read: ReadFile) => Promise<string | undefined>;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);

  async function open(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const read = readSession(await file.text());
      if (!read.ok) return setMessage({ text: t(read.reason === "not-json" ? "resume.notJson" : "resume.notWcif"), error: true });
      if (competitionId && read.competition.id !== competitionId) return setMessage({ text: t("resume.otherCompetition", { name: read.competition.name }), error: true });
      const text = await onRead(read);
      if (text) setMessage({ text });
    } catch {
      setMessage({ text: t("resume.failed"), error: true });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return <div className="resume-file">
    <div><strong>{t("resume.title")}</strong> <Hint align="start" text={t("resume.hint")} /></div>
    <input ref={input} type="file" accept=".json,application/json" hidden onChange={event => open(event.target.files?.[0])} />
    <button className="button secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? t("resume.reading") : t("resume.button")}</button>
    {message && <small className={message.error ? "form-error" : undefined} role="status">{message.text}</small>}
  </div>;
}

/** When the draft in a file was saved, in the reader's language. */
export function savedAtText(savedAt: string | undefined, locale: string) {
  if (!savedAt) return "";
  try { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(savedAt)); } catch { return savedAt; }
}
