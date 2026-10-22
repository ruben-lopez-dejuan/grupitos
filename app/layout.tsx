import type { Metadata } from "next";
import "./globals.css";
import "./product.css";

export const metadata: Metadata = { title: "WCA Easy Groups", description: "Grupos equilibrados para competiciones WCA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
