"use client";

/** People's names at the WCA by WCA ID (server route with the user's session). */
export async function fetchWcaNames(ids: string[]): Promise<{ people: Record<string, { name: string; countryIso2?: string }>; missing: string[] } | undefined> {
  const wanted = [...new Set(ids.map(id => id.trim().toUpperCase()).filter(Boolean))];
  if (!wanted.length) return { people: {}, missing: [] };
  try {
    const response = await fetch(`/api/wca/persons?${new URLSearchParams({ ids: wanted.join(",") })}`);
    if (!response.ok) return undefined;
    return await response.json() as { people: Record<string, { name: string; countryIso2?: string }>; missing: string[] };
  } catch {
    return undefined;
  }
}
