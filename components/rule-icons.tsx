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
    {rule === "scrambler-safe" && <>
      <Dots columns={SYMMETRIC} />
      {COLUMNS.map(x => <circle key={x} cx={x} cy={ROWS[0]} r={6} fill="none" stroke="currentColor" strokeWidth="1.3" />)}
    </>}
  </svg>;
}
