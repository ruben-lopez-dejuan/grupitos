/*
 * Importing a volunteer form (Google Sheets or pasted CSV) into PRO people, like CompScript's
 * ReadSpreadsheet: rows are matched to people by WCA ID, registrant id, e-mail or name; the
 * chosen columns become properties, and unmatched rows can become volunteers.
 */
import type { WcifPerson } from "@/lib/competition-store";
import { newVolunteerKey, type ProPeople } from "@/lib/pro/people";
import { personKey } from "@/lib/rounds";

export const MATCH_BY = ["wcaId", "registrantId", "email", "name"] as const;
export type MatchBy = typeof MATCH_BY[number];

export type SheetMapping = {
  matchBy: MatchBy;
  /** Column holding the value to match on. */
  matchColumn: number;
  /** Columns imported as properties, named after their header. */
  propertyColumns: number[];
  /** Unmatched rows become non-competing volunteers named from this column. */
  volunteerNameColumn?: number;
};

export type SheetImportResult = { people: ProPeople; matched: number; created: number; unmatched: string[] };

/** The spreadsheet id from a Google Sheets URL, or the id itself. */
export function spreadsheetIdFromUrl(text: string) {
  const trimmed = text.trim();
  return trimmed.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/)?.[1] ?? (/^[A-Za-z0-9_-]{20,100}$/.test(trimmed) ? trimmed : undefined);
}

/** CSV or TSV as exported by Google Forms or Excel: quoted fields, "" escapes, , ; or tab. */
export function parseCsv(text: string): string[][] {
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

const normalizeName = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** A good first guess of the identity column, from the headers. */
export function guessMapping(headers: string[]): Pick<SheetMapping, "matchBy" | "matchColumn"> {
  const find = (pattern: RegExp) => headers.findIndex(header => pattern.test(header));
  // The app's own template: the registrant id also finds newcomers without a WCA ID.
  const registrant = find(/^\s*(registrant\s*id|id)\s*$/i);
  if (registrant >= 0) return { matchBy: "registrantId", matchColumn: registrant };
  const wca = find(/wca\s*id/i);
  if (wca >= 0) return { matchBy: "wcaId", matchColumn: wca };
  const email = find(/e-?mail|correo/i);
  if (email >= 0) return { matchBy: "email", matchColumn: email };
  const name = find(/name|nombre/i);
  return { matchBy: "name", matchColumn: Math.max(0, name) };
}

function matcher(people: WcifPerson[], matchBy: MatchBy) {
  const index = new Map<string, WcifPerson>();
  for (const person of people) {
    const value = matchBy === "wcaId" ? person.wcaId : matchBy === "registrantId" ? person.registrantId : matchBy === "email" ? person.email : person.name;
    if (value !== undefined && value !== null && value !== "") index.set(matchBy === "name" ? normalizeName(String(value)) : String(value).trim().toLowerCase(), person);
  }
  return (text: string) => index.get(matchBy === "name" ? normalizeName(text) : text.trim().toLowerCase());
}

/** Preference weights read by the scoring (CompScript's PreferenceScorer with prefix "weight-"). */
export const WEIGHT_PROPERTIES = ["weight-judge", "weight-scrambler", "weight-runner"];

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * A CSV to fill in and import back: one row per person (registrant id, WCA ID, name), the weight
 * and team columns, and every property already known, with its current values.
 */
export function propertiesTemplate(people: WcifPerson[], current: ProPeople) {
  const keys = [...new Set([...WEIGHT_PROPERTIES, "team", ...current.propertyKeys])];
  const sorted = [...people].sort((a, b) => (a.registrantId ?? Number.MAX_SAFE_INTEGER) - (b.registrantId ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
  const rows = [
    ["ID", "WCA ID", "Name", ...keys],
    ...sorted.map(person => [person.registrantId, person.wcaId, person.name, ...keys.map(key => current.properties[personKey(person)]?.[key])]),
  ];
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Rows after the header are applied; existing values in imported columns are replaced. */
export function applySheetImport(rows: string[][], mapping: SheetMapping, people: WcifPerson[], current: ProPeople): SheetImportResult {
  const [headers = [], ...data] = rows;
  const propertyNames = mapping.propertyColumns.map(column => (headers[column] ?? "").trim() || `col${column + 1}`);
  const find = matcher(people, mapping.matchBy);
  const properties = { ...current.properties };
  const volunteers = [...current.volunteers];
  const unmatched: string[] = [];
  let matched = 0;
  let created = 0;
  for (const row of data) {
    const identity = (row[mapping.matchColumn] ?? "").trim();
    // Volunteers often have no WCA ID: a row with only a name can still become one.
    if (!identity && mapping.volunteerNameColumn === undefined) continue;
    const person = identity ? find(identity) : undefined;
    let key = person ? personKey(person) : undefined;
    if (key) matched += 1;
    else if (mapping.volunteerNameColumn !== undefined && (row[mapping.volunteerNameColumn] ?? "").trim()) {
      const name = row[mapping.volunteerNameColumn].trim();
      const existing = volunteers.find(volunteer => normalizeName(volunteer.name) === normalizeName(name));
      key = existing?.key ?? newVolunteerKey(volunteers);
      if (!existing) {
        const wcaId = mapping.matchBy === "wcaId" && /^\d{4}[A-Z]{4}\d{2}$/i.test(identity) ? identity.toUpperCase() : undefined;
        volunteers.push({ key, name, ...(wcaId ? { wcaId } : {}) });
        created += 1;
      }
    } else {
      if (identity) unmatched.push(identity);
      continue;
    }
    const own = { ...(properties[key] ?? {}) };
    mapping.propertyColumns.forEach((column, position) => {
      const value = (row[column] ?? "").trim();
      if (value) own[propertyNames[position]] = value;
      else delete own[propertyNames[position]];
    });
    if (Object.keys(own).length) properties[key] = own;
    else delete properties[key];
  }
  return {
    people: { ...current, propertyKeys: [...new Set([...current.propertyKeys, ...propertyNames])], properties, volunteers },
    matched,
    created,
    unmatched,
  };
}
