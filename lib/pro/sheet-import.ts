/*
 * Importing a volunteer form (Google Sheets or pasted CSV) into PRO people, like CompScript's
 * ReadSpreadsheet (functions/sheets.js). Its headers are understood as they are
 * ("identifier:string:wcaId", "property:number:weight-judge", "ignore:name"), and plain headers
 * ("WCA ID", "ID", "Name"…) are guessed. Each row is matched to one person by WCA ID, then by
 * registrant id, then by e-mail and last by name, against everyone (existing volunteers too), so a
 * row never creates a second copy of someone. A name shared by two people matches nobody.
 */
import type { WcifPerson } from "@/lib/competition-store";
import { newVolunteerKey, type ProPeople } from "@/lib/pro/people";
import { personKey } from "@/lib/rounds";

export const IDENTITIES = ["wcaId", "registrantId", "email", "name"] as const;
export type Identity = typeof IDENTITIES[number];

export type SheetMapping = {
  /** Columns holding each identity; rows are matched in the order of IDENTITIES. */
  identity: Partial<Record<Identity, number>>;
  /** Columns imported as properties. */
  propertyColumns: number[];
  /** Property name per column (CompScript headers carry it); the header otherwise. */
  propertyNames?: Record<number, string>;
  /** Rows that match nobody become non-competing volunteers, named from the name column. */
  createVolunteers: boolean;
  /**
   * Like ReadSpreadsheet: the imported properties are first removed from everyone, so people who
   * left the sheet (or a team) lose them.
   */
  clearMissing: boolean;
};

export type RowOutcome = { row: number; label: string; by?: Identity; key?: string; result: "matched" | "created" | "ambiguous" | "unmatched" | "empty" };
export type SheetImportResult = { people: ProPeople; matched: number; created: number; unmatched: string[]; ambiguous: string[]; outcomes: RowOutcome[] };

/** The spreadsheet id from a Google Sheets URL, or the id itself. */
export function spreadsheetIdFromUrl(text: string) {
  const trimmed = text.trim();
  return trimmed.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/)?.[1] ?? (/^[A-Za-z0-9_-]{20,100}$/.test(trimmed) ? trimmed : undefined);
}

/** CSV or TSV as exported by Google Forms or Excel: quoted fields, "" escapes, , ; or tab. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = ["\t", ";", ","].map(candidate => ({ candidate, count: firstLine.split(candidate).length })).sort((a, b) => b.count - a.count)[0].candidate;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"" && text[index + 1] === "\"") { cell += "\""; index += 1; }
      else if (char === "\"") quoted = false;
      else cell += char;
    } else if (char === "\"" && cell === "") quoted = true;
    else if (char === separator) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(item => item.some(value => value.trim() !== ""));
}

export const normalizeName = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const normalizeIdentity = (identity: Identity, text: string) => identity === "name" ? normalizeName(text) : text.trim().toLowerCase();

/** CompScript header parts: "identifier:string:wcaId" → kind, type, name. */
function compscriptHeader(header: string) {
  const match = header.trim().match(/^(identifier|property|ignore)(?::([a-z]+))?(?::(.+))?$/i);
  if (!match) return undefined;
  return { kind: match[1].toLowerCase(), type: match[2]?.toLowerCase(), name: (match[3] ?? match[2] ?? "").trim() };
}

const COMPSCRIPT_IDENTITY: Record<string, Identity> = { wcaid: "wcaId", registrantid: "registrantId", email: "email", name: "name" };

/** A first guess of the mapping, from CompScript headers or plain ones. */
export function guessMapping(headers: string[]): SheetMapping {
  const parsed = headers.map(compscriptHeader);
  if (parsed.some(Boolean)) {
    const identity: SheetMapping["identity"] = {};
    const propertyColumns: number[] = [];
    const propertyNames: Record<number, string> = {};
    parsed.forEach((header, column) => {
      if (!header) return;
      const known = COMPSCRIPT_IDENTITY[header.name.replace(/[^a-z]/gi, "").toLowerCase()];
      // "ignore:name" is not used by CompScript, but it is the best name for a new volunteer.
      if ((header.kind === "identifier" || header.kind === "ignore") && known && identity[known] === undefined) identity[known] = column;
      if (header.kind === "property" && header.name) { propertyColumns.push(column); propertyNames[column] = header.name; }
    });
    return { identity, propertyColumns, propertyNames, createVolunteers: false, clearMissing: true };
  }
  const find = (pattern: RegExp) => headers.findIndex(header => pattern.test(header.trim()));
  const identity: SheetMapping["identity"] = {};
  const columns: Array<[Identity, RegExp]> = [["wcaId", /wca\s*id/i], ["registrantId", /^(registrant\s*id|id|n[ºo°.]*\s*(de\s*)?inscripci[oó]n)$/i], ["email", /e-?mail|correo/i], ["name", /name|nombre/i]];
  for (const [key, pattern] of columns) {
    const column = find(pattern);
    if (column >= 0 && !Object.values(identity).includes(column)) identity[key] = column;
  }
  const used = new Set(Object.values(identity));
  const propertyColumns = headers.map((_, index) => index).filter(index => !used.has(index) && !/marca temporal|timestamp/i.test(headers[index]));
  return { identity, propertyColumns, createVolunteers: false, clearMissing: false };
}

