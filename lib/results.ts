/*
 * WCA result values as people read them: times in centiseconds, FMC moves (averages × 100) and
 * multi-blind's encoded value (WCA export format: 0DDTTTTTMM, and the old 1SSAATTTTT).
 */

/** Multi-blind: solved and attempted cubes and the time in seconds (undefined when unknown). */
export function decodeMultiResult(value: number) {
  if (value >= 1000000000) {
    // Old format: 1SSAATTTTT, SS = 99 - solved, AA = attempted.
    const solved = 99 - Math.floor(value / 10000000) % 100;
    const attempted = Math.floor(value / 100000) % 100;
    const seconds = value % 100000;
    return { solved, attempted, seconds: seconds === 99999 ? undefined : seconds };
  }
  // 0DDTTTTTMM: DD = 99 - (solved - missed), TTTTT seconds, MM missed.
  const difference = 99 - Math.floor(value / 10000000) % 100;
  const seconds = Math.floor(value / 100) % 100000;
  const missed = value % 100;
  const solved = difference + missed;
  return { solved, attempted: solved + missed, seconds: seconds === 99999 ? undefined : seconds };
}

function clock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const two = (number: number) => String(number).padStart(2, "0");
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** A result value for display; "—" without one (DNF -1 and DNS -2 included). */
export function formatResult(value: number | undefined, eventId: string) {
  if (value === undefined || value <= 0) return "—";
  if (eventId === "333mbf") {
    const { solved, attempted, seconds } = decodeMultiResult(value);
    return `${solved}/${attempted}${seconds === undefined ? "" : ` ${clock(seconds)}`}`;
  }
  if (eventId === "333fm") return value >= 1000 ? (value / 100).toFixed(2) : String(value);
  const seconds = value / 100;
  if (seconds < 60) return seconds.toFixed(2);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}
