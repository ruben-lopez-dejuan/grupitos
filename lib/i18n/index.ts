import { en } from "@/lib/i18n/messages/en";
import { es } from "@/lib/i18n/messages/es";
import type { MessageKey, Messages, Params, PluralKey, Translate, TranslatePlural } from "@/lib/i18n/types";

export type { MessageKey, Messages, PluralKey, Translate, TranslatePlural } from "@/lib/i18n/types";

/**
 * Available languages. To add one: copy messages/es.ts to messages/<code>.ts,
 * translate it (TypeScript flags any missing key) and add it here.
 */
export const LOCALES = {
  es: { name: "Español", messages: es as Messages },
  en: { name: "English", messages: en },
} satisfies Record<string, { name: string; messages: Messages }>;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "wca-easy-groups-locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && value in LOCALES;
}

/** Best supported language for an Accept-Language header or navigator.languages. */
export function matchLocale(preferred: string[]): Locale {
  for (const tag of preferred) {
    const base = tag.trim().toLowerCase().split(/[-;]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

const format = (text: string, params?: Params) => text.replace(/\{(\w+)\}/g, (match, name: string) => params && params[name] !== undefined ? String(params[name]) : match);

export function createTranslator(locale: Locale): { t: Translate; tp: TranslatePlural } {
  const messages = LOCALES[locale].messages;
  const fallback = LOCALES[DEFAULT_LOCALE].messages;
  const plurals = new Intl.PluralRules(locale);
  const t: Translate = (key, params) => format(lookup(messages, key) ?? lookup(fallback, key) ?? key, params);
  const tp: TranslatePlural = (key, count, params) => {
    // Languages may add _few, _many… forms; anything missing falls back to _other.
    const form = `${key}_${plurals.select(count)}`;
    const text = lookup(messages, form) ?? lookup(messages, `${key}_other`) ?? lookup(fallback, `${key}_other`) ?? key;
    return format(text, { count, ...params });
  };
  return { t, tp };
}

/** Builds the dotted key for dictionaries indexed by an id (events, tasks…). */
export const keyOf = <T extends string>(prefix: string, id: T) => `${prefix}.${id}` as MessageKey;
