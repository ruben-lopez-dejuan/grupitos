import type { es } from "@/lib/i18n/messages/es";

/** Same shape as the Spanish dictionary, with any text as values. */
type Dictionary<T> = { [K in keyof T]: T[K] extends string ? string : Dictionary<T[K]> };
export type Messages = Dictionary<typeof es>;

/** Every dotted path to a text, e.g. "review.undo". */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

/** Keys with plural forms, without the _one / _other suffix. */
export type PluralKey = MessageKey extends infer K ? K extends `${infer Base}_one` ? Base : never : never;

export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;
export type TranslatePlural = (key: PluralKey, count: number, params?: Params) => string;
