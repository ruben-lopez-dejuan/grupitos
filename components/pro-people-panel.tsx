"use client";

import { useMemo, useState } from "react";
import { Hint } from "@/components/hint";
import { keyOf } from "@/lib/i18n";
import { SheetImportPanel } from "@/components/sheet-import-panel";
import { useI18n } from "@/components/i18n";
import type { WcifPerson } from "@/lib/competition-store";
import type { PeopleSettings } from "@/lib/people";
import { applyTeamRoles, newVolunteerKey, propertyValues, suggestTeamRole, TEAM_ROLES, type ProPeople, type TeamRole, type Unavailability } from "@/lib/pro/people";
import { personKey } from "@/lib/rounds";

/** Rows shown before "show all", so typing stays fast in a 400-person table. */
const PAGE = 80;

/** PRO people: volunteers who do not compete and free-form properties per person. */
export function ProPeoplePanel({ people, days, value, onChange, onReimport, peopleSettings, onPeopleSettingsChange }: {
  /** Accepted competitors and volunteers. */
  people: WcifPerson[];
  /** Competition days, for unavailabilities. */
  days: string[];
  value: ProPeople;
  onChange: (value: ProPeople) => void;
  onReimport: () => void;
  /** Role lists, so teams can be turned into roles. */
  peopleSettings: PeopleSettings;
  onPeopleSettingsChange: (settings: PeopleSettings) => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [newProperty, setNewProperty] = useState("");
  const [volunteer, setVolunteer] = useState({ name: "", wcaId: "" });
  const teamProperty = value.teamRoles?.property ?? (value.propertyKeys.find(key => /^(team|equipo)$/i.test(key)) ?? value.propertyKeys[0] ?? "");
  const teams = teamProperty ? propertyValues(value, teamProperty) : [];
  const teamRole = (team: string): TeamRole | "none" => value.teamRoles?.property === teamProperty && value.teamRoles.map[team] ? value.teamRoles.map[team] : suggestTeamRole(team);
  const [teamMessage, setTeamMessage] = useState("");
  const setTeamRole = (team: string, role: TeamRole | "none") => onChange({ ...value, teamRoles: { property: teamProperty, map: { ...Object.fromEntries(teams.map(([name]) => [name, teamRole(name)])), [team]: role } } });
  function applyTeams() {
    const teamRoles = { property: teamProperty, map: Object.fromEntries(teams.map(([name]) => [name, teamRole(name)])) };
    const result = applyTeamRoles(peopleSettings, value, teamRoles);
    onPeopleSettingsChange(result.settings);
    onChange({ ...value, teamRoles });
    setTeamMessage(t("proPeople.teamsApplied", { count: result.added }));
  }
  const [absence, setAbsence] = useState({ person: "", kind: "time" as "time" | "competing", day: days[0] ?? "", start: "09:00", end: "13:00", other: "", note: "" });
  const sortedPeople = useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people]);
  const nameOf = (key: string) => people.find(person => personKey(person) === key)?.name ?? key;
  const dayLabel = (value: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const registeredWcaIds = useMemo(() => new Set(people.filter(person => !person.appKey && person.wcaId).map(person => person.wcaId!.toUpperCase())), [people]);

  const needle = query.trim().toLowerCase();
  const matching = people.filter(person => !needle || `${person.name} ${person.wcaId ?? ""} ${Object.values(value.properties[personKey(person)] ?? {}).join(" ")}`.toLowerCase().includes(needle));
  const shown = showAll ? matching : matching.slice(0, PAGE);

  const setProperty = (key: string, property: string, text: string) => {
    const own = { ...(value.properties[key] ?? {}) };
    if (text.trim()) own[property] = text.trim();
    else delete own[property];
    const properties = { ...value.properties };
    if (Object.keys(own).length) properties[key] = own;
    else delete properties[key];
    onChange({ ...value, properties });
  };

  function addProperty() {
    const name = newProperty.trim();
    if (!name || value.propertyKeys.includes(name)) return;
    onChange({ ...value, propertyKeys: [...value.propertyKeys, name] });
    setNewProperty("");
  }

  function removeProperty(name: string) {
    const used = Object.values(value.properties).filter(own => own[name] !== undefined).length;
    if (used && !window.confirm(t("proPeople.confirmRemoveProperty", { name, count: used }))) return;
    const properties = Object.fromEntries(Object.entries(value.properties).map(([key, own]) => {
      const { [name]: _removed, ...rest } = own;
      return [key, rest];
    }).filter(([, own]) => Object.keys(own).length));
    onChange({ ...value, propertyKeys: value.propertyKeys.filter(key => key !== name), properties });
  }

  const wcaId = volunteer.wcaId.trim().toUpperCase();
  const volunteerError = wcaId && registeredWcaIds.has(wcaId) ? t("proPeople.alreadyRegistered") : wcaId && !/^\d{4}[A-Z]{4}\d{2}$/.test(wcaId) ? t("proPeople.badWcaId") : "";

  function addVolunteer() {
    if (!volunteer.name.trim() || volunteerError) return;
    onChange({ ...value, volunteers: [...value.volunteers, { key: newVolunteerKey(value.volunteers), name: volunteer.name.trim(), ...(wcaId ? { wcaId } : {}) }] });
    setVolunteer({ name: "", wcaId: "" });
  }

  function removeVolunteer(key: string) {
    const { [key]: _removed, ...properties } = value.properties;
    onChange({ ...value, volunteers: value.volunteers.filter(item => item.key !== key), properties, unavailable: value.unavailable.filter(item => item.personKey !== key && item.whileCompeting !== key) });
  }

  const absenceReady = absence.person && (absence.kind === "competing" ? absence.other && absence.other !== absence.person : absence.day && absence.end > absence.start);

  function addAbsence() {
    if (!absenceReady) return;
    let index = value.unavailable.length + 1;
    while (value.unavailable.some(item => item.id === `u${index}`)) index += 1;
    const note = absence.note.trim() ? { note: absence.note.trim() } : {};
    const item: Unavailability = absence.kind === "competing"
      ? { id: `u${index}`, personKey: absence.person, whileCompeting: absence.other, ...note }
      : { id: `u${index}`, personKey: absence.person, start: `${absence.day}T${absence.start}`, end: `${absence.day}T${absence.end}`, ...note };
    onChange({ ...value, unavailable: [...value.unavailable, item] });
    setAbsence(current => ({ ...current, person: "", other: "", note: "" }));
  }

  return <section className="pro-people people-panel">
    <div className="setup-heading"><h2>{t("proPeople.title")} <Hint align="start" text={t("proPeople.hint")} /></h2><button type="button" className="plain" onClick={() => { if (window.confirm(t("proPeople.confirmReimport"))) onReimport(); }}>{t("proPeople.reimport")}</button></div>

    <h3 className="panel-subheading">{t("proPeople.volunteers")} <span className="count-chip">{value.volunteers.length}</span> <Hint align="start" text={t("proPeople.volunteersHint")} /></h3>
    <div className="volunteer-area">
      {value.volunteers.length > 0 && <ul className="volunteer-list">{value.volunteers.map(item => <li key={item.key}><span>{item.name}</span>{item.wcaId && <small>{item.wcaId}</small>}<button type="button" onClick={() => removeVolunteer(item.key)} aria-label={t("people.remove", { name: item.name })}>×</button></li>)}</ul>}
      <form className="volunteer-form" onSubmit={event => { event.preventDefault(); addVolunteer(); }}>
        <input value={volunteer.name} onChange={event => setVolunteer(current => ({ ...current, name: event.target.value }))} placeholder={t("proPeople.volunteerName")} aria-label={t("proPeople.volunteerName")} />
        <input value={volunteer.wcaId} onChange={event => setVolunteer(current => ({ ...current, wcaId: event.target.value }))} placeholder={t("proPeople.volunteerWcaId")} aria-label={t("proPeople.volunteerWcaId")} aria-invalid={!!volunteerError} />
        <button className="button secondary" type="submit" disabled={!volunteer.name.trim() || !!volunteerError}>{t("people.add")}</button>
        {volunteerError && <small className="form-error">{volunteerError}</small>}
      </form>
    </div>

    {teams.length > 0 && <>
      <h3 className="panel-subheading">{t("proPeople.teams")} <Hint align="start" text={t("proPeople.teamsHint")} /></h3>
      <div className="volunteer-area">
        <div className="volunteer-form"><span>{t("proPeople.teamProperty")}</span><select value={teamProperty} onChange={event => onChange({ ...value, teamRoles: { property: event.target.value, map: {} } })} aria-label={t("proPeople.teamProperty")}>{value.propertyKeys.map(key => <option key={key} value={key}>{key}</option>)}</select></div>
        <div className="team-roles">{teams.map(([team, count]) => <label key={team}><span>{team} <small>{count}</small></span>
          <select value={teamRole(team)} onChange={event => setTeamRole(team, event.target.value as TeamRole | "none")}><option value="none">{t("proPeople.teamNone")}</option>{TEAM_ROLES.map(role => <option key={role} value={role}>{t(keyOf("people.lists", role))}</option>)}</select>
        </label>)}</div>
        <div className="volunteer-form"><button className="button secondary" type="button" onClick={applyTeams}>{t("proPeople.applyTeams")}</button>{teamMessage && <small role="status">{teamMessage}</small>}</div>
      </div>
    </>}

    <h3 className="panel-subheading">{t("proPeople.unavailable")} <span className="count-chip">{value.unavailable.length}</span> <Hint align="start" text={t("proPeople.unavailableHint")} /></h3>
    <div className="volunteer-area">
      {value.unavailable.length > 0 && <ul className="absence-list">{[...value.unavailable].sort((a, b) => nameOf(a.personKey).localeCompare(nameOf(b.personKey))).map(item => <li key={item.id}>
        <strong>{nameOf(item.personKey)}</strong>
        <span>{item.whileCompeting !== undefined ? t("proPeople.whileCompetingText", { name: nameOf(item.whileCompeting) }) : `${dayLabel(item.start!.slice(0, 10))} ${item.start!.slice(11)}–${item.end!.slice(11)}`}</span>
        {item.note && <small>{item.note}</small>}
        <button type="button" onClick={() => onChange({ ...value, unavailable: value.unavailable.filter(other => other.id !== item.id) })} aria-label={t("proPeople.removeUnavailable", { name: nameOf(item.personKey) })}>×</button>
      </li>)}</ul>}
      <form className="volunteer-form absence-form" onSubmit={event => { event.preventDefault(); addAbsence(); }}>
        <select value={absence.person} onChange={event => setAbsence(current => ({ ...current, person: event.target.value }))} aria-label={t("proPeople.person")}><option value="">{t("proPeople.person")}</option>{sortedPeople.map(person => <option key={personKey(person)} value={personKey(person)}>{person.name}</option>)}</select>
        <select value={absence.kind} onChange={event => setAbsence(current => ({ ...current, kind: event.target.value as "time" | "competing" }))} aria-label={t("proPeople.when")}><option value="time">{t("proPeople.timeRange")}</option><option value="competing">{t("proPeople.whileCompeting")}</option></select>
        {absence.kind === "time"
          ? <><select value={absence.day} onChange={event => setAbsence(current => ({ ...current, day: event.target.value }))} aria-label={t("schedule.day")}>{days.map(day => <option key={day} value={day}>{dayLabel(day)}</option>)}</select>
            <input type="time" step={300} value={absence.start} onChange={event => setAbsence(current => ({ ...current, start: event.target.value }))} aria-label={t("schedule.start")} />
            <input type="time" step={300} value={absence.end} onChange={event => setAbsence(current => ({ ...current, end: event.target.value }))} aria-label={t("schedule.end")} /></>
          : <select value={absence.other} onChange={event => setAbsence(current => ({ ...current, other: event.target.value }))} aria-label={t("proPeople.accompanies")}><option value="">{t("proPeople.accompanies")}</option>{sortedPeople.filter(person => !person.appKey && personKey(person) !== absence.person).map(person => <option key={personKey(person)} value={personKey(person)}>{person.name}</option>)}</select>}
        <input value={absence.note} onChange={event => setAbsence(current => ({ ...current, note: event.target.value }))} placeholder={t("proPeople.note")} aria-label={t("proPeople.note")} />
        <button className="button secondary" type="submit" disabled={!absenceReady}>{t("people.add")}</button>
      </form>
    </div>

    <h3 className="panel-subheading">{t("proPeople.importTitle")} <Hint align="start" text={t("proPeople.importHint")} /></h3>
    <SheetImportPanel people={people} value={value} onApply={onChange} />

    <h3 className="panel-subheading">{t("proPeople.properties")} <Hint align="start" text={t("proPeople.propertiesHint")} /></h3>
    <div className="property-toolbar">
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("proPeople.search")} aria-label={t("proPeople.search")} />
      <form onSubmit={event => { event.preventDefault(); addProperty(); }}>
        <input value={newProperty} onChange={event => setNewProperty(event.target.value)} placeholder={t("proPeople.newProperty")} aria-label={t("proPeople.newProperty")} />
        <button className="button secondary" type="submit" disabled={!newProperty.trim() || value.propertyKeys.includes(newProperty.trim())}>+ {t("proPeople.addProperty")}</button>
      </form>
    </div>
    <div className="property-table-wrap">
      <table className="property-table">
        <thead><tr><th>{t("proPeople.person")}</th>{value.propertyKeys.map(name => <th key={name}><span>{name}</span><button type="button" onClick={() => removeProperty(name)} aria-label={t("proPeople.removeProperty", { name })} title={t("proPeople.removeProperty", { name })}>×</button></th>)}</tr></thead>
        <tbody>{shown.map(person => {
          const key = personKey(person);
          return <tr key={key}>
            <th scope="row"><span>{person.name}</span><small>{person.appKey ? t("proPeople.volunteerTag") : person.wcaId ?? t("proPeople.newcomer")}</small></th>
            {/* Uncontrolled inputs saved on blur, so typing does not re-render the whole table. */}
            {value.propertyKeys.map(name => <td key={name}><input key={`${key}:${name}:${value.properties[key]?.[name] ?? ""}`} defaultValue={value.properties[key]?.[name] ?? ""} aria-label={`${person.name} · ${name}`} onBlur={event => { if (event.target.value.trim() !== (value.properties[key]?.[name] ?? "")) setProperty(key, name, event.target.value); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></td>)}
          </tr>;
        })}</tbody>
      </table>
      {value.propertyKeys.length === 0 && <p className="setup-note">{t("proPeople.noProperties")}</p>}
    </div>
    {matching.length > PAGE && <button type="button" className="plain more-toggle" onClick={() => setShowAll(current => !current)}>{showAll ? t("proPeople.showFewer") : t("proPeople.showAll", { count: matching.length })}</button>}
  </section>;
}
