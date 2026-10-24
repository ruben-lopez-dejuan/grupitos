"use client";

import { useState } from "react";
import { Hint } from "@/components/hint";
import { useI18n } from "@/components/i18n";
import type { GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import type { Draft } from "@/lib/draft";
import type { ProPeople } from "@/lib/pro/people";
import type { GroupSlot, ProSchedule } from "@/lib/pro/schedule";
import { buildPatch, changedRounds, checkPublished, settingsExtension, type PatchSummary, type WcifPatch } from "@/lib/wca-sync";
import { exportWcif, wcifFileName, type WcifExportReport } from "@/lib/wcif-export";
import { withDraft } from "@/lib/wcif-session";

type Prepared = { fresh: StoredCompetition; withGroups: WcifPatch; settingsOnly: WcifPatch; summary: PatchSummary; changed: string[]; savedAt: string };
type Outcome = { text: string; error?: boolean };

/**
 * Last step: publish to the WCA (groups, assignments and the app's settings), or download the WCIF
 * as a file. Publishing always starts from the WCIF just downloaded, shows what changes, asks, sends
 * and reads the WCIF back to check it.
 */
export function PublishPanel({ competition, draft, assignments, rounds, slots, schedule, people, outdated, userName, offline, onPublished }: {
  competition: StoredCompetition;
  /** The whole draft goes in the file too, so another device can carry on from it. */
  draft: Draft;
  assignments: GeneratedAssignment[];
  rounds: Array<{ id: string; eventId: string; roundNumber: number; groups: number }>;
  slots?: Map<string, GroupSlot[]>;
  schedule?: ProSchedule;
  people?: ProPeople;
  /** The settings changed after the proposal was generated. */
  outdated: boolean;
  userName: string;
  /** The demo: there is no WCA to publish to. */
  offline?: boolean;
  /** The WCIF as the WCA has it after publishing, and when the settings were saved. */
  onPublished: (fresh: StoredCompetition, savedAt: string) => void;
}) {
  const { t, tp } = useI18n();
  const [report, setReport] = useState<WcifExportReport>();
  const [prepared, setPrepared] = useState<Prepared>();
  const [busy, setBusy] = useState<"prepare" | "send">();
  const [outcome, setOutcome] = useState<Outcome>();

  function download() {
    const result = exportWcif({ competition, assignments, rounds, slots, schedule, people });
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(withDraft(result.wcif, draft))}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = wcifFileName(competition);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setReport(result.report);
  }

  const failure = async (response: Response) => {
    const body = await response.json().catch(() => ({})) as { error?: string; status?: number; detail?: string };
    if (response.status === 401 || body.error === "unauthorized") return t("sync.errors.session");
    if (body.status === 401 || body.status === 403) return t("sync.errors.forbidden");
    if (body.error === "wca-status") return t("sync.errors.wca", { status: body.status ?? response.status, detail: body.detail ?? "" });
    return t("sync.errors.network");
  };

  async function fetchWcif() {
    const response = await fetch(`/api/wca/competitions/${encodeURIComponent(competition.id)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await failure(response));
    return await response.json() as StoredCompetition;
  }

  /** Downloads the WCIF the WCA has now and works out what publishing would change. */
  async function prepare() {
    setBusy("prepare");
    setOutcome(undefined);
    setPrepared(undefined);
    try {
      const fresh = await fetchWcif();
      const savedAt = new Date().toISOString();
      const settings = await settingsExtension({ settings: draft.settings!, generatedWith: draft.generatedWith, savedAt, savedBy: userName });
      const input = { fresh, rounds, slots, schedule, people, settings };
      const withGroups = buildPatch({ ...input, assignments });
      const settingsOnly = buildPatch({ ...input, assignments: [] });
      setPrepared({ fresh, withGroups: withGroups.patch, settingsOnly: settingsOnly.patch, summary: withGroups.summary, changed: changedRounds(competition, fresh), savedAt });
    } catch (error) {
      setOutcome({ text: error instanceof Error ? error.message : t("sync.errors.network"), error: true });
    } finally {
      setBusy(undefined);
    }
  }

  /** Sends the patch, then reads the WCIF back and checks that the WCA kept everything. */
  async function send(patch: WcifPatch) {
    if (!prepared || !window.confirm(patch.persons ? t("sync.confirmGroups", { name: competition.name }) : t("sync.confirmSettings", { name: competition.name }))) return;
    setBusy("send");
    setOutcome(undefined);
    try {
      const response = await fetch(`/api/wca/competitions/${encodeURIComponent(competition.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!response.ok) throw new Error(await failure(response));
      const reread = await fetchWcif();
      const check = checkPublished(patch, reread);
      onPublished(reread, prepared.savedAt);
      setPrepared(undefined);
      const parts = [check.settingsSaved ? t("sync.settingsSaved") : t("sync.settingsMissing")];
      if (patch.persons) parts.unshift(check.missing ? tp("sync.missing", check.missing) : t("sync.groupsSaved", { groups: check.groups }));
      setOutcome({ text: `${t("sync.done")} ${parts.join(" ")}`, error: !check.settingsSaved || check.missing > 0 });
    } catch (error) {
      setOutcome({ text: error instanceof Error ? error.message : t("sync.errors.network"), error: true });
    } finally {
      setBusy(undefined);
    }
  }

  const summary = prepared?.summary;
  const blocked = !!prepared?.changed.length;

  return <>
    <section className="setup-panel publish-panel">
      <div className="setup-heading"><h2>{t("sync.title")} <Hint align="start" text={t("sync.hint")} /></h2></div>
      {offline ? <p className="setup-note">{t("sync.offline")}</p> : <>
        <p className="setup-note">{t("sync.public")}</p>
        <div className="volunteer-form"><button className="button primary" type="button" disabled={!!busy || !draft.settings} onClick={prepare}>{busy === "prepare" ? t("sync.preparing") : t("sync.prepare")}</button></div>
        {prepared && summary && <div className="publish-report" role="status">
          {blocked && <p className="form-error">{t("sync.scheduleChanged", { rounds: prepared.changed.join(", ") })}</p>}
          {summary.withGroups ? <>
            <p>{t("publish.groups", { reused: summary.groupsReused, created: summary.groupsCreated, removed: summary.groupsRemoved })}</p>
            <p>{t("sync.people", { people: summary.changedPeople, added: summary.added, removed: summary.removed })}</p>
            {summary.newStaff > 0 && <p>{tp("sync.newStaff", summary.newStaff)}</p>}
          </> : <p>{t("sync.noProposal")}</p>}
          <p>{t("sync.settingsLine")}</p>
          {outdated && <p className="warning-note">{t("sync.outdated")}</p>}
          {summary.skipped.length > 0 && <p className="warning-note">{tp("publish.skipped", summary.skipped.length)}: {summary.skipped.slice(0, 12).join(", ")}{summary.skipped.length > 12 ? "…" : ""}</p>}
          <div className="volunteer-form">
            {summary.withGroups && <button className="button primary" type="button" disabled={!!busy || blocked} onClick={() => send(prepared.withGroups)}>{busy === "send" ? t("sync.sending") : t("sync.publishAll")}</button>}
            <button className={`button ${summary.withGroups ? "secondary" : "primary"}`} type="button" disabled={!!busy} onClick={() => send(prepared.settingsOnly)}>{t("sync.publishSettings")}</button>
          </div>
        </div>}
        {outcome && <p className={outcome.error ? "form-error" : "setup-note"} role="status">{outcome.text}</p>}
      </>}
    </section>
    <section className="setup-panel publish-panel">
      <div className="setup-heading"><h2>{t("publish.title")} <Hint align="start" text={t("publish.hint")} /></h2></div>
      <p className="setup-note">{t("publish.resume")}</p>
      <div className="volunteer-form"><button className="button secondary" type="button" onClick={download}>{t("publish.download")}</button></div>
      {report && <div className="publish-report" role="status">
        <p>{t("publish.summary", { people: report.people, assignments: report.assignments })}</p>
        <p>{t("publish.groups", { reused: report.groupsReused, created: report.groupsCreated, removed: report.groupsRemoved })}</p>
        {report.skipped.length > 0 && <p className="warning-note">{tp("publish.skipped", report.skipped.length)}: {report.skipped.slice(0, 12).join(", ")}{report.skipped.length > 12 ? "…" : ""}</p>}
      </div>}
    </section>
  </>;
}
