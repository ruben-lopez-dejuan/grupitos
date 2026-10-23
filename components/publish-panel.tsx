"use client";

import { useState } from "react";
import { Hint } from "@/components/hint";
import { useI18n } from "@/components/i18n";
import type { GeneratedAssignment } from "@/lib/assignments";
import type { StoredCompetition } from "@/lib/competition-store";
import type { ProPeople } from "@/lib/pro/people";
import type { GroupSlot, ProSchedule } from "@/lib/pro/schedule";
import { exportWcif, wcifFileName, type WcifExportReport } from "@/lib/wcif-export";

/** Last step: the proposal as a WCIF file. Nothing is sent to the WCA yet. */
export function PublishPanel({ competition, assignments, rounds, slots, schedule, people }: {
  competition: StoredCompetition;
  assignments: GeneratedAssignment[];
  rounds: Array<{ id: string; eventId: string; roundNumber: number; groups: number }>;
  slots?: Map<string, GroupSlot[]>;
  schedule?: ProSchedule;
  people?: ProPeople;
}) {
  const { t, tp } = useI18n();
  const [report, setReport] = useState<WcifExportReport>();

  function download() {
    const result = exportWcif({ competition, assignments, rounds, slots, schedule, people });
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(result.wcif, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = wcifFileName(competition);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setReport(result.report);
  }

  return <section className="setup-panel publish-panel">
    <div className="setup-heading"><h2>{t("publish.title")} <Hint align="start" text={t("publish.hint")} /></h2></div>
    <p className="setup-note">{t("publish.noSync")}</p>
    <div className="volunteer-form"><button className="button primary" type="button" disabled={!assignments.length} onClick={download}>{t("publish.download")}</button></div>
    {report && <div className="publish-report" role="status">
      <p>{t("publish.summary", { people: report.people, assignments: report.assignments })}</p>
      <p>{t("publish.groups", { reused: report.groupsReused, created: report.groupsCreated, removed: report.groupsRemoved })}</p>
      {report.skipped.length > 0 && <p className="warning-note">{tp("publish.skipped", report.skipped.length)}: {report.skipped.slice(0, 12).join(", ")}{report.skipped.length > 12 ? "…" : ""}</p>}
    </div>}
  </section>;
}
