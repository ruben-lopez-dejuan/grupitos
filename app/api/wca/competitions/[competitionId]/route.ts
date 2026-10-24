import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { WCIF_VERSION, WcaError, wcaFetch, wcaPatchWcif } from "@/lib/wca";

export async function GET(_request: Request, { params }: { params: Promise<{ competitionId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { competitionId } = await params;
  if (!/^[A-Za-z0-9]+$/.test(competitionId)) {
    return NextResponse.json({ error: "invalid-id" }, { status: 400 });
  }
  try {
    // Pin the WCIF format: the WCA recommends asking for a version explicitly. With a token the
    // private WCIF comes back (persons with e-mail, registrations…), so no /public is needed.
    const wcif = await wcaFetch(`/api/v0/competitions/${encodeURIComponent(competitionId)}/wcif/version/${WCIF_VERSION}`, session.accessToken);
    return NextResponse.json(wcif, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(error instanceof WcaError ? { error: "wca-status", status: error.status } : { error: "import-failed" }, { status: 502 });
  }
}

/**
 * Publishes to the WCA with the signed-in person's token. Only what the app builds goes through:
 * the body must be this competition's WCIF patch, with `formatVersion` and `id`.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ competitionId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { competitionId } = await params;
  if (!/^[A-Za-z0-9]+$/.test(competitionId)) return NextResponse.json({ error: "invalid-id" }, { status: 400 });
  let body: { id?: unknown; formatVersion?: unknown; events?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-body" }, { status: 400 });
  }
  // Events are never sent: the app does not change rounds, formats or results.
  if (!body || body.id !== competitionId || typeof body.formatVersion !== "string" || "events" in body) {
    return NextResponse.json({ error: "invalid-body" }, { status: 400 });
  }
  try {
    const result = await wcaPatchWcif(competitionId, body, session.accessToken);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(error instanceof WcaError ? { error: "wca-status", status: error.status, detail: error.detail } : { error: "publish-failed" }, { status: 502 });
  }
}
