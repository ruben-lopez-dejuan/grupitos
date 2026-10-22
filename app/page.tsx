import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth-buttons";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n";
import { authOptions } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export default async function HomePage() {
  if (await getServerSession(authOptions)) redirect("/dashboard");
  const { t } = await getI18n();
  return <main className="login-page">
    <nav className="topbar container">
      <Link className="brand" href="/"><span className="brand-symbol">E</span> WCA Easy Groups</Link>
      <div className="topbar-actions"><LanguageSwitcher /><ThemeToggle /><a className="plain-link" href="https://github.com/ruben-lopez-dejuan/wca-easy-groups">GitHub ↗</a></div>
    </nav>
    <section className="login-layout container">
      <div className="login-intro">
        <p className="kicker">{t("landing.kicker")}</p>
        <h1>{t("landing.title")}</h1>
        <p>{t("landing.lead")}</p>
        <ul><li><span>✓</span> {t("landing.bulletStart")}</li><li><span>✓</span> {t("landing.bulletRounds")}</li><li><span>✓</span> {t("landing.bulletReview")}</li></ul>
      </div>
      <div className="login-panel">
        <div className="login-panel-head"><span className="wca-block">WCA</span><div><strong>{t("landing.panelTitle")}</strong><small>{t("landing.panelText")}</small></div></div>
        <SignInButton />
        <div className="login-detail"><span>{t("landing.importTitle")}</span><p>{t("landing.importText")}</p></div>
        <p className="privacy">{t("landing.privacy")}</p>
      </div>
    </section>
    <footer className="login-footer container"><span>{t("landing.footerProject")}</span><span>{t("landing.footerData")}</span></footer>
  </main>;
}
