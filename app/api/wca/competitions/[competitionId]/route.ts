import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { WCIF_VERSION, WcaError, wcaFetch } from "@/lib/wca";

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
