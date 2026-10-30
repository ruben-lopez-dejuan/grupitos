import { afterEach, describe, expect, it, vi } from "vitest";
import { readSharedSheet, SheetError, sheetsAccount } from "@/lib/google-sheets";
import { sheetGidFromUrl, spreadsheetIdFromUrl } from "@/lib/pro/sheet-import";

const ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

describe("Google Sheets service account", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is not configured without both variables", () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "reader@project.iam.gserviceaccount.com");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "");
    expect(sheetsAccount()).toBeUndefined();
  });

  it("reads a key stored with literal \\n, as Vercel and .env files keep it", () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", " reader@project.iam.gserviceaccount.com ");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n");
    expect(sheetsAccount()).toEqual({ email: "reader@project.iam.gserviceaccount.com", key: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----" });
  });
});

describe("sheets shared by link", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (body: string, init: ResponseInit) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, init)));
  const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (error: SheetError) => error.code);

  it("take the id and the tab from the link", () => {
    const link = `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing#gid=1234`;
    expect(spreadsheetIdFromUrl(link)).toBe(ID);
    expect(sheetGidFromUrl(link)).toBe("1234");
    expect(sheetGidFromUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toBeUndefined();
  });

  it("are read as CSV from the link's tab and cells", async () => {
    const csv = "WCA ID,team\n2017NICO01,Data entry\n";
    respond(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } });
    expect(await readSharedSheet(ID, "1234", "A1:Z")).toBe(csv);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ format: "csv", gid: "1234", range: "A1:Z" });
  });

  it("say so when the sheet is not shared, missing or names another sheet", async () => {
    // Not shared: Google answers with its sign-in page.
    respond("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
    expect(await failure(readSharedSheet(ID))).toBe("not-shared");
    respond("", { status: 401 });
    expect(await failure(readSharedSheet(ID))).toBe("not-shared");
    respond("", { status: 404 });
    expect(await failure(readSharedSheet(ID))).toBe("not-found");
    expect(await failure(readSharedSheet(ID, undefined, "Respuestas!A1:Z"))).toBe("range-sheet");
  });
});
