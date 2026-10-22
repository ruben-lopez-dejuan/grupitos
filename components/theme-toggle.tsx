"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n";

type Theme = "light" | "dark";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("wca-easy-groups-theme", next);
    setTheme(next);
  }

  const nextLabel = theme === "dark" ? t("theme.useLight") : t("theme.useDark");

  return (
    <button className={`theme-toggle ${compact ? "compact" : ""}`} type="button" onClick={toggleTheme} aria-label={nextLabel} title={nextLabel}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      {!compact && <span>{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>}
    </button>
  );
}
