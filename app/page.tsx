import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppMark } from "@/components/app-mark";
import { SignInButton } from "@/components/auth-buttons";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n";
import { authOptions } from "@/lib/auth";
import { keyOf } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

const BASIC = ["groups", "staff", "review", "scorecards"] as const;
const PRO = ["schedule", "people", "sets", "files"] as const;

export default async function HomePage() {
  if (await getServerSession(authOptions)) redirect("/dashboard");
  const { t } = await getI18n();
  return <main className="login-page">
    <nav className="topbar container">
      <Link className="brand" href="/"><AppMark /> Grupitos</Link>
      <div className="topbar-actions"><LanguageSwitcher /><ThemeToggle /><a className="plain-link" href="https://github.com/ruben-lopez-dejuan/grupitos">GitHub ↗</a></div>
    </nav>
    <section className="login-layout container">
      <div className="login-intro">
        <h1>{t("landing.title")}</h1>
        <p>{t("landing.lead")}</p>
        <div className="landing-features">
          <section><h2>{t("landing.basicTitle")}</h2><ul>{BASIC.map(key => <li key={key}>{t(keyOf("landing.basic", key))}</li>)}</ul></section>
          <section><h2>{t("landing.proTitle")}</h2><ul>{PRO.map(key => <li key={key}>{t(keyOf("landing.pro", key))}</li>)}</ul></section>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-panel-head"><img className="wca-logo" src="/wca-logo.svg" alt="WCA" width={42} height={42} /><div><strong>{t("landing.panelTitle")}</strong><small>{t("landing.panelText")}</small></div></div>
        <SignInButton />
        <div className="login-detail"><span>{t("landing.importTitle")}</span><p>{t("landing.importText")}</p></div>
        <p className="privacy">{t("landing.privacy")}</p>
      </div>
    </section>
    <footer className="login-footer container"><span>{t("landing.footerProject")}</span><a href="https://github.com/ruben-lopez-dejuan/grupitos">{t("landing.footerData")}</a></footer>
  </main>;
}
