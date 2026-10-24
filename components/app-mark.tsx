/** The app's icon (same drawing as app/icon.svg): three groups of a cube face. */
export function AppMark({ className = "app-mark" }: { className?: string }) {
  const rows = [1, 0.72, 0.45];
  return <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#2457c5" />
    {rows.map((opacity, row) => [13, 26.5, 40].map(x => <rect key={`${row}-${x}`} x={x} y={12 + row * 15} width="11" height="10" rx="2.5" fill="#fff" opacity={opacity} />))}
  </svg>;
}
