import type { Metadata } from "next";
import "@cubing/icons/css";
import "./globals.css";
import "./product.css";

export const metadata: Metadata = { title: "WCA Easy Groups", description: "Grupos equilibrados para competiciones WCA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `try{var t=localStorage.getItem('wca-easy-groups-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}`;
  return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}</body></html>;
}
