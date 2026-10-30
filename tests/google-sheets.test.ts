import { afterEach, describe, expect, it, vi } from "vitest";
import { sheetsAccount } from "@/lib/google-sheets";

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
