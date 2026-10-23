/*
 * Server-only reading of a Google Sheet with a service account (no user OAuth): the sheet is
 * shared with the account's e-mail, as with CompScript's ReadSpreadsheet. Configure with
 * GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (see docs/GOOGLE_SHEETS.md).
 */
import { createSign } from "node:crypto";

export type SheetErrorCode = "not-configured" | "forbidden" | "not-found" | "google-error";

export class SheetError extends Error {
  constructor(readonly code: SheetErrorCode, readonly status?: number) {
    super(`Google Sheets: ${code}${status ? ` (${status})` : ""}`);
  }
}

export function sheetsAccount() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  // Vercel and .env files often store the PEM key with literal "\n".
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\n/g, "\n").trim();
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

/** The sheet's values as rows of text; the first sheet when no range names one. */
export async function readSheet(spreadsheetId: string, range = "A1:ZZ3000"): Promise<string[][]> {
  const account = sheetsAccount();
  if (!account) throw new SheetError("not-configured");
  const token = await accessToken(account.email, account.key);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 403) throw new SheetError("forbidden", 403);
  if (response.status === 404) throw new SheetError("not-found", 404);
  if (!response.ok) throw new SheetError("google-error", response.status);
  const data = await response.json() as { values?: unknown[][] };
  return (data.values ?? []).map(row => row.map(cell => cell === null || cell === undefined ? "" : String(cell)));
}
