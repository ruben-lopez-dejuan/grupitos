"use client";

import { EventIcon } from "@/components/event-icon";
import { useEventName, useI18n } from "@/components/i18n";
import { appliesToRound, formatGroupNumbers, parseGroupNumbers, type SetGroups, type SetRounds } from "@/lib/pro/assignment-sets";

export type ScopeLane = { key: string; name: string; color: string };
export type ScopeRound = { id: string; eventId: string; roundNumber: number };
type Scope = { rounds: SetRounds; lanes: string[]; groups: SetGroups };

/** Which rounds and group numbers an assignment set or station rule covers (inline fields). */
export function ScopeFields({ value, onChange, rounds }: { value: Scope; onChange: (change: Partial<Scope>) => void; rounds: ScopeRound[] }) {
  const { t, tp } = useI18n();
  const covered = rounds.filter(round => appliesToRound({ rounds: value.rounds }, round));
  return <>
    <label><span>{t("sets.rounds")}</span>
      <select value={Array.isArray(value.rounds) ? "pick" : value.rounds} onChange={event => onChange({ rounds: event.target.value === "pick" ? covered.map(round => round.id) : event.target.value as "first" | "all" })}>
        <option value="first">{t("sets.firstRounds")}</option><option value="all">{t("sets.allRounds")}</option><option value="pick">{t("sets.pickRounds")}</option>
      </select>
      <small>{tp("sets.roundCount", covered.length)}</small>
    </label>
    <label><span>{t("sets.groups")}</span>
      <select value={Array.isArray(value.groups) ? "numbers" : value.groups} onChange={event => onChange({ groups: event.target.value === "numbers" ? [1] : event.target.value as "any" | "first" | "last" })}>
        <option value="any">{t("sets.anyGroup")}</option><option value="first">{t("sets.firstGroup")}</option><option value="last">{t("sets.lastGroup")}</option><option value="numbers">{t("sets.groupNumbers")}</option>
      </select>
      {Array.isArray(value.groups) && <input key={formatGroupNumbers(value.groups)} className="set-numbers" defaultValue={formatGroupNumbers(value.groups)} placeholder="1, 3-4" onBlur={event => { const numbers = parseGroupNumbers(event.target.value); onChange({ groups: numbers.length ? numbers : "any" }); }} aria-label={t("sets.groupNumbers")} />}
    </label>
  </>;
}

/** Rooms or stages, and the chosen rounds when picked one by one (rows under the fields). */
export function ScopeRows({ value, onChange, lanes, rounds }: { value: Scope; onChange: (change: Partial<Scope>) => void; lanes: ScopeLane[]; rounds: ScopeRound[] }) {
  const { t } = useI18n();
  const eventName = useEventName();
  return <>
    {lanes.length > 1 && <div className="set-lanes" role="group" aria-label={t("sets.where")}>
      <span>{t("sets.where")}</span>
      {lanes.map(lane => {
        const on = value.lanes.includes(lane.key);
        return <button key={lane.key} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => onChange({ lanes: on ? value.lanes.filter(key => key !== lane.key) : [...value.lanes, lane.key] })}><i style={{ background: lane.color }} />{lane.name}</button>;
      })}
      {!value.lanes.length && <small>{t("sets.anyLane")}</small>}
    </div>}
    {Array.isArray(value.rounds) && <div className="set-rounds" role="group" aria-label={t("sets.pickRounds")}>
      {rounds.map(round => {
        const picked = value.rounds as string[];
        const on = picked.includes(round.id);
        return <button key={round.id} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => onChange({ rounds: on ? picked.filter(id => id !== round.id) : [...picked, round.id] })} title={`${eventName(round.eventId)} · ${t("sets.roundNumber", { number: round.roundNumber })}`}><EventIcon eventId={round.eventId} />{round.roundNumber > 1 && <small>R{round.roundNumber}</small>}</button>;
      })}
    </div>}
  </>;
}
