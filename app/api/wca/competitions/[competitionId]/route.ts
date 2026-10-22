import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { wcaFetch } from "@/lib/wca";

export async function GET(_request: Request, { params }: { params: Promise<{ competitionId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { competitionId } = await params;
  if (!/^[A-Za-z0-9]+$/.test(competitionId)) {
    return NextResponse.json({ error: "Identificador no válido." }, { status: 400 });
  }
  try {
    const wcif = await wcaFetch(`/api/v0/competitions/${encodeURIComponent(competitionId)}/wcif`, session.accessToken);
    return NextResponse.json(wcif, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo importar." }, { status: 502 });
  }
}
