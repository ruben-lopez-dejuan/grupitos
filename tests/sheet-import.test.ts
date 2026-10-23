import { describe, expect, it } from "vitest";
import type { WcifPerson } from "@/lib/competition-store";
import { EMPTY_PRO_PEOPLE } from "@/lib/pro/people";
import { applySheetImport, guessMapping, parseCsv, propertiesTemplate, spreadsheetIdFromUrl } from "@/lib/pro/sheet-import";

const people: WcifPerson[] = [
  { registrantId: 1, name: "Lucía García", wcaId: "2015GARC01" },
  { registrantId: 2, name: "Álvaro Pérez", wcaId: "2018PERE02" },
  { registrantId: 3, name: "Hugo Newcomer", wcaId: null },
];

describe("sheet import", () => {
  it("finds the spreadsheet id in a URL", () => {
    expect(spreadsheetIdFromUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0")).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
    expect(spreadsheetIdFromUrl("not a sheet")).toBeUndefined();
  });

  it("parses quoted CSV, semicolons and tabs", () => {
    expect(parseCsv("Name,Team\n\"García, Lucía\",\"Data \"\"entry\"\"\"\r\nHugo,\n")).toEqual([["Name", "Team"], ["García, Lucía", "Data \"entry\""], ["Hugo", ""]]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("guesses the identity column from the headers", () => {
    expect(guessMapping(["Marca temporal", "Nombre", "WCA ID", "Equipo"])).toEqual({ matchBy: "wcaId", matchColumn: 2 });
    expect(guessMapping(["Nombre completo", "Turno"])).toEqual({ matchBy: "name", matchColumn: 0 });
  });

  it("matches people, imports properties and turns unknown rows into volunteers", () => {
    const rows = [["WCA ID", "Nombre", "Equipo", "% juez"], ["2015garc01", "Lucía", "Data entry", "80"], ["2018PERE02", "Álvaro", "", "50"], ["2019HELP01", "Helper", "Registro", ""], ["", "Sin WCA ID", "Registro", ""], ["", "", "", ""]];
    const current = { ...EMPTY_PRO_PEOPLE, propertyKeys: ["Equipo"], properties: { "2": { Equipo: "Streaming" } } };
    const result = applySheetImport(rows, { matchBy: "wcaId", matchColumn: 0, propertyColumns: [2, 3], volunteerNameColumn: 1 }, people, current);
    expect([result.matched, result.created, result.unmatched]).toEqual([2, 2, []]);
    expect(result.people.propertyKeys).toEqual(["Equipo", "% juez"]);
    expect(result.people.properties["1"]).toEqual({ Equipo: "Data entry", "% juez": "80" });
    // An empty cell clears the old value.
    expect(result.people.properties["2"]).toEqual({ "% juez": "50" });
    expect(result.people.volunteers).toEqual([{ key: "vol-1", name: "Helper", wcaId: "2019HELP01" }, { key: "vol-2", name: "Sin WCA ID" }]);
    expect(result.people.properties["vol-1"]).toEqual({ Equipo: "Registro" });
  });

  it("matches names ignoring accents and reports the rest", () => {
    const result = applySheetImport([["Nombre", "Turno"], ["alvaro perez", "mañana"], ["Nadie", "tarde"]], { matchBy: "name", matchColumn: 0, propertyColumns: [1] }, people, EMPTY_PRO_PEOPLE);
    expect(result.people.properties["2"]).toEqual({ Turno: "mañana" });
    expect(result.unmatched).toEqual(["Nadie"]);
  });
});

describe("weights template", () => {
  it("lists everyone with the weight columns and imports back by registrant id", () => {
    const current = { ...EMPTY_PRO_PEOPLE, propertyKeys: ["shirt"], properties: { "2": { shirt: "M", "weight-judge": "3" } } };
    const csv = `﻿${propertiesTemplate(people, current)}`;
    const rows = parseCsv(csv);
    expect(rows[0].map(header => header.replace("﻿", ""))).toEqual(["ID", "WCA ID", "Name", "weight-judge", "weight-scrambler", "weight-runner", "team", "shirt"]);
    expect(rows[2]).toEqual(["2", "2018PERE02", "Álvaro Pérez", "3", "", "", "", "M"]);
    expect(guessMapping(rows[0])).toEqual({ matchBy: "registrantId", matchColumn: 0 });
    // The newcomer (no WCA ID) gets a scrambler weight.
    rows[3][4] = "5";
    const result = applySheetImport(rows, { matchBy: "registrantId", matchColumn: 0, propertyColumns: [3, 4, 5, 6, 7] }, people, current);
    expect(result.matched).toBe(3);
    expect(result.people.properties["3"]).toEqual({ "weight-scrambler": "5" });
    expect(result.people.properties["2"]).toEqual({ shirt: "M", "weight-judge": "3" });
  });
});
