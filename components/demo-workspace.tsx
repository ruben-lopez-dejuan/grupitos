"use client";

import { useEffect, useState } from "react";
import { GroupWorkspace } from "@/components/group-workspace";
import { saveCompetition } from "@/lib/competition-store";
import { demoCompetition, type DemoSize } from "@/lib/demo-competition";

export function DemoWorkspace({ size }: { size: DemoSize }) {
  const [competitionId, setCompetitionId] = useState<string>();

  useEffect(() => {
    const competition = demoCompetition(size);
    saveCompetition(competition).then(() => setCompetitionId(competition.id));
  }, [size]);

  if (!competitionId) return <main className="workspace-loading"><div /><p>Preparando la competición de prueba…</p></main>;
  return <GroupWorkspace key={competitionId} competitionId={competitionId} userName="Demo" />;
}
