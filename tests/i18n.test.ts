import { describe, expect, it } from "vitest";
import { DUTY_ROLES } from "@/lib/assignments";
import { createTranslator, keyOf, LOCALES, matchLocale, type Locale } from "@/lib/i18n";
import { validateRound } from "@/lib/validation";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) => typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`));
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
const locales = Object.keys(LOCALES) as Locale[];
const reference = new Map(leaves(LOCALES.es.messages as unknown as Tree));

describe("dictionaries", () => {
  it.each(locales)("%s has every key of the reference, with the same placeholders", locale => {
    const texts = new Map(leaves(LOCALES[locale].messages as unknown as Tree));
    expect([...texts.keys()].sort()).toEqual([...reference.keys()].sort());
    for (const [key, text] of reference) expect([key, placeholders(texts.get(key)!)]).toEqual([key, placeholders(text)]);
  });

  it.each(locales)("%s has no empty texts except optional help", locale => {
    const empty = leaves(LOCALES[locale].messages as unknown as Tree).filter(([key, text]) => !text.trim() && !key.endsWith(".help")).map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("covers every task, issue code and WCA event", () => {
    const { t } = createTranslator("en");
    for (const role of [...DUTY_ROLES, "competitor"]) expect(t(keyOf("tasks", role))).not.toMatch(/^tasks\./);
    for (const event of ["222", "333", "444", "555", "666", "777", "333bf", "333fm", "333oh", "333mbf", "444bf", "555bf", "clock", "minx", "pyram", "skewb", "sq1"]) expect(t(keyOf("events", event))).not.toMatch(/^events\./);
    const issues = validateRound("333-r1", [{ id: "a", roundId: "333-r1", eventId: "333", personId: "a", name: "A", inRound: true, tasks: [] }], { groups: 1, scramblers: 1, runners: 1, stations: 1, fixedStations: true, checkJudges: true, checkDelegates: true, checkDataEntry: true, noNormalTasks: new Set() });
    for (const issue of issues) expect(t(keyOf("issues", issue.code))).not.toMatch(/^issues\./);
  });
});

describe("translator", () => {
  it("fills placeholders and picks plural forms", () => {
    const { t, tp } = createTranslator("en");
    expect(t("people.remove", { name: "Ana" })).toBe("Remove Ana");
    expect(tp("review.errors", 1)).toBe("1 error");
    expect(tp("review.errors", 3)).toBe("3 errors");
    expect(createTranslator("es").tp("review.warnings", 2)).toBe("2 avisos");
  });

  it("matches the browser's preferred language, defaulting to Spanish", () => {
    expect(matchLocale(["en-GB", "es"])).toBe("en");
    expect(matchLocale(["fr-FR", "es-ES;q=0.8"])).toBe("es");
    expect(matchLocale(["de"])).toBe("es");
  });
});
