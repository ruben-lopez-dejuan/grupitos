import { notFound } from "next/navigation";
import { CompetitionList } from "@/components/competition-list";
import type { WcaCompetition } from "@/lib/wca";

/** Development-only preview of the competition list with sample data. */
export default function DemoCompetitionsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const competitions: WcaCompetition[] = [
    { id: "DemoPasado2025", name: "Demo Open Pasado 2025", city: "Bilbao", country_iso2: "ES", start_date: day(-200), end_date: day(-199) },
    { id: "DemoLejano2027", name: "Demo Campeonato Lejano 2027", city: "Lisboa", country_iso2: "PT", start_date: day(240), end_date: day(242) },
    { id: "DemoProximo2026", name: "Demo Open Próximo 2026", city: "Vitoria-Gasteiz", country_iso2: "ES", start_date: day(12), end_date: day(12) },
    { id: "DemoMultiple2026", name: "Demo FMC Simultáneo 2026", city: "Varias ciudades", country_iso2: "XE", start_date: day(40), end_date: day(40) },
  ];
  return <main className="dashboard"><section className="container dash-main"><CompetitionList competitions={competitions} /></section></main>;
}
