"use client";

import { useMemo, useState } from "react";
import { Hint } from "@/components/hint";
import { SheetImportPanel } from "@/components/sheet-import-panel";
import { useI18n } from "@/components/i18n";
import type { WcifPerson } from "@/lib/competition-store";
import { TeamSetupPanel } from "@/components/team-setup-panel";
import { byName } from "@/lib/people";
import { newVolunteerKey, type ProPeople } from "@/lib/pro/people";
import { fetchWcaNames, type WcaAccount } from "@/lib/wca-persons";
import { WcaAccountLink } from "@/components/wca-account-link";
import { personKey } from "@/lib/rounds";

/** Rows shown before "show all", so typing stays fast in a 400-person table. */
const PAGE = 80;

/** PRO people: volunteers who do not compete and free-form properties per person. */
export function ProPeoplePanel({ people, days, value, onChange, onReimport, lanes, repair, onRepair }: {
  /** Accepted competitors and volunteers. */
  people: WcifPerson[];
  /** Competition days, for teams. */
  days: string[];
  value: ProPeople;
  onChange: (value: ProPeople) => void;
  onReimport: () => void;
  /** Rooms and stages a team can work in. */
  lanes: Array<{ key: string; name: string; hasStages: boolean }>;
  /** Volunteers copying a registered person and properties of nobody, to repair in one click. */
  repair?: { copies: number; orphans: number };
  onRepair?: () => void;
}) {
  const { t, tp, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [newProperty, setNewProperty] = useState("");
  const [volunteer, setVolunteer] = useState({ name: "", wcaId: "" });
  const dayLabel = (value: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const registeredWcaIds = useMemo(() => new Set(people.filter(person => !person.appKey && person.wcaId).map(person => person.wcaId!.toUpperCase())), [people]);

  const needle = query.trim().toLowerCase();
  const matching = [...people].sort(byName).filter(person => !needle || `${person.name} ${person.wcaId ?? ""} ${Object.values(value.properties[personKey(person)] ?? {}).join(" ")}`.toLowerCase().includes(needle));
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

  const [lookup, setLookup] = useState("");
  /** Links a volunteer to their WCA account: they are published as non-competing staff. The account's name wins. */
  function linkVolunteer(key: string, account: WcaAccount) {
    onChange({ ...value, volunteers: value.volunteers.map(item => item.key !== key ? item : { ...item, wcaUserId: account.id, name: account.name, ...(account.wcaId ? { wcaId: account.wcaId } : {}), ...(account.countryIso2 ? { countryIso2: account.countryIso2 } : {}) }) });
  }
  /** With a WCA ID, the name (and country) come from the WCA; the typed name is only a fallback. */
  async function addVolunteer() {
    if ((!volunteer.name.trim() && !wcaId) || volunteerError) return;
    let found: { name: string; countryIso2?: string } | undefined;
    if (wcaId) {
      setLookup(t("proPeople.lookingUp"));
      const result = await fetchWcaNames([wcaId]);
      found = result?.people[wcaId];
      setLookup(!result ? t("proPeople.lookupFailed") : found ? "" : t("proPeople.lookupMissing", { wcaId }));
      if (!found && !volunteer.name.trim()) return;
    }
    onChange({ ...value, volunteers: [...value.volunteers, { key: newVolunteerKey(value.volunteers), name: found?.name ?? volunteer.name.trim(), ...(wcaId ? { wcaId } : {}), ...(found?.countryIso2 ? { countryIso2: found.countryIso2 } : {}) }] });
    setVolunteer({ name: "", wcaId: "" });
  }

  function removeVolunteer(key: string) {
    const { [key]: _removed, ...properties } = value.properties;
    onChange({ ...value, volunteers: value.volunteers.filter(item => item.key !== key), properties });
  }

  return <section className="pro-people people-panel">
    <div className="setup-heading"><h2>{t("proPeople.title")} <Hint align="start" text={t("proPeople.hint")} /></h2><button type="button" className="plain" onClick={() => { if (window.confirm(t("proPeople.confirmReimport"))) onReimport(); }}>{t("proPeople.reimport")}</button></div>

    {repair && (repair.copies > 0 || repair.orphans > 0) && <div className="repair-note" role="alert">
      <p><strong>{t("proPeople.repairTitle")}</strong> {[repair.copies ? tp("proPeople.repairCopies", repair.copies) : "", repair.orphans ? tp("proPeople.repairOrphans", repair.orphans) : ""].filter(Boolean).join(" · ")}</p>
      <button className="button secondary" type="button" onClick={() => { if (window.confirm(t("proPeople.repairConfirm"))) onRepair?.(); }}>{t("proPeople.repair")}</button>
    </div>}

    <h3 className="panel-subheading">{t("proPeople.volunteers")} <span className="count-chip">{value.volunteers.length}</span> <Hint align="start" text={t("proPeople.volunteersHint")} /></h3>
    <div className="volunteer-area">
      {value.volunteers.length > 0 && <ul className="volunteer-list">{[...value.volunteers].sort(byName).map(item => <li key={item.key}><span>{item.name}</span>{item.wcaId && <small>{item.wcaId}</small>}<WcaAccountLink name={item.name} wcaId={item.wcaId} linked={item.wcaUserId} onLink={account => linkVolunteer(item.key, account)} /><button type="button" onClick={() => removeVolunteer(item.key)} aria-label={t("people.remove", { name: item.name })}>×</button></li>)}</ul>}
      <form className="volunteer-form" onSubmit={event => { event.preventDefault(); addVolunteer(); }}>
        <input value={volunteer.name} onChange={event => setVolunteer(current => ({ ...current, name: event.target.value }))} placeholder={t("proPeople.volunteerName")} aria-label={t("proPeople.volunteerName")} />
        <input value={volunteer.wcaId} onChange={event => setVolunteer(current => ({ ...current, wcaId: event.target.value }))} placeholder={t("proPeople.volunteerWcaId")} aria-label={t("proPeople.volunteerWcaId")} aria-invalid={!!volunteerError} />
        <button className="button secondary" type="submit" disabled={(!volunteer.name.trim() && !wcaId) || !!volunteerError}>{t("people.add")}</button>
        {volunteerError && <small className="form-error">{volunteerError}</small>}
        {lookup && <small role="status">{lookup}</small>}
      </form>
    </div>

    {value.propertyKeys.length > 0 && <>
      <h3 className="panel-subheading">{t("proPeople.teams")} <Hint align="start" text={t("proPeople.teamsHint")} /></h3>
      <TeamSetupPanel value={value} onChange={onChange} lanes={lanes} days={days} dayLabel={dayLabel} />
    </>}

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
