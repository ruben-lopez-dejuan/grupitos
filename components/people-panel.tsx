"use client";

import { useState } from "react";
import { Hint } from "@/components/hint";
import { useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import { NewcomerBadge, PersonAvatar } from "@/components/person-badges";
import type { WcifPerson } from "@/lib/competition-store";
import type { PeopleSettings, PersonRole } from "@/lib/people";
import { personKey } from "@/lib/rounds";

type ListId = PersonRole | "trusted";

const ORDER: ListId[] = ["delegate", "trainee-delegate", "organizer", "staff", "dataentry", "avoid", "notasks", "trusted"];

export function PeoplePanel({ people, settings, onChange, delegateDuties, showPhotos, onShowPhotosChange }: {
  showPhotos: boolean;
  onShowPhotosChange: (show: boolean) => void;
  people: WcifPerson[];
  settings: PeopleSettings;
  onChange: (settings: PeopleSettings) => void;
  /** Whether the delegate-duty checkboxes matter (the option is on). */
  delegateDuties: boolean;
}) {
  const { t } = useI18n();
  const byKey = new Map(people.map(person => [personKey(person), person]));
  const listOf = (id: ListId) => id === "trusted" ? settings.trustedIds : settings.roles[id] ?? [];

  function setList(id: ListId, keys: string[]) {
    if (id === "trusted") onChange({ ...settings, trustedIds: keys });
    else onChange({ ...settings, roles: { ...settings.roles, [id]: keys } });
  }

  function add(id: ListId, key: string) {
    if (!key || listOf(id).includes(key)) return;
    if (id === "trusted") return setList(id, [...listOf(id), key]);
    // New delegates and trainees get delegate duties by default.
    const delegateDutyIds = (id === "delegate" || id === "trainee-delegate") && !settings.delegateDutyIds.includes(key) ? [...settings.delegateDutyIds, key] : settings.delegateDutyIds;
    onChange({ ...settings, roles: { ...settings.roles, [id]: [...listOf(id), key] }, delegateDutyIds });
  }

  function remove(id: ListId, key: string) {
    setList(id, listOf(id).filter(item => item !== key));
  }

  function toggleDuty(key: string, on: boolean) {
    onChange({ ...settings, delegateDutyIds: on ? [...settings.delegateDutyIds, key] : settings.delegateDutyIds.filter(item => item !== key) });
  }

  return <section className="people-panel" id="people">
    <div className="setup-heading"><h2>{t("people.title")} <Hint align="start" text={t("people.hint")} /></h2><label className="photo-toggle"><input type="checkbox" checked={showPhotos} onChange={event => onShowPhotosChange(event.target.checked)} /> {t("people.showPhotos")}</label></div>
    <div className="role-grid">{ORDER.map(id => {
      const keys = listOf(id);
      const isDelegateList = id === "delegate" || id === "trainee-delegate";
      return <div className="role-card" key={id}>
        <div className="role-card-head"><h3>{t(keyOf("people.lists", id))} <Hint text={t(keyOf("people.descriptions", id))} /></h3><span>{keys.length}</span></div>
        {keys.length > 0 && <ul className="role-people">{keys.map(key => {
          const person = byKey.get(key);
          return <li key={key}>
            {isDelegateList && delegateDuties && <label className="duty-toggle" title={t("people.dutyToggleHelp")}><input type="checkbox" checked={settings.delegateDutyIds.includes(key)} onChange={event => toggleDuty(key, event.target.checked)} /> {t("people.dutyToggle")}</label>}
            {showPhotos && <PersonAvatar name={person?.name ?? key} url={person?.avatar?.thumbUrl} size={28} />}
            <span>{person?.name ?? key}</span>
            {person && !person.wcaId && <NewcomerBadge />}
            <button type="button" onClick={() => remove(id, key)} aria-label={t("people.remove", { name: person?.name ?? key })}>×</button>
          </li>;
        })}</ul>}
        <PersonPicker people={people} exclude={keys} label={id === "trusted" ? t("people.addTrusted") : t("people.addTo", { role: t(keyOf("people.lists", id)).toLowerCase() })} onAdd={key => add(id, key)} />
      </div>;
    })}</div>
  </section>;
}

function PersonPicker({ people, exclude, label, onAdd }: { people: WcifPerson[]; exclude: string[]; label: string; onAdd: (key: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  return <div className="person-picker">
    <select value={value} onChange={event => setValue(event.target.value)} aria-label={label}>
      <option value="">{t("people.choose")}</option>
      {people.filter(person => !exclude.includes(personKey(person))).map(person => <option key={personKey(person)} value={personKey(person)}>{person.name}{person.wcaId ? ` · ${person.wcaId}` : ""}</option>)}
    </select>
    <button className="button secondary" type="button" disabled={!value} onClick={() => { onAdd(value); setValue(""); }}>{t("people.add")}</button>
  </div>;
}
