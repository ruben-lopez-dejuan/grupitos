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
  constructor(readonly status: number) {
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
