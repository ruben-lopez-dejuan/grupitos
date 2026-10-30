"use client";

import { useMemo, useState } from "react";
import { Hint } from "@/components/hint";
import { useI18n } from "@/components/i18n";
import type { WcifPerson } from "@/lib/competition-store";
import { byName } from "@/lib/people";
import type { Unavailability } from "@/lib/pro/people";
import { personKey } from "@/lib/rounds";

/** When people cannot take tasks: a time range on a day, or while someone else competes. Both modes. */
export function UnavailabilityPanel({ people, days, value, onChange }: {
  /** Everyone who can take tasks (competitors, staff and, in PRO, volunteers). */
  people: WcifPerson[];
  /** Competition days. */
  days: string[];
  value: Unavailability[];
  onChange: (value: Unavailability[]) => void;
}) {
  const { t, locale } = useI18n();
  const [absence, setAbsence] = useState({ person: "", kind: "time" as "time" | "competing", day: days[0] ?? "", start: "09:00", end: "13:00", other: "", note: "" });
  const sortedPeople = useMemo(() => [...people].sort(byName), [people]);
  const nameOf = (key: string) => people.find(person => personKey(person) === key)?.name ?? key;
  const dayLabel = (day: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const day = days.includes(absence.day) ? absence.day : days[0] ?? "";

  const absenceReady = absence.person && (absence.kind === "competing" ? absence.other && absence.other !== absence.person : day && absence.end > absence.start);

  function addAbsence() {
    if (!absenceReady) return;
    let index = value.length + 1;
    while (value.some(item => item.id === `u${index}`)) index += 1;
    const note = absence.note.trim() ? { note: absence.note.trim() } : {};
    const item: Unavailability = absence.kind === "competing"
      ? { id: `u${index}`, personKey: absence.person, whileCompeting: absence.other, ...note }
      : { id: `u${index}`, personKey: absence.person, start: `${day}T${absence.start}`, end: `${day}T${absence.end}`, ...note };
    onChange([...value, item]);
    setAbsence(current => ({ ...current, person: "", other: "", note: "" }));
  }

  return <section className="people-panel unavailability-panel" id="unavailable">
    <div className="setup-heading"><h2>{t("proPeople.unavailable")} <span className="count-chip">{value.length}</span> <Hint align="start" text={t("proPeople.unavailableHint")} /></h2></div>
    <div className="volunteer-area">
      {value.length > 0 && <ul className="absence-list">{[...value].sort((a, b) => nameOf(a.personKey).localeCompare(nameOf(b.personKey))).map(item => <li key={item.id}>
        <strong>{nameOf(item.personKey)}</strong>
        <span>{item.whileCompeting !== undefined ? t("proPeople.whileCompetingText", { name: nameOf(item.whileCompeting) }) : `${dayLabel(item.start!.slice(0, 10))} ${item.start!.slice(11)}–${item.end!.slice(11)}`}</span>
        {item.note && <small>{item.note}</small>}
        <button type="button" onClick={() => onChange(value.filter(other => other.id !== item.id))} aria-label={t("proPeople.removeUnavailable", { name: nameOf(item.personKey) })}>×</button>
      </li>)}</ul>}
      <form className="volunteer-form absence-form" onSubmit={event => { event.preventDefault(); addAbsence(); }}>
        <select value={absence.person} onChange={event => setAbsence(current => ({ ...current, person: event.target.value }))} aria-label={t("proPeople.person")}><option value="">{t("proPeople.person")}</option>{sortedPeople.map(person => <option key={personKey(person)} value={personKey(person)}>{person.name}</option>)}</select>
        <select value={absence.kind} onChange={event => setAbsence(current => ({ ...current, kind: event.target.value as "time" | "competing" }))} aria-label={t("proPeople.when")}><option value="time">{t("proPeople.timeRange")}</option><option value="competing">{t("proPeople.whileCompeting")}</option></select>
        {absence.kind === "time"
          ? <><select value={day} onChange={event => setAbsence(current => ({ ...current, day: event.target.value }))} aria-label={t("schedule.day")}>{days.map(item => <option key={item} value={item}>{dayLabel(item)}</option>)}</select>
            <input type="time" step={300} value={absence.start} onChange={event => setAbsence(current => ({ ...current, start: event.target.value }))} aria-label={t("schedule.start")} />
            <input type="time" step={300} value={absence.end} onChange={event => setAbsence(current => ({ ...current, end: event.target.value }))} aria-label={t("schedule.end")} /></>
          : <select value={absence.other} onChange={event => setAbsence(current => ({ ...current, other: event.target.value }))} aria-label={t("proPeople.accompanies")}><option value="">{t("proPeople.accompanies")}</option>{sortedPeople.filter(person => !person.appKey && personKey(person) !== absence.person).map(person => <option key={personKey(person)} value={personKey(person)}>{person.name}</option>)}</select>}
        <input value={absence.note} onChange={event => setAbsence(current => ({ ...current, note: event.target.value }))} placeholder={t("proPeople.note")} aria-label={t("proPeople.note")} />
        <button className="button secondary" type="submit" disabled={!absenceReady}>{t("people.add")}</button>
      </form>
    </div>
  </section>;
}
