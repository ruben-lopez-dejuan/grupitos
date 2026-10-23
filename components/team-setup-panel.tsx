"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n";
import { TASK_CODES } from "@/lib/assignments";
import { keyOf } from "@/lib/i18n";
import { propertyValues, type ProPeople } from "@/lib/pro/people";
import { defaultTeamProperty, TEAM_JOBS, TEAM_KINDS, teamSetups, type TeamBusy, type TeamSetup } from "@/lib/pro/teams";

type Lane = { key: string; name: string; hasStages: boolean };

/**
 * Teams read live from a person property: what each team does, where it works, which jobs it
 * takes and when it is busy. Changing someone's team in the properties table is enough.
 */
export function TeamSetupPanel({ value, onChange, lanes, days, dayLabel }: {
  value: ProPeople;
  onChange: (value: ProPeople) => void;
  lanes: Lane[];
  days: string[];
  dayLabel: (day: string) => string;
}) {
  const { t } = useI18n();
  const { property, setups } = teamSetups(value, value.teams, lanes);
  const teams = property ? propertyValues(value, property) : [];
  const [busy, setBusy] = useState({ team: "", day: days[0] ?? "", start: "09:00", end: "10:00" });

  const save = (team: string, change: Partial<TeamSetup>) => {
    const setup = Object.fromEntries([...setups].map(([name, item]) => [name, name === team ? { ...item, ...change } : item]));
    onChange({ ...value, teams: { property, setup } });
  };
  const busyTeam = busy.team || teams[0]?.[0] || "";
  const busyReady = busyTeam && busy.day && busy.end > busy.start;
  function addBusy() {
    if (!busyReady) return;
    const item: TeamBusy = { day: busy.day, start: busy.start, end: busy.end };
    save(busyTeam, { busy: [...(setups.get(busyTeam)?.busy ?? []), item] });
  }

  return <div className="volunteer-area team-setup">
    <div className="volunteer-form"><span>{t("proPeople.teamProperty")}</span>
      <select value={property} onChange={event => onChange({ ...value, teams: { property: event.target.value, setup: {} } })} aria-label={t("proPeople.teamProperty")}>
        {!property && <option value="">—</option>}
        {value.propertyKeys.map(key => <option key={key} value={key}>{key}{key === defaultTeamProperty(value) ? "" : ""}</option>)}
      </select>
    </div>
    {teams.length === 0 ? <p className="setup-note">{t("proPeople.noTeams")}</p> : <ul className="team-rows">{teams.map(([team, count]) => {
      const setup = setups.get(team) ?? { kind: "inherit" };
      const jobs = setup.jobs?.length ? setup.jobs : [...TEAM_JOBS];
      const works = setup.kind !== "notasks" && setup.kind !== "dataentry";
      return <li key={team}>
        <span className="team-name">{team} <small>{count}</small></span>
        <select value={setup.kind} onChange={event => save(team, { kind: event.target.value as TeamSetup["kind"] })} aria-label={t("proPeople.teamKindOf", { team })}>
          {TEAM_KINDS.map(kind => <option key={kind} value={kind}>{t(keyOf("proPeople.teamKinds", kind))}</option>)}
        </select>
        {works && lanes.length > 0 && <span className="team-lane">
          <select value={setup.lane ?? ""} onChange={event => save(team, { lane: event.target.value || undefined, ...(event.target.value ? {} : { laneOnly: undefined }) })} aria-label={t("proPeople.teamLaneOf", { team })}>
            <option value="">{t("proPeople.anyLane")}</option>
            {lanes.map(lane => <option key={lane.key} value={lane.key}>{t("proPeople.firstIn", { lane: lane.name })}</option>)}
          </select>
          {setup.lane && <label><input type="checkbox" checked={!!setup.laneOnly} onChange={event => save(team, { laneOnly: event.target.checked || undefined })} />{t("proPeople.onlyThere")}</label>}
        </span>}
        {works && <span className="team-jobs" role="group" aria-label={t("proPeople.teamJobsOf", { team })}>{TEAM_JOBS.map(job => {
          const on = jobs.includes(job);
          return <button key={job} type="button" aria-pressed={on} className={`cell-chip mini ${job} ${on ? "" : "off"}`} title={t(keyOf("tasks", job))} onClick={() => {
            const next = on ? jobs.filter(item => item !== job) : [...jobs, job];
            if (next.length) save(team, { jobs: next.length === TEAM_JOBS.length ? undefined : next });
          }}>{TASK_CODES[job]}</button>;
        })}</span>}
        {(setup.busy ?? []).length > 0 && <span className="team-busy">{setup.busy!.map((item, index) => <span key={index}>{dayLabel(item.day)} {item.start}–{item.end}<button type="button" onClick={() => save(team, { busy: setup.busy!.filter((_, other) => other !== index) })} aria-label={t("proPeople.removeBusy", { team })}>×</button></span>)}</span>}
      </li>;
    })}</ul>}
    {teams.length > 0 && days.length > 0 && <form className="volunteer-form" onSubmit={event => { event.preventDefault(); addBusy(); }}>
      <span>{t("proPeople.busyLead")}</span>
      <select value={busyTeam} onChange={event => setBusy(current => ({ ...current, team: event.target.value }))} aria-label={t("proPeople.busyTeam")}>{teams.map(([team]) => <option key={team} value={team}>{team}</option>)}</select>
      <select value={busy.day} onChange={event => setBusy(current => ({ ...current, day: event.target.value }))} aria-label={t("schedule.day")}>{days.map(day => <option key={day} value={day}>{dayLabel(day)}</option>)}</select>
      <input type="time" step={300} value={busy.start} onChange={event => setBusy(current => ({ ...current, start: event.target.value }))} aria-label={t("schedule.start")} />
      <input type="time" step={300} value={busy.end} onChange={event => setBusy(current => ({ ...current, end: event.target.value }))} aria-label={t("schedule.end")} />
      <button className="button secondary" type="submit" disabled={!busyReady}>{t("people.add")}</button>
    </form>}
  </div>;
}
