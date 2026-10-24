import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { WcaError, wcaFetch } from "@/lib/wca";

type WcaUser = { id?: number; name?: string; wca_id?: string | null; country_iso2?: string; avatar?: { thumb_url?: string } };

/**
 * WCA accounts by name or WCA ID (?q=…), also accounts without a WCA ID: someone who never competed
 * can be added to the WCIF as non-competing staff once linked to their account.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (query.length < 3) return NextResponse.json({ accounts: [] });
  try {
    const data = await wcaFetch<{ result?: WcaUser[] }>(`/api/v0/search/users?${new URLSearchParams({ q: query })}`, session.accessToken);
    const accounts = (data.result ?? []).filter(user => typeof user.id === "number" && user.name).slice(0, 15).map(user => ({
      id: user.id!, name: user.name!, ...(user.wca_id ? { wcaId: user.wca_id } : {}), ...(user.country_iso2 ? { countryIso2: user.country_iso2 } : {}), ...(user.avatar?.thumb_url ? { thumb: user.avatar.thumb_url } : {}),
    }));
    return NextResponse.json({ accounts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(error instanceof WcaError ? { error: "wca-status", status: error.status } : { error: "search-failed" }, { status: 502 });
  }
}
