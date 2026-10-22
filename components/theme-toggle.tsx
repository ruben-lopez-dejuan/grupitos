"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
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

  const nextLabel = theme === "dark" ? "Usar modo claro" : "Usar modo oscuro";

  return (
    <button className={`theme-toggle ${compact ? "compact" : ""}`} type="button" onClick={toggleTheme} aria-label={nextLabel} title={nextLabel}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      {!compact && <span>{theme === "dark" ? "Claro" : "Oscuro"}</span>}
    </button>
  );
}
