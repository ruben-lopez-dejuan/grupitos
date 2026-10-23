import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { readSheet, SheetError, sheetsAccount } from "@/lib/google-sheets";

/**
 * GET ?id=<spreadsheet id>[&range=Sheet!A1:Z]: the rows of a sheet shared with the service account.
 * Without an id: whether reading is configured, and the e-mail to share sheets with.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const headers = { "Cache-Control": "private, no-store" };
  if (!id) return NextResponse.json({ configured: !!sheetsAccount(), email: sheetsAccount()?.email }, { headers });
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) return NextResponse.json({ error: "invalid-id" }, { status: 400 });
  const range = url.searchParams.get("range") ?? undefined;
  if (range !== undefined && (range.length > 120 || /[\r\n]/.test(range))) return NextResponse.json({ error: "invalid-range" }, { status: 400 });
  try {
    return NextResponse.json({ rows: await readSheet(id, range) }, { headers });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "google-error";
    return NextResponse.json({ error: code, email: sheetsAccount()?.email }, { status: code === "not-configured" ? 501 : code === "forbidden" ? 403 : code === "not-found" ? 404 : 502 });
  }
}
