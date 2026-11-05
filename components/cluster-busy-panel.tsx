"use client";

import { useState } from "react";
import { Hint } from "@/components/hint";
import { useI18n } from "@/components/i18n";
import type { ClusterBusy } from "@/lib/pro/teams";

/** Times when everyone in a cluster is busy: no tasks then, and they compete at another time if they can. */
export function ClusterBusyPanel({ value, onChange, clusters, days }: {
  value: ClusterBusy[];
  onChange: (value: ClusterBusy[]) => void;
  clusters: Array<{ id: string; name: string }>;
  days: string[];
}) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState({ segment: "", day: days[0] ?? "", start: "09:00", end: "10:00" });
  const dayLabel = (day: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const nameOf = (id: string) => clusters.find(cluster => cluster.id === id)?.name ?? id;
  const segment = draft.segment || clusters[0]?.id || "";
  const ready = segment && draft.day && draft.end > draft.start;
  if (!clusters.length) return null;
  return <section className="panel volunteer-area team-setup">
    <h3 className="panel-subheading">{t("clusterBusy.title")} <Hint align="start" text={t("clusterBusy.hint")} /></h3>
    {value.length > 0 && <span className="team-busy">{value.map((item, index) => <span key={index}>{nameOf(item.segment)} · {dayLabel(item.day)} {item.start}–{item.end}<button type="button" onClick={() => onChange(value.filter((_, other) => other !== index))} aria-label={t("clusterBusy.remove", { cluster: nameOf(item.segment) })}>×</button></span>)}</span>}
    {days.length > 0 && <form className="volunteer-form" onSubmit={event => { event.preventDefault(); if (ready) onChange([...value, { segment, day: draft.day, start: draft.start, end: draft.end }]); }}>
      <span>{t("clusterBusy.lead")}</span>
      <select value={segment} onChange={event => setDraft(current => ({ ...current, segment: event.target.value }))} aria-label={t("clusterBusy.cluster")}>{clusters.map(cluster => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}</select>
      <select value={draft.day} onChange={event => setDraft(current => ({ ...current, day: event.target.value }))} aria-label={t("schedule.day")}>{days.map(day => <option key={day} value={day}>{dayLabel(day)}</option>)}</select>
      <input type="time" step={300} value={draft.start} onChange={event => setDraft(current => ({ ...current, start: event.target.value }))} aria-label={t("schedule.start")} />
      <input type="time" step={300} value={draft.end} onChange={event => setDraft(current => ({ ...current, end: event.target.value }))} aria-label={t("schedule.end")} />
      <button className="button secondary" type="submit" disabled={!ready}>{t("people.add")}</button>
    </form>}
  </section>;
}