/** Every identity of everyone, to find a row's person; names shared by two people are ambiguous. */
function personIndex(people: WcifPerson[]) {
  const index = Object.fromEntries(IDENTITIES.map(identity => [identity, new Map<string, WcifPerson | null>()])) as Record<Identity, Map<string, WcifPerson | null>>;
  for (const person of people) {
    const values: Record<Identity, unknown> = { wcaId: person.wcaId, registrantId: person.registrantId, email: person.email, name: person.name };
    for (const identity of IDENTITIES) {
      const value = values[identity];
      if (value === undefined || value === null || value === "") continue;
      const normalized = normalizeIdentity(identity, String(value));
      const known = index[identity].get(normalized);
      // The same key twice is the same person; two different people make the value ambiguous.
      index[identity].set(normalized, known === undefined || (known && personKey(known) === personKey(person)) ? person : null);
    }
  }
  return index;
}

/**
 * Rows after the header are applied: matched people (and new volunteers, if asked) get the
 * imported properties; with `clearMissing`, everyone else loses them.
 */
export function applySheetImport(rows: string[][], mapping: SheetMapping, people: WcifPerson[], current: ProPeople): SheetImportResult {
  const [headers = [], ...data] = rows;
  const propertyNames = mapping.propertyColumns.map(column => mapping.propertyNames?.[column] ?? ((headers[column] ?? "").trim() || `col${column + 1}`));
  const volunteers = [...current.volunteers];
  const everyoneNow = [...people.filter(person => !person.appKey || volunteers.some(volunteer => volunteer.key === person.appKey))];
  // Existing volunteers can be matched too, so importing twice never copies anyone.
  for (const volunteer of volunteers) if (!everyoneNow.some(person => person.appKey === volunteer.key)) everyoneNow.push({ appKey: volunteer.key, name: volunteer.name, wcaId: volunteer.wcaId ?? null, registrantId: null });
  let index = personIndex(everyoneNow);

  const properties = { ...current.properties };
  if (mapping.clearMissing) {
    for (const [key, own] of Object.entries(properties)) {
      const rest = Object.fromEntries(Object.entries(own).filter(([name]) => !propertyNames.includes(name)));
      if (Object.keys(rest).length) properties[key] = rest;
      else delete properties[key];
    }
  }

  const outcomes: RowOutcome[] = [];
  data.forEach((row, position) => {
    const cell = (identity: Identity) => mapping.identity[identity] === undefined ? "" : (row[mapping.identity[identity]!] ?? "").trim();
    const label = cell("name") || cell("wcaId") || cell("registrantId") || cell("email") || `#${position + 2}`;
    if (IDENTITIES.every(identity => !cell(identity))) { outcomes.push({ row: position + 2, label, result: "empty" }); return; }
    let key: string | undefined;
    let by: Identity | undefined;
    let ambiguous = false;
    for (const identity of IDENTITIES) {
      const value = cell(identity);
      if (!value) continue;
      const found = index[identity].get(normalizeIdentity(identity, value));
      if (found === null) { ambiguous = true; continue; }
      if (found) { key = personKey(found); by = identity; break; }
    }
    let result: RowOutcome["result"] = key ? "matched" : ambiguous ? "ambiguous" : "unmatched";
    if (!key && !ambiguous && mapping.createVolunteers && cell("name")) {
      const wcaId = /^\d{4}[A-Z]{4}\d{2}$/i.test(cell("wcaId")) ? cell("wcaId").toUpperCase() : undefined;
      key = newVolunteerKey(volunteers);
      volunteers.push({ key, name: cell("name"), ...(wcaId ? { wcaId } : {}) });
      everyoneNow.push({ appKey: key, name: cell("name"), wcaId: wcaId ?? null, registrantId: null });
      index = personIndex(everyoneNow);
      result = "created";
    }
    outcomes.push({ row: position + 2, label, by, key, result });
    if (!key) return;
    const own = { ...(properties[key] ?? {}) };
    mapping.propertyColumns.forEach((column, at) => {
      const value = (row[column] ?? "").trim();
      if (value) own[propertyNames[at]] = value;
      else delete own[propertyNames[at]];
    });
    if (Object.keys(own).length) properties[key] = own;
    else delete properties[key];
  });

  return {
    people: { ...current, propertyKeys: [...new Set([...current.propertyKeys, ...propertyNames])], properties, volunteers },
    matched: outcomes.filter(item => item.result === "matched").length,
    created: outcomes.filter(item => item.result === "created").length,
    unmatched: outcomes.filter(item => item.result === "unmatched").map(item => item.label),
    ambiguous: outcomes.filter(item => item.result === "ambiguous").map(item => item.label),
    outcomes,
  };
}

/** Preference weights read by the scoring (CompScript's PreferenceScorer with prefix "weight-"). */
export const WEIGHT_PROPERTIES = ["weight-judge", "weight-scrambler", "weight-runner"];

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * A CSV to fill in and import back: one row per person (WCA ID, registrant id, name), the weight
 * and team columns, and every property already known, with its current values.
 */
export function propertiesTemplate(people: WcifPerson[], current: ProPeople) {
  const keys = [...new Set([...WEIGHT_PROPERTIES, "team", ...current.propertyKeys])];
  const sorted = [...people].sort((a, b) => (a.registrantId ?? Number.MAX_SAFE_INTEGER) - (b.registrantId ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
  const rows = [
    ["WCA ID", "ID", "Name", ...keys],
    ...sorted.map(person => [person.wcaId, person.registrantId, person.name, ...keys.map(key => current.properties[personKey(person)]?.[key])]),
  ];
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
