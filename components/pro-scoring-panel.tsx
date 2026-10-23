"use client";

import { Hint } from "@/components/hint";
import { useI18n } from "@/components/i18n";
import { keyOf } from "@/lib/i18n";
import { CRITERIA, matchingProfile, PROFILE_WEIGHTS, SCORING_PROFILES, type ScoringConfig } from "@/lib/pro/scoring";

/** PRO: choose the weighted engine and tune each criterion's weight, from presets or by hand. */
export function ProScoringPanel({ value, onChange }: { value: ScoringConfig; onChange: (value: ScoringConfig) => void }) {
  const { t } = useI18n();
  const profile = matchingProfile(value.weights);
  return <div className="scoring-panel">
    <label className="scoring-switch"><input type="checkbox" checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })} /><span><strong>{t("scoring.enable")}</strong><small>{t("scoring.enableHelp")}</small></span></label>
    {value.enabled && <>
      <div className="scoring-profiles" role="radiogroup" aria-label={t("scoring.profile")}>
        <span>{t("scoring.profile")}</span>
        {SCORING_PROFILES.map(item => <button key={item} type="button" role="radio" aria-checked={profile === item} className={profile === item ? "selected" : ""} onClick={() => onChange({ ...value, weights: PROFILE_WEIGHTS[item] })}>{t(keyOf("scoring.profiles", item))}</button>)}
        {!profile && <em>{t("scoring.custom")}</em>}
      </div>
      <div className="scoring-criteria">{CRITERIA.map(criterion => {
        const weight = value.weights[criterion];
        return <label key={criterion} className="criterion">
          <span className="criterion-name">{t(keyOf("scoring.criteria", `${criterion}.label`))}<Hint text={t(keyOf("scoring.criteria", `${criterion}.help`))} /></span>
          <input type="range" min={-100} max={100} step={1} value={weight} onChange={event => onChange({ ...value, weights: { ...value.weights, [criterion]: Number(event.target.value) } })} aria-label={t(keyOf("scoring.criteria", `${criterion}.label`))} />
          <output className={weight > 0 ? "positive" : weight < 0 ? "negative" : "off"}>{weight > 0 ? `+${weight}` : weight}</output>
        </label>;
      })}</div>
    </>}
  </div>;
}
