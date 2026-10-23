"use client";

import { useMemo, useState } from "react";
import { Hint } from "@/components/hint";
import { useEventName, useI18n } from "@/components/i18n";
import type { WcifPerson } from "@/lib/competition-store";
import { keyOf } from "@/lib/i18n";
import { byName, type PeopleSettings } from "@/lib/people";
import type { ProPeople } from "@/lib/pro/people";
import { CONDITION_KINDS, ROUND_KINDS, defaultRule, newSegmentId, PROPERTY_OPS, SEGMENT_ROLES, SEGMENT_TEMPLATES, segmentMembers, type Condition, type Segment, type SegmentRule } from "@/lib/pro/segments";
import { personKey } from "@/lib/rounds";

/** Events whose personal bests are not times. */
const NOT_TIMED = ["333fm", "333mbf"];
const PREVIEW = 60;

/** "1:05.40" or "65.4" seconds to centiseconds. */
function parseTime(text: string) {
  const match = text.trim().match(/^(?:(\d+):)?(\d+(?:[.,]\d{1,2})?)$/);
  if (!match) return undefined;
  return Math.round(((Number(match[1] ?? 0) * 60) + Number(match[2].replace(",", "."))) * 100);
}

function formatTime(centiseconds: number) {
  const minutes = Math.floor(centiseconds / 6000);
  const seconds = (centiseconds % 6000) / 100;
  return minutes ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

/** PRO segments: named filters of people, built visually, with a live count and member list. */
export function ProSegmentsPanel({ people, eventIds, settings, proPeople, segments, onChange }: {
  people: WcifPerson[];
  eventIds: string[];
  settings: PeopleSettings;
  proPeople: ProPeople;
  segments: Segment[];
  onChange: (segments: Segment[]) => void;
}) {
  const { t, tp } = useI18n();
  const eventName = useEventName();
  const [selectedId, setSelectedId] = useState<string | undefined>(segments[0]?.id);
  const selected = segments.find(segment => segment.id === selectedId) ?? segments[0];
  const context = useMemo(() => ({ people: settings, pro: proPeople, segments }), [settings, proPeople, segments]);
  const counts = useMemo(() => new Map(segments.map(segment => [segment.id, segmentMembers(segment, people, context).length])), [segments, people, context]);
  const members = useMemo(() => selected ? [...segmentMembers(selected, people, context)].sort(byName) : [], [selected, people, context]);
  const countries = useMemo(() => [...new Set(people.map(person => person.countryIso2).filter((value): value is string => !!value))].sort(), [people]);
  const options = { propertyKeys: proPeople.propertyKeys, eventIds, countries, segmentIds: segments.filter(segment => segment.id !== selected?.id).map(segment => segment.id) };

  const save = (segment: Segment) => onChange(segments.map(item => item.id === segment.id ? segment : item));
  const setRule = (index: number, rule: SegmentRule) => selected && save({ ...selected, rules: selected.rules.map((item, position) => position === index ? rule : item) });

  function create(template?: typeof SEGMENT_TEMPLATES[number]) {
    const id = newSegmentId(segments);
    const segment: Segment = { id, name: template ? t(keyOf("segments.templates", template.id)) : t("segments.newName", { number: segments.length + 1 }), ...(template?.segment ?? { match: "all", rules: [] }) };
    onChange([...segments, segment]);
    setSelectedId(id);
  }

  function remove(segment: Segment) {
    const used = segments.filter(other => other.rules.some(rule => rule.kind === "segment" && rule.id === segment.id));
    if (!window.confirm(used.length ? t("segments.confirmRemoveUsed", { name: segment.name, others: used.map(other => other.name).join(", ") }) : t("segments.confirmRemove", { name: segment.name }))) return;
    onChange(segments.filter(item => item.id !== segment.id).map(other => ({ ...other, rules: other.rules.filter(rule => !(rule.kind === "segment" && rule.id === segment.id)) })));
    setSelectedId(undefined);
  }

  const ruleFields = (rule: SegmentRule, index: number) => {
    const set = (change: Partial<Condition>) => setRule(index, { ...rule, ...change } as SegmentRule);
    switch (rule.kind) {
      case "role": return <select value={rule.role} onChange={event => set({ role: event.target.value as typeof rule.role })} aria-label={t("segments.kinds.role")}>{SEGMENT_ROLES.map(role => <option key={role} value={role}>{t(keyOf("segments.roles", role))}</option>)}</select>;
      case "property": return <>
        <select value={rule.key} onChange={event => set({ key: event.target.value })} aria-label={t("segments.kinds.property")}>{[...new Set([rule.key, ...proPeople.propertyKeys])].filter(Boolean).map(key => <option key={key} value={key}>{key}</option>)}{!rule.key && <option value="">—</option>}</select>
        <select value={rule.op} onChange={event => set({ op: event.target.value as typeof rule.op })} aria-label={t("segments.operator")}>{PROPERTY_OPS.map(op => <option key={op} value={op}>{t(keyOf("segments.ops", op))}</option>)}</select>
        {rule.op !== "set" && rule.op !== "unset" && <input value={rule.value ?? ""} onChange={event => set({ value: event.target.value })} placeholder={t("segments.value")} aria-label={t("segments.value")} />}
      </>;
      case "age": return <>
        <select value={rule.op} onChange={event => set({ op: event.target.value as typeof rule.op })} aria-label={t("segments.operator")}><option value="lt">{t("segments.ops.lt")}</option><option value="gte">{t("segments.ops.gte")}</option></select>
        <input type="number" min={0} max={120} value={rule.value} onChange={event => set({ value: Number(event.target.value) })} aria-label={t("segments.years")} /><span>{t("segments.years")}</span>
      </>;
      case "registered": return <select value={rule.eventId} onChange={event => set({ eventId: event.target.value })} aria-label={t("segments.kinds.registered")}>{eventIds.map(eventId => <option key={eventId} value={eventId}>{eventName(eventId)}</option>)}</select>;
      case "pb": return <>
        <select value={rule.eventId} onChange={event => set({ eventId: event.target.value })} aria-label={t("segments.kinds.pb")}>{eventIds.filter(eventId => !NOT_TIMED.includes(eventId)).map(eventId => <option key={eventId} value={eventId}>{eventName(eventId)}</option>)}</select>
        <select value={rule.type} onChange={event => set({ type: event.target.value as typeof rule.type })} aria-label={t("segments.pbType")}><option value="average">{t("segments.average")}</option><option value="single">{t("segments.single")}</option></select>
        <span>&lt;</span>
        <input key={`${rule.value}`} defaultValue={formatTime(rule.value)} onBlur={event => { const value = parseTime(event.target.value); if (value) set({ value }); else event.target.value = formatTime(rule.value); }} aria-label={t("segments.time")} className="time-input" />
      </>;
      case "newcomer": return null;
      case "roundRegistered": return <small className="round-note" title={t("segments.roundDependent")}>↻</small>;
      case "roundPb": {
        const events = eventIds.filter(eventId => !NOT_TIMED.includes(eventId));
        const setLimit = (eventId: string, text: string) => {
          const { [eventId]: _old, ...limits } = rule.limits;
          const value = parseTime(text);
          set({ limits: value ? { ...limits, [eventId]: value } : limits });
        };
        const setMapping = (eventId: string, source: string) => {
          const { [eventId]: _old, ...mapping } = rule.mapping;
          set({ mapping: source && source !== eventId ? { ...mapping, [eventId]: source } : mapping });
        };
        return <div className="limit-table" title={t("segments.roundDependent")}>
          <strong>{t("segments.limitsTitle")}</strong>
          {events.map(eventId => {
            const source = rule.mapping[eventId] || eventId;
            return <div key={eventId} className="limit-row">
              <span>{eventName(eventId)}</span>
              <select value={rule.mapping[eventId] ?? ""} onChange={event => setMapping(eventId, event.target.value)} aria-label={`${eventName(eventId)} · ${t("segments.useResultOf")}`}><option value="">{t("segments.sameEvent")}</option>{events.filter(other => other !== eventId).map(other => <option key={other} value={other}>{t("segments.useResultOf")} {eventName(other)}</option>)}</select>
              {source === eventId
                ? <input key={`${eventId}:${rule.limits[eventId] ?? ""}`} defaultValue={rule.limits[eventId] ? formatTime(rule.limits[eventId]) : ""} placeholder={t("segments.noLimit")} onBlur={event => setLimit(eventId, event.target.value)} aria-label={`${eventName(eventId)} · ${t("segments.time")}`} className="time-input" />
                : <small>{rule.limits[source] ? `< ${formatTime(rule.limits[source])}` : t("segments.noLimit")}</small>}
            </div>;
          })}
        </div>;
      }
      case "country": return <select value={rule.iso2} onChange={event => set({ iso2: event.target.value })} aria-label={t("segments.kinds.country")}>{[...new Set([rule.iso2, ...countries])].map(iso2 => <option key={iso2} value={iso2}>{iso2}</option>)}</select>;
      case "segment": return <select value={rule.id} onChange={event => set({ id: event.target.value })} aria-label={t("segments.kinds.segment")}>{!rule.id && <option value="">—</option>}{segments.filter(segment => segment.id !== selected?.id).map(segment => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select>;
    }
  };

  return <section className="pro-segments people-panel">
    <div className="setup-heading"><h2>{t("segments.title")} <Hint align="start" text={t("segments.hint")} /></h2></div>
    <div className="segments-layout">
      <aside className="segment-list">
        {segments.map(segment => <button key={segment.id} type="button" className={segment.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(segment.id)}><span>{segment.name}</span><small>{counts.get(segment.id)}</small></button>)}
        <button type="button" className="segment-new" onClick={() => create()}>+ {t("segments.new")}</button>
        <div className="segment-templates"><small>{t("segments.templatesTitle")}</small>{SEGMENT_TEMPLATES.map(template => <button key={template.id} type="button" className="plain" onClick={() => create(template)}>{t(keyOf("segments.templates", template.id))}</button>)}</div>
      </aside>
      {!selected ? <p className="setup-note">{t("segments.empty")}</p> : <div className="segment-editor">
        <div className="segment-head">
          <input className="segment-name" value={selected.name} onChange={event => save({ ...selected, name: event.target.value })} aria-label={t("segments.name")} />
          <button type="button" className="plain danger" onClick={() => remove(selected)}>{t("segments.remove")}</button>
        </div>
        <div className="segment-match">
          <span>{t("segments.matchLead")}</span>
          <select value={selected.match} onChange={event => save({ ...selected, match: event.target.value as Segment["match"] })} aria-label={t("segments.matchLead")}><option value="all">{t("segments.matchAll")}</option><option value="any">{t("segments.matchAny")}</option></select>
          <span>{t("segments.matchTail")}</span>
        </div>
        <ol className="segment-rules">{selected.rules.map((rule, index) => <li key={index}>
          <label className={`negate ${rule.negate ? "on" : ""}`} title={t("segments.negateHelp")}><input type="checkbox" checked={!!rule.negate} onChange={event => setRule(index, { ...rule, negate: event.target.checked })} />{t("segments.negate")}</label>
          <select value={rule.kind} onChange={event => setRule(index, { ...defaultRule(event.target.value as Condition["kind"], options), negate: rule.negate })} aria-label={t("segments.condition")}>{CONDITION_KINDS.filter(kind => kind !== "segment" || options.segmentIds.length || rule.kind === "segment").filter(kind => kind !== "property" || proPeople.propertyKeys.length || rule.kind === "property").map(kind => <option key={kind} value={kind}>{t(keyOf("segments.kinds", kind))}</option>)}</select>
          {ruleFields(rule, index)}
          <button type="button" className="rule-remove" onClick={() => save({ ...selected, rules: selected.rules.filter((_, position) => position !== index) })} aria-label={t("segments.removeRule")}>×</button>
        </li>)}</ol>
        <button type="button" className="button secondary add-rule" onClick={() => save({ ...selected, rules: [...selected.rules, defaultRule("role", options)] })}>+ {t("segments.addRule")}</button>
        <div className="segment-members">
          <strong>{tp("segments.members", members.length)}{selected.rules.some(rule => ROUND_KINDS.includes(rule.kind)) && <small> · {t("segments.roundDependent")}</small>}</strong>
          <div>{members.slice(0, PREVIEW).map(person => <span key={personKey(person)}>{person.name}</span>)}{members.length > PREVIEW && <em>{t("segments.more", { count: members.length - PREVIEW })}</em>}</div>
        </div>
      </div>}
    </div>
  </section>;
}
