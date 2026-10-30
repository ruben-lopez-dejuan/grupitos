/*
 * Server-only reading of a Google Sheet, no user OAuth. A sheet shared as "anyone with the link can
 * view" is read as CSV with no setup. With a service account the sheet can instead be shared with
 * the account's e-mail only, as with CompScript's ReadSpreadsheet; configure it with
 * GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (see docs/GOOGLE_SHEETS.md).
 */
import { createSign } from "node:crypto";

export type SheetErrorCode = "not-configured" | "forbidden" | "not-shared" | "not-found" | "range-sheet" | "too-large" | "google-error";

/** Largest CSV read from a shared link. */
const MAX_CSV = 5_000_000;

export class SheetError extends Error {
  constructor(readonly code: SheetErrorCode, readonly status?: number) {
    super(`Google Sheets: ${code}${status ? ` (${status})` : ""}`);
  }
}

export function sheetsAccount() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  // Vercel and .env files often store the PEM key with literal "\n".
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return email && key ? { email, key } : undefined;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(email: string, key: string) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }),
    cache: "no-store",
  });
  if (!response.ok) throw new SheetError("google-error", response.status);
  return (await response.json() as { access_token: string }).access_token;
}

function checkAccess(response: Response) {
  if (response.status === 403) throw new SheetError("forbidden", 403);
  if (response.status === 404) throw new SheetError("not-found", 404);
  if (!response.ok) throw new SheetError("google-error", response.status);
}

/** Title of the tab with this gid (the number in the link after #gid=). */
async function tabTitle(spreadsheetId: string, gid: string, token: string) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  checkAccess(response);
  const data = await response.json() as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  return data.sheets?.find(sheet => String(sheet.properties?.sheetId) === gid)?.properties?.title;
}

/**
 * The sheet's values as rows of text, with the service account. A range naming a sheet
 * ("Respuestas!A1:Z") reads that one; otherwise the link's tab (gid), or the first one.
 */
export async function readSheet(spreadsheetId: string, range?: string, gid?: string): Promise<string[][]> {
  const account = sheetsAccount();
  if (!account) throw new SheetError("not-configured");
  const token = await accessToken(account.email, account.key);
  const title = gid && !range?.includes("!") ? await tabTitle(spreadsheetId, gid, token) : undefined;
  const cells = title ? `'${title.replace(/'/g, "''")}'!${range ?? "A1:ZZ3000"}` : range ?? "A1:ZZ3000";
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(cells)}?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  checkAccess(response);
  const data = await response.json() as { values?: unknown[][] };
  return (data.values ?? []).map(row => row.map(cell => cell === null || cell === undefined ? "" : String(cell)));
}

/**
 * A sheet shared as "anyone with the link can view", as CSV text: no account needed. Reads the
 * link's tab (gid), or the first one; a range can only give cells (A1:Z), not another sheet.
 */
export async function readSharedSheet(spreadsheetId: string, gid?: string, range?: string): Promise<string> {
  if (range?.includes("!")) throw new SheetError("range-sheet");
  const query = new URLSearchParams({ format: "csv", ...(gid ? { gid } : {}), ...(range ? { range } : {}) });
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?${query}`, { cache: "no-store" });
  if (response.status === 404) throw new SheetError("not-found", 404);
  // A sheet that is not shared by link ends in Google's sign-in page instead of a CSV.
  const csv = response.ok && response.headers.get("content-type")?.includes("text/csv");
  if (!csv) throw new SheetError(response.ok || response.status === 401 || response.status === 403 ? "not-shared" : "google-error", response.status);
  if (Number(response.headers.get("content-length")) > MAX_CSV) throw new SheetError("too-large");
  const text = await response.text();
  if (text.length > MAX_CSV) throw new SheetError("too-large");
  return text;
}
