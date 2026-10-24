export const WCA_BASE_URL = process.env.WCA_BASE_URL ?? "https://www.worldcubeassociation.org";

export type WcaCompetition = {
  id: string; name: string; city?: string; country_iso2?: string;
  start_date: string; end_date: string; venue_address?: string;
};

/**
 * WCIF major version requested from the WCA (GET /competitions/{id}/wcif/version/2, currently
 * format 2.2). Writes go to PATCH /competitions/{id}/wcif and must include `formatVersion` and `id`.
 */
export const WCIF_VERSION = 2;

/** A non-OK answer from the WCA API; the interface writes the message. */
export class WcaError extends Error {
  /** `detail`: what the WCA said, when it explains the refusal (a bad WCIF, a wrong start date…). */
  constructor(readonly status: number, readonly detail?: string) {
    super(`WCA API status ${status}`);
  }
}

export async function wcaFetch<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${WCA_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store"
  });
  if (!response.ok) throw new WcaError(response.status);
  return response.json() as Promise<T>;
}

/** Saves (part of) a WCIF: PATCH /competitions/{id}/wcif. The body must carry `formatVersion` and `id`. */
export async function wcaPatchWcif(competitionId: string, wcif: unknown, accessToken: string) {
  const response = await fetch(`${WCA_BASE_URL}/api/v0/competitions/${encodeURIComponent(competitionId)}/wcif`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(wcif),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const body = JSON.parse(text) as { error?: unknown; status?: unknown };
      detail = typeof body.error === "string" ? body.error : body.error ? JSON.stringify(body.error) : typeof body.status === "string" ? body.status : text;
    } catch {
      // Not JSON: keep the text.
    }
    throw new WcaError(response.status, detail.slice(0, 500));
  }
  return text ? JSON.parse(text) as unknown : {};
}
