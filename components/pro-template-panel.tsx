"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n";
import { parseTemplate, templateFileName, type ProTemplate, type TemplateWarnings } from "@/lib/pro/template";
import { BUILT_IN_TEMPLATES } from "@/lib/pro/templates/spanish-championship-2026";

/** PRO templates: apply a built-in one, import one from a JSON file, or export the current setup. */
export function ProTemplatePanel({ onApply, onExport }: {
  onApply: (template: ProTemplate) => TemplateWarnings;
  onExport: () => ProTemplate;
}) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState(BUILT_IN_TEMPLATES[0]?.name ?? "");
  const [message, setMessage] = useState<{ text: string; note?: string; error?: boolean }>();

  function apply(template: ProTemplate) {
    if (!window.confirm(t("templates.confirm", { name: template.name }))) return;
    const warnings = onApply(template);
    const missing = [
      warnings.lanes.length ? t("templates.missingLanes", { names: warnings.lanes.join(", ") }) : "",
      warnings.rounds.length ? t("templates.missingRounds", { names: warnings.rounds.join(", ") }) : "",
      warnings.days.length ? t("templates.missingDays", { days: warnings.days.join(", ") }) : "",
    ].filter(Boolean);
    setMessage({ text: [t("templates.applied", { name: template.name }), ...missing].join(" · "), note: template.note });
  }

  async function importFile(file: File) {
    const template = parseTemplate(await file.text());
    if (!template) return setMessage({ text: t("templates.invalid"), error: true });
    apply(template);
  }

  function exportFile() {
    const template = onExport();
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(template, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = templateFileName(template.name);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="template-panel">
    <div className="volunteer-form">
      <select value={chosen} onChange={event => setChosen(event.target.value)} aria-label={t("templates.builtIn")}>{BUILT_IN_TEMPLATES.map(template => <option key={template.name} value={template.name}>{template.name}</option>)}</select>
      <button className="button secondary" type="button" disabled={!chosen} onClick={() => { const template = BUILT_IN_TEMPLATES.find(item => item.name === chosen); if (template) apply(template); }}>{t("templates.apply")}</button>
      <label className="button secondary file-button">{t("templates.import")}<input type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) importFile(file); }} /></label>
      <button className="plain" type="button" onClick={exportFile}>{t("templates.export")}</button>
    </div>
    {message && <p className={`setup-note ${message.error ? "warning-note" : ""}`} role="status">{message.text}{message.note && <><br /><small>{message.note}</small></>}</p>}
  </div>;
}
