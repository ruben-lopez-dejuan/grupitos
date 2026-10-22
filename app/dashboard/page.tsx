import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth-buttons";
import { CompetitionList } from "@/components/competition-list";
import { authOptions } from "@/lib/auth";
import { wcaFetch, type WcaCompetition } from "@/lib/wca";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions); if (!session?.accessToken) redirect("/");
  let competitions: WcaCompetition[] = [], error = "";
  try { competitions = await wcaFetch<WcaCompetition[]>("/api/v0/competitions?managed_by_me=true", session.accessToken); } catch (e) { error = e instanceof Error ? e.message : "No hemos podido consultar la WCA."; }
  competitions.sort((a, b) => b.start_date.localeCompare(a.start_date));
  return <main className="dashboard"><nav className="dash-nav"><div className="container nav-inner"><Link className="brand" href="/dashboard"><span className="brand-symbol">E</span> WCA Easy Groups</Link><div className="account">{session.user?.image && <img src={session.user.image} alt="" />}<div><strong>{session.user?.name}</strong><small>{session.user?.wcaId ?? "Cuenta WCA"}</small></div><SignOutButton /></div></div></nav><section className="container dash-main"><div className="steps"><span className="active"><b>1</b> Importar</span><i /><span><b>2</b> Configurar</span><i /><span><b>3</b> Crear grupos</span><i /><span><b>4</b> Revisar</span></div>{error ? <div className="empty"><h1>No pudimos conectar con la WCA</h1><p>{error}</p><p>Cierra sesión y vuelve a entrar.</p></div> : <CompetitionList competitions={competitions} />}</section></main>;
}
