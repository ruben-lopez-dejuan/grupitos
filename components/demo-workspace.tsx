"use client";

import { useEffect, useState } from "react";
import { GroupWorkspace } from "@/components/group-workspace";
import { useI18n } from "@/components/i18n";
import { saveCompetition } from "@/lib/competition-store";
import { demoCompetition, type DemoSize } from "@/lib/demo-competition";

export function DemoWorkspace({ size }: { size: DemoSize }) {
  const { t } = useI18n();
  const [competitionId, setCompetitionId] = useState<string>();

  useEffect(() => {
    const competition = demoCompetition(size);
    saveCompetition(competition).then(() => setCompetitionId(competition.id));
  }, [size]);

  if (!competitionId) return <main className="workspace-loading"><div /><p>{t("workspace.preparingDemo")}</p></main>;
  return <GroupWorkspace key={competitionId} competitionId={competitionId} userName="Demo" offline />;
}
