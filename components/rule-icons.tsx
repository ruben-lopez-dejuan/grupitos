import type { SortingRule } from "@/lib/rounds";

/**
 * Small diagrams of how each rule spreads competitors: three columns are three groups,
 * darker dots are faster competitors.
 */
const LEVEL = { best: 1, mid: 0.55, worst: 0.22 } as const;
type Level = keyof typeof LEVEL;

const COLUMNS = [8, 22, 36];
const ROWS = [8, 18, 28];

function Dots({ columns }: { columns: Level[][] }) {
  return <>{columns.flatMap((column, x) => column.map((level, y) => <circle key={`${x}-${y}`} cx={COLUMNS[x]} cy={ROWS[y]} r={4} fill="currentColor" opacity={LEVEL[level]} />))}</>;
}

const SYMMETRIC: Level[][] = [["best", "mid", "worst"], ["best", "mid", "worst"], ["best", "mid", "worst"]];

export function SortingRuleIcon({ rule }: { rule: SortingRule }) {
  return <svg className="rule-icon" viewBox="0 0 44 36" width="44" height="36" aria-hidden="true" focusable="false">
    {rule === "ranks" && <Dots columns={[["worst", "worst", "worst"], ["mid", "mid", "mid"], ["best", "best", "best"]]} />}
    {rule === "symmetric" && <Dots columns={SYMMETRIC} />}
    {rule === "balanced" && <>
      <Dots columns={[["worst", "worst", "worst"], ["best", "mid", "worst"], ["best", "best", "best"]]} />
      <line x1="15" y1="2" x2="15" y2="34" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
    </>}
    {rule === "scrambler-safe" && <>
      <Dots columns={SYMMETRIC} />
      {COLUMNS.map(x => <circle key={x} cx={x} cy={ROWS[0]} r={6} fill="none" stroke="currentColor" strokeWidth="1.3" />)}
    </>}
    {rule === "name-optimised" && COLUMNS.map((x, index) => <text key={x} x={x} y="24" textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor" opacity={index === 1 ? 0.35 : 1}>{index === 1 ? "B" : "A"}</text>)}
  </svg>;
}
