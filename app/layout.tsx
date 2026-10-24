import type { Metadata } from "next";
import "@cubing/icons/css";
import "./globals.css";
import "./product.css";
import "./pro.css";
import { I18nProvider } from "@/components/i18n";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: "Grupitos", description: t("meta.description") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getI18n();
  const themeScript = `try{var t=localStorage.getItem('wca-easy-groups-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}`;
  return <html lang={locale} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><I18nProvider initialLocale={locale}>{children}</I18nProvider></body></html>;
}
