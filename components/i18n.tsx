"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createTranslator, keyOf, LOCALE_COOKIE, LOCALES, type Locale, type Translate, type TranslatePlural } from "@/lib/i18n";
import type { Issue } from "@/lib/validation";

type I18n = { locale: Locale; t: Translate; tp: TranslatePlural; setLocale: (locale: Locale) => void };

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    // Server-rendered pages (landing, dashboard) read the cookie.
    router.refresh();
  }, [router]);
  const value = useMemo(() => ({ locale, setLocale, ...createTranslator(locale) }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>");
  return context;
}

/** Event name in the current language, falling back to the WCA event id. */
export function useEventName() {
  const { t } = useI18n();
  return useCallback((eventId: string) => {
    const name = t(keyOf("events", eventId));
    return name === `events.${eventId}` ? eventId : name;
  }, [t]);
}

/** An issue's text in the current language. */
export function useIssueText() {
  const { t } = useI18n();
  const eventName = useEventName();
  return useCallback((issue: Issue) => {
    const { groups, names, task, otherRound, otherTask, ...rest } = issue.params;
    const params: Record<string, string | number> = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)) as Record<string, string | number>;
    if (groups) params.groups = groups.map(group => `G${group}`).join(", ");
    if (names) params.names = names.join(t("issues.and"));
    if (task) params.task = t(keyOf("tasks", task));
    if (otherTask) params.otherTask = t(keyOf("tasks", otherTask));
    if (otherRound) params.otherRound = roundName(otherRound, eventName, t);
    return t(keyOf("issues", issue.code), params);
  }, [t, eventName]);
}

/** "3x3x3 Cube · Round 2" from "333-r2". */
export function roundName(roundId: string, eventName: (eventId: string) => string, t: Translate) {
  const [eventId, number] = roundId.split("-r");
  return `${eventName(eventId)} · ${t("rounds.roundNumber", { number: number ?? "" })}`;
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return <label className={`language-switcher ${compact ? "compact" : ""}`} title={t("language.label")}>
    <span aria-hidden="true">🌐</span>
    <select value={locale} onChange={event => setLocale(event.target.value as Locale)} aria-label={t("language.label")}>
      {(Object.keys(LOCALES) as Locale[]).map(code => <option key={code} value={code}>{compact ? code.toUpperCase() : LOCALES[code].name}</option>)}
    </select>
  </label>;
}
