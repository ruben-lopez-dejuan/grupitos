"use client";

/**
 * A "?" that shows an explanation on hover or keyboard focus, so screens can stay short.
 * Clicks are swallowed: it often sits inside a <label> and must not toggle its checkbox.
 */
export function Hint({ text, align = "center" }: { text: string; align?: "center" | "start" | "end" }) {
  return <span
    className={`hint align-${align}`}
    tabIndex={0}
    role="img"
    aria-label={text}
    data-hint={text}
    onClick={event => { event.preventDefault(); event.stopPropagation(); }}
  >?</span>;
}
