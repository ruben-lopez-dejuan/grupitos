import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { readSharedSheet, readSheet, SheetError, sheetsAccount, type SheetErrorCode } from "@/lib/google-sheets";

const STATUS: Record<SheetErrorCode, number> = { "not-configured": 501, forbidden: 403, "not-shared": 403, "not-found": 404, "range-sheet": 400, "too-large": 413, "google-error": 502 };

/**
 * GET ?id=<spreadsheet id>[&gid=<tab>][&range=A1:Z]: the rows of a sheet shared with the service
 * account or, failing that, with anyone with the link. Without an id: whether a service account is
 * configured, and its e-mail.
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
  const gid = url.searchParams.get("gid") ?? undefined;
  if (gid !== undefined && !/^\d{1,12}$/.test(gid)) return NextResponse.json({ error: "invalid-id" }, { status: 400 });
  try {
    if (sheetsAccount()) {
      try {
        return NextResponse.json({ rows: await readSheet(id, range, gid) }, { headers });
      } catch (error) {
        // Not shared with the account: it may still be shared by link.
        if (!(error instanceof SheetError && error.code === "forbidden")) throw error;
      }
    }
    return NextResponse.json({ rows: parseCsv(await readSharedSheet(id, gid, range)) }, { headers });
  } catch (error) {
    const code = error instanceof SheetError ? error.code : "google-error";
    return NextResponse.json({ error: code, email: sheetsAccount()?.email }, { status: STATUS[code] });
  }
}
