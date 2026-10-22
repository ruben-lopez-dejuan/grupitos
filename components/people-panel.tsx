"use client";

import { useState } from "react";
import { NewcomerBadge, PersonAvatar } from "@/components/person-badges";
import type { WcifPerson } from "@/lib/competition-store";
import { PERSON_ROLE_LABELS, type PeopleSettings, type PersonRole } from "@/lib/people";
import { personKey } from "@/lib/rounds";

type ListId = PersonRole | "trusted";

const DESCRIPTIONS: Record<ListId, string> = {
  delegate: "Marca quién hace tareas de delegado de turno.",
  "trainee-delegate": "Se tratan como delegados. Marca quién hace tareas de delegado.",
  organizer: "Sin tareas normales salvo que lo actives en las reglas.",
  staff: "Se eligen antes que nadie para juzgar y hacer de runner, así que hacen más tareas. Para mezclar se prefieren entre quienes son igual de aptos.",
  dataentry: "No hacen tareas normales. Pueden recibir la tarea de data entry.",
  trusted: "Prioridad para mezclar.",
};

const ORDER: ListId[] = ["delegate", "trainee-delegate", "organizer", "staff", "dataentry", "trusted"];

export function PeoplePanel({ people, settings, onChange, delegateDuties, showPhotos, onShowPhotosChange }: {
  showPhotos: boolean;
  onShowPhotosChange: (show: boolean) => void;
  people: WcifPerson[];
  settings: PeopleSettings;
  onChange: (settings: PeopleSettings) => void;
  /** Whether the delegate-duty checkboxes matter (the option is on). */
  delegateDuties: boolean;
}) {
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
    <div className="setup-heading"><div><h2>Personas y roles</h2><p>Los roles se leen del WCIF. Cámbialos aquí sin tocar la WCA.</p></div><label className="photo-toggle"><input type="checkbox" checked={showPhotos} onChange={event => onShowPhotosChange(event.target.checked)} /> Mostrar fotos</label></div>
    <div className="role-grid">{ORDER.map(id => {
      const keys = listOf(id);
      const isDelegateList = id === "delegate" || id === "trainee-delegate";
      return <div className="role-card" key={id}>
        <div className="role-card-head"><h3>{id === "trusted" ? "Personal de confianza" : PERSON_ROLE_LABELS[id]}</h3><span>{keys.length}</span></div>
        <p>{DESCRIPTIONS[id]}</p>
        {keys.length > 0 && <ul className="role-people">{keys.map(key => {
          const person = byKey.get(key);
          return <li key={key}>
            {isDelegateList && delegateDuties && <label className="duty-toggle" title="Asignarle tareas de delegado"><input type="checkbox" checked={settings.delegateDutyIds.includes(key)} onChange={event => toggleDuty(key, event.target.checked)} /> Tareas</label>}
            {showPhotos && <PersonAvatar name={person?.name ?? key} url={person?.avatar?.thumbUrl} size={28} />}
            <span>{person?.name ?? key}</span>
            {person && !person.wcaId && <NewcomerBadge />}
            <button type="button" onClick={() => remove(id, key)} aria-label={`Quitar a ${person?.name ?? key}`}>×</button>
          </li>;
        })}</ul>}
        <PersonPicker people={people} exclude={keys} label={id === "trusted" ? "Añadir persona de confianza" : `Añadir a ${PERSON_ROLE_LABELS[id].toLowerCase()}`} onAdd={key => add(id, key)} />
      </div>;
    })}</div>
  </section>;
}

function PersonPicker({ people, exclude, label, onAdd }: { people: WcifPerson[]; exclude: string[]; label: string; onAdd: (key: string) => void }) {
  const [value, setValue] = useState("");
  return <div className="person-picker">
    <select value={value} onChange={event => setValue(event.target.value)} aria-label={label}>
      <option value="">Selecciona una persona…</option>
      {people.filter(person => !exclude.includes(personKey(person))).map(person => <option key={personKey(person)} value={personKey(person)}>{person.name}{person.wcaId ? ` · ${person.wcaId}` : ""}</option>)}
    </select>
    <button className="button secondary" type="button" disabled={!value} onClick={() => { onAdd(value); setValue(""); }}>Añadir</button>
  </div>;
}
