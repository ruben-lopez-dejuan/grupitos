import { cookies, headers } from "next/headers";
import { createTranslator, isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "@/lib/i18n";

/** Language for server components: the saved choice, else the browser's Accept-Language. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const accepted = (await headers()).get("accept-language") ?? "";
  return matchLocale(accepted.split(","));
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, ...createTranslator(locale) };
}
