"use client";

import { useState, type CSSProperties } from "react";
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
import { savedAtText } from "@/components/resume-from-file";

type Prepared = { fresh: StoredCompetition; withGroups: WcifPatch; settingsOnly: WcifPatch; summary: PatchSummary; changed: string[]; savedAt: string };
/** What happened after sending: published (and how much the WCA kept), or refused. */
type Outcome =
  | { kind: "published"; at: string; onlySettings: boolean; sent: number; missing: number; groups: number; settingsSaved: boolean }
  | { kind: "error"; text: string };

/**
 * Last step: publish to the WCA (groups, assignments and the app's settings), or download the WCIF
 * as a file. Publishing always starts from the WCIF just downloaded, shows what changes, asks, sends
 * and reads the WCIF back to check it.
 */
export function PublishPanel({ competition, draft, assignments, rounds, slots, schedule, people, outdated, userName, offline, lastPublished, onPublished }: {
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
  /** When the settings this browser last loaded from or published to the WCA were saved. */
  lastPublished?: string;
  /** The WCIF as the WCA has it after publishing, and when the settings were saved. */
  onPublished: (fresh: StoredCompetition, savedAt: string) => void;
}) {
  const { t, tp, locale } = useI18n();
  const [report, setReport] = useState<WcifExportReport>();
  const [prepared, setPrepared] = useState<Prepared>();
  const [busy, setBusy] = useState<"prepare" | "send">();
  const [outcome, setOutcome] = useState<Outcome>();
  /** The publish button asks once more, in the page, before writing to the WCA. */
  const [confirming, setConfirming] = useState<"all" | "settings">();
  const when = (iso: string) => savedAtText(iso, locale);

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
      setOutcome({ kind: "error", text: error instanceof Error ? error.message : t("sync.errors.network") });
    } finally {
      setBusy(undefined);
    }
  }

  /** Sends the patch, then reads the WCIF back and checks that the WCA kept everything. */
  async function send(patch: WcifPatch) {
    if (!prepared) return;
    setConfirming(undefined);
    setBusy("send");
    setOutcome(undefined);
    try {
      const response = await fetch(`/api/wca/competitions/${encodeURIComponent(competition.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!response.ok) throw new Error(await failure(response));
      const reread = await fetchWcif();
      const check = checkPublished(patch, reread);
      onPublished(reread, prepared.savedAt);
      setPrepared(undefined);
      const sent = (patch.persons ?? []).reduce((sum, person) => sum + (person.assignments?.length ?? 0), 0);
      setOutcome({ kind: "published", at: new Date().toISOString(), onlySettings: !patch.persons, sent, missing: check.missing, groups: check.groups, settingsSaved: check.settingsSaved });
    } catch (error) {
      setOutcome({ kind: "error", text: error instanceof Error ? error.message : t("sync.errors.network") });
    } finally {
      setBusy(undefined);
    }
  }

  const summary = prepared?.summary;
  const blocked = !!prepared?.changed.length;
  /** The WCA already has exactly this proposal. */
  const unchanged = !!summary?.withGroups && !summary.added && !summary.removed && !summary.groupsCreated && !summary.groupsRemoved && !summary.newStaff;
  /** "+12", "−3", and a plain 0. */
  const signed = (value: number, sign: string) => value ? `${sign}${value}` : "0";
  const stat = (label: string, value: number | string, warn = false) => <div className={warn ? "warn" : undefined}><small>{label}</small><strong>{value}</strong></div>;
  const succeeded = outcome?.kind === "published" && outcome.missing === 0 && outcome.settingsSaved;

  return <>
    <section className="setup-panel publish-panel">
      <div className="setup-heading"><h2>{t("sync.title")} <Hint align="start" text={t("sync.hint")} /></h2></div>
      {offline ? <p className="setup-note">{t("sync.offline")}</p> : <div className="publish-body">
        <p className="publish-intro">{t("sync.public")}{lastPublished && <> <span className="publish-last">{t("sync.lastPublished", { date: when(lastPublished) })}</span></>}</p>

        {outcome?.kind === "published" && <div className={`publish-alert ${succeeded ? "success" : "warning"}`} role="status">
          <h3>{succeeded ? `✓ ${outcome.onlySettings ? t("sync.successSettings") : t("sync.success")}` : `⚠ ${t("sync.partial")}`}</h3>
          <p>{t("sync.checkedAt", { date: when(outcome.at) })}</p>
          <div className="publish-stats" style={{ "--cols": outcome.onlySettings ? 1 : 3 } as CSSProperties}>
            {!outcome.onlySettings && stat(t("sync.stats.verified"), `${outcome.sent - outcome.missing} / ${outcome.sent}`, outcome.missing > 0)}
            {!outcome.onlySettings && stat(t("sync.stats.groupsAtWca"), outcome.groups)}
            {stat(t("sync.stats.settings"), outcome.settingsSaved ? "✓" : "✗", !outcome.settingsSaved)}
          </div>
          {outcome.missing > 0 && <p>{tp("sync.missing", outcome.missing)}</p>}
          {!outcome.settingsSaved && <p>{t("sync.settingsMissing")}</p>}
        </div>}
        {outcome?.kind === "error" && <div className="publish-alert error" role="alert"><h3>✗ {t("sync.failed")}</h3><p>{outcome.text}</p></div>}

        {!prepared && <div><button className="button primary" type="button" disabled={!!busy || !draft.settings} onClick={prepare}>{busy === "prepare" ? t("sync.preparing") : outcome?.kind === "published" ? t("sync.prepareAgain") : t("sync.prepare")}</button></div>}

        {prepared && summary && <>
          <h3 className="publish-step">{t("sync.whatChanges")}</h3>
          {blocked && <div className="publish-alert error" role="alert"><p>{t("sync.scheduleChanged", { rounds: prepared.changed.join(", ") })}</p></div>}
          {summary.withGroups ? <>
            <div className="publish-stats" style={{ "--cols": summary.newStaff > 0 ? 4 : 3 } as CSSProperties}>
              {stat(t("sync.stats.peopleChanged"), summary.changedPeople)}
              {stat(t("sync.stats.added"), signed(summary.added, "+"))}
              {stat(t("sync.stats.removed"), signed(summary.removed, "−"), summary.removed > 0)}
              {summary.newStaff > 0 && stat(t("sync.stats.newStaff"), summary.newStaff)}
            </div>
            <div className="publish-stats" style={{ "--cols": 3 } as CSSProperties}>
              {stat(t("sync.stats.groupsNew"), summary.groupsCreated)}
              {stat(t("sync.stats.groupsReused"), summary.groupsReused)}
              {stat(t("sync.stats.groupsRemoved"), summary.groupsRemoved, summary.groupsRemoved > 0)}
            </div>
          </> : <p className="publish-intro">{t("sync.noProposal")}</p>}

          <div className="publish-alert warning">
            <h3>⚠ {t("sync.beforeTitle")}</h3>
            <ul>
              {unchanged && <li>{t("sync.nothingChanges")}</li>}
              {summary.withGroups && !unchanged && <li>{t("sync.warnReplace")}</li>}
              {summary.withGroups && !unchanged && <li>{t("sync.warnPublic")}</li>}
              {summary.removed > 0 && <li><strong>{t("sync.warnRemoved", { count: summary.removed })}</strong></li>}
              {summary.groupsRemoved > 0 && <li><strong>{t("sync.warnGroupsRemoved", { count: summary.groupsRemoved })}</strong></li>}
              {outdated && summary.withGroups && <li>{t("sync.outdated")}</li>}
              {summary.skipped.length > 0 && <li>{tp("publish.skipped", summary.skipped.length)}: {summary.skipped.slice(0, 12).join(", ")}{summary.skipped.length > 12 ? "…" : ""}</li>}
              <li>{t("sync.settingsLine")}</li>
            </ul>
          </div>

          {confirming ? <div className="publish-confirm" role="alertdialog" aria-label={t("sync.confirmTitle")}>
            <p><strong>{confirming === "all" ? t("sync.confirmGroups", { name: competition.name }) : t("sync.confirmSettings", { name: competition.name })}</strong></p>
            <div className="publish-actions">
              <button className="button primary danger" type="button" disabled={!!busy} onClick={() => send(confirming === "all" ? prepared.withGroups : prepared.settingsOnly)}>{busy === "send" ? t("sync.sending") : t("sync.confirmYes")}</button>
              <button className="button secondary" type="button" disabled={!!busy} onClick={() => setConfirming(undefined)}>{t("sync.cancel")}</button>
            </div>
          </div> : <div className="publish-actions">
            {summary.withGroups && <button className="button primary" type="button" disabled={!!busy || blocked} onClick={() => setConfirming("all")}>{t("sync.publishAll")}</button>}
            <button className={`button ${summary.withGroups ? "secondary" : "primary"}`} type="button" disabled={!!busy} onClick={() => setConfirming("settings")}>{t("sync.publishSettings")}</button>
            <button className="button quiet" type="button" disabled={!!busy} onClick={() => setPrepared(undefined)}>{t("sync.cancel")}</button>
          </div>}
        </>}
      </div>}
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
