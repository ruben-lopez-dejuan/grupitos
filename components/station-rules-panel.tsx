"use client";

import { ScopeFields, ScopeRows, type ScopeLane, type ScopeRound } from "@/components/group-scope";
import { useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import { formatGroupNumbers, parseGroupNumbers } from "@/lib/pro/assignment-sets";
import { newStationRuleId, STATION_SORTS, type StationExclusion, type StationRuleConfig } from "@/lib/pro/station-rules";

/**
 * PRO: station rules (CompScript's StationAssignmentRule). In the groups a rule covers, stations
 * follow an order, and exclusions keep a cluster away from some stations. The first rule that
 * covers a group is the one used.
 */
export function StationRulesPanel({ rules, onChange, segments, lanes, rounds, propertyKeys }: {
  rules: StationRuleConfig[];
  onChange: (rules: StationRuleConfig[]) => void;
  segments: Array<{ id: string; name: string; size: number }>;
  lanes: ScopeLane[];
  rounds: ScopeRound[];
  propertyKeys: string[];
}) {
  const { t } = useI18n();
  const save = (rule: StationRuleConfig) => onChange(rules.map(item => item.id === rule.id ? rule : item));
  const move = (index: number, step: -1 | 1) => {
    const next = [...rules];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  };
  const add = () => onChange([...rules, { id: newStationRuleId(rules), rounds: "all", lanes: [], groups: "any", mode: "ascending", sortBy: "seed", exclusions: [] }]);
  const setExclusion = (rule: StationRuleConfig, index: number, change: Partial<StationExclusion>) => save({ ...rule, exclusions: rule.exclusions.map((item, position) => position === index ? { ...item, ...change } : item) });

  return <div className="assignment-sets station-rules">
    {rules.length === 0 && <p className="setup-note">{t("stationRules.empty")}</p>}
    <ol>{rules.map((rule, index) => <li key={rule.id} className={rule.off ? "off" : ""}>
      <div className="set-head">
        <span className="task-order-position">{index + 1}</span>
        <div className="set-fields station-order">
          <span>{t("stationRules.lead")}</span>
          <select value={rule.sortBy} onChange={event => save({ ...rule, sortBy: event.target.value as StationRuleConfig["sortBy"], property: event.target.value === "property" ? rule.property ?? propertyKeys[0] : undefined })} aria-label={t("stationRules.sortBy")}>
            {STATION_SORTS.filter(sort => sort !== "property" || propertyKeys.length || rule.sortBy === "property").map(sort => <option key={sort} value={sort}>{t(keyOf("stationRules.sorts", sort))}</option>)}
          </select>
          {rule.sortBy === "property" && <select value={rule.property ?? ""} onChange={event => save({ ...rule, property: event.target.value })} aria-label={t("stationRules.property")}>{[...new Set([rule.property ?? "", ...propertyKeys])].filter(Boolean).map(key => <option key={key} value={key}>{key}</option>)}</select>}
          <select value={rule.mode} onChange={event => save({ ...rule, mode: event.target.value as StationRuleConfig["mode"] })} aria-label={t("stationRules.mode")}>
            <option value="ascending">{t(rule.sortBy === "name" ? "stationRules.ascendingName" : "stationRules.ascending")}</option>
            <option value="descending">{t(rule.sortBy === "name" ? "stationRules.descendingName" : "stationRules.descending")}</option>
          </select>
        </div>
        <label className="set-on"><input type="checkbox" checked={!rule.off} onChange={event => save({ ...rule, off: !event.target.checked })} />{t("sets.active")}</label>
        <span className="task-order-moves">
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("stationRules.up", { number: index + 1 })}>↑</button>
          <button type="button" disabled={index === rules.length - 1} onClick={() => move(index, 1)} aria-label={t("stationRules.down", { number: index + 1 })}>↓</button>
          <button type="button" onClick={() => onChange(rules.filter(item => item.id !== rule.id))} aria-label={t("stationRules.remove", { number: index + 1 })}>×</button>
        </span>
      </div>
      <div className="set-fields"><ScopeFields value={rule} onChange={change => save({ ...rule, ...change })} rounds={rounds} /></div>
      <ScopeRows value={rule} onChange={change => save({ ...rule, ...change })} lanes={lanes} rounds={rounds} />
      {rule.exclusions.map((exclusion, position) => <div key={position} className="set-fields station-exclusion">
        <span>{t("stationRules.keep")}</span>
        <select value={exclusion.segment ?? ""} onChange={event => setExclusion(rule, position, { segment: event.target.value || undefined })} aria-label={t("stationRules.cluster")}>
          <option value="">—</option>
          {segments.map(segment => <option key={segment.id} value={segment.id}>{segment.name} ({segment.size})</option>)}
          {exclusion.segment && !segments.some(segment => segment.id === exclusion.segment) && <option value={exclusion.segment}>{t("sets.missingCluster")}</option>}
        </select>
        <span>{t("stationRules.awayFrom")}</span>
        <input key={formatGroupNumbers(exclusion.stations)} className="set-numbers" defaultValue={formatGroupNumbers(exclusion.stations)} placeholder="1-2" onBlur={event => setExclusion(rule, position, { stations: parseGroupNumbers(event.target.value) })} aria-label={t("stationRules.stations")} />
        <button type="button" className="rule-remove" onClick={() => save({ ...rule, exclusions: rule.exclusions.filter((_, other) => other !== position) })} aria-label={t("stationRules.removeExclusion")}>×</button>
      </div>)}
      <div className="station-exclusion-add"><button type="button" className="plain" disabled={!segments.length} onClick={() => save({ ...rule, exclusions: [...rule.exclusions, { segment: segments[0]?.id, stations: [1, 2] }] })}>+ {t("stationRules.addExclusion")}</button></div>
    </li>)}</ol>
    <div className="set-templates"><button type="button" className="plain" onClick={add}>+ {t("stationRules.add")}</button></div>
  </div>;
}
