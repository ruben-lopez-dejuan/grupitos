import { AppMark } from "@/components/app-mark";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth-buttons";
import { CompetitionList } from "@/components/competition-list";
import { LanguageSwitcher } from "@/components/i18n";
import { ThemeToggle } from "@/components/theme-toggle";
import { authOptions } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { WcaError, wcaFetch, type WcaCompetition } from "@/lib/wca";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions); if (!session?.accessToken) redirect("/");
  const { t } = await getI18n();
  let competitions: WcaCompetition[] = [], error = "";
  try { competitions = await wcaFetch<WcaCompetition[]>("/api/v0/competitions?managed_by_me=true", session.accessToken); } catch (e) { error = e instanceof WcaError ? t("competitions.errors.wcaStatus", { status: e.status }) : t("dashboard.errorTitle"); }
  competitions.sort((a, b) => b.start_date.localeCompare(a.start_date));
  return <main className="dashboard"><nav className="dash-nav"><div className="container nav-inner"><Link className="brand" href="/dashboard"><AppMark /> Grupitos</Link><div className="account"><LanguageSwitcher compact /><ThemeToggle compact />{session.user?.image && <img src={session.user.image} alt="" />}<div><strong>{session.user?.name}</strong><small>{session.user?.wcaId ?? t("auth.wcaAccount")}</small></div><SignOutButton /></div></div></nav><section className="container dash-main">{error ? <div className="empty"><h1>{t("dashboard.errorTitle")}</h1><p>{error}</p><p>{t("dashboard.errorHint")}</p></div> : <CompetitionList competitions={competitions} />}</section></main>;
}
