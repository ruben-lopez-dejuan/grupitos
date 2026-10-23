import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { WcaError, wcaFetch } from "@/lib/wca";

const WCA_ID = /^\d{4}[A-Z]{4}\d{2}$/;

/** Names and countries of people by WCA ID (?ids=2016LOPE37,2015ROME03), for volunteers who do not compete. */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").map(id => id.trim().toUpperCase()).filter(id => WCA_ID.test(id)))].slice(0, 200);
  const people: Record<string, { name: string; countryIso2?: string }> = {};
  const missing: string[] = [];
  // A few at a time, to be gentle with the WCA API.
  for (let start = 0; start < ids.length; start += 8) {
    await Promise.all(ids.slice(start, start + 8).map(async id => {
      try {
        const data = await wcaFetch<{ person?: { name?: string; country_iso2?: string } }>(`/api/v0/persons/${encodeURIComponent(id)}`, session.accessToken!);
        if (data.person?.name) people[id] = { name: data.person.name, ...(data.person.country_iso2 ? { countryIso2: data.person.country_iso2 } : {}) };
        else missing.push(id);
      } catch (error) {
        if (error instanceof WcaError && error.status === 404) missing.push(id);
        else throw error;
      }
    }));
  }
  return NextResponse.json({ people, missing }, { headers: { "Cache-Control": "private, no-store" } });
}
