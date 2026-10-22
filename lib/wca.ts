export const WCA_BASE_URL = process.env.WCA_BASE_URL ?? "https://www.worldcubeassociation.org";

export type WcaCompetition = {
  id: string; name: string; city_name?: string; country_iso2?: string;
  start_date: string; end_date: string; venue_address?: string;
};

export async function wcaFetch<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${WCA_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store"
  });
  if (!response.ok) throw new Error(`La WCA respondió con el estado ${response.status}`);
  return response.json() as Promise<T>;
}
