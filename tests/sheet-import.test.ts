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

  it("guesses the identity columns from plain headers", () => {
    expect(guessMapping(["Marca temporal", "Nombre", "WCA ID", "Equipo"])).toEqual({ identity: { wcaId: 2, name: 1 }, propertyColumns: [3], createVolunteers: false, clearMissing: false });
    expect(guessMapping(["WCA ID", "ID", "Name", "team"]).identity).toEqual({ wcaId: 0, registrantId: 1, name: 2 });
  });

  it("reads CompScript headers as they are", () => {
    const mapping = guessMapping(["ignore:name", "identifier:string:wcaId", "property:string:team", "property:number:weight-judge", "property:number:delegate-cluster"]);
    expect(mapping).toEqual({ identity: { name: 0, wcaId: 1 }, propertyColumns: [2, 3, 4], propertyNames: { 2: "team", 3: "weight-judge", 4: "delegate-cluster" }, createVolunteers: false, clearMissing: true });
  });

  it("matches by WCA ID, then ID, then name, and never copies anyone", () => {
    const rows = [["WCA ID", "ID", "Name", "team"], ["2015garc01 ", "", "Lucía García", "Data entry"], ["", "3", "Hugo", "Registro"], ["2099NONE01", "", "álvaro  perez", "Streaming"], ["", "", "Nadie", "Otro"]];
    const result = applySheetImport(rows, guessMapping(rows[0]), people, EMPTY_PRO_PEOPLE);
    expect(result.outcomes.map(item => [item.label, item.result, item.by, item.key])).toEqual([
      ["Lucía García", "matched", "wcaId", "1"], ["Hugo", "matched", "registrantId", "3"], ["álvaro  perez", "matched", "name", "2"], ["Nadie", "unmatched", undefined, undefined],
    ]);
    expect(result.people.volunteers).toEqual([]);
    expect(result.people.properties).toEqual({ "1": { team: "Data entry" }, "3": { team: "Registro" }, "2": { team: "Streaming" } });
  });

  it("creates volunteers only when asked, and finds them again on the next import", () => {
    const rows = [["WCA ID", "Name", "team"], ["2019HELP01", "Helper", "Registro"], ["", "Sin WCA ID", "Registro"]];
    const mapping = { ...guessMapping(rows[0]), createVolunteers: true };
    const first = applySheetImport(rows, mapping, people, EMPTY_PRO_PEOPLE);
    expect(first.people.volunteers).toEqual([{ key: "vol-1", name: "Helper", wcaId: "2019HELP01" }, { key: "vol-2", name: "Sin WCA ID" }]);
    const again = applySheetImport(rows, mapping, people, first.people);
    expect(again.created).toBe(0);
    expect(again.people.volunteers).toHaveLength(2);
    expect(again.outcomes.map(item => item.by)).toEqual(["wcaId", "name"]);
  });

  it("does not guess between two people with the same name", () => {
    const twins: WcifPerson[] = [...people, { registrantId: 4, name: "Lucía García", wcaId: "2020GARC09" }];
    const result = applySheetImport([["Name", "team"], ["Lucia Garcia", "Otro"]], { identity: { name: 0 }, propertyColumns: [1], createVolunteers: true, clearMissing: false }, twins, EMPTY_PRO_PEOPLE);
    expect(result.ambiguous).toEqual(["Lucia Garcia"]);
    expect(result.people.volunteers).toEqual([]);
  });

  it("removes the imported properties from people who left the sheet, as ReadSpreadsheet does", () => {
    const current = { ...EMPTY_PRO_PEOPLE, propertyKeys: ["team", "shirt"], properties: { "2": { team: "Registro", shirt: "M" }, "3": { team: "Otro" } } };
    const rows = [["identifier:string:wcaId", "property:string:team"], ["2015GARC01", "Data entry"]];
    const result = applySheetImport(rows, guessMapping(rows[0]), people, current);
    expect(result.people.properties).toEqual({ "2": { shirt: "M" }, "1": { team: "Data entry" } });
  });
});

describe("weights template", () => {
  it("lists everyone with the weight columns and imports back by registrant id", () => {
    const current = { ...EMPTY_PRO_PEOPLE, propertyKeys: ["shirt"], properties: { "2": { shirt: "M", "weight-judge": "3" } } };
    const csv = `﻿${propertiesTemplate(people, current)}`;
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["WCA ID", "ID", "Name", "weight-judge", "weight-scrambler", "weight-runner", "team", "shirt"]);
    expect(rows[2]).toEqual(["2018PERE02", "2", "Álvaro Pérez", "3", "", "", "", "M"]);
    expect(guessMapping(rows[0]).identity).toEqual({ wcaId: 0, registrantId: 1, name: 2 });
    // The newcomer (no WCA ID) is found by ID and gets a scrambler weight.
    rows[3][4] = "5";
    const result = applySheetImport(rows, guessMapping(rows[0]), people, current);
    expect(result.matched).toBe(3);
    expect(result.people.properties["3"]).toEqual({ "weight-scrambler": "5" });
    expect(result.people.properties["2"]).toEqual({ shirt: "M", "weight-judge": "3" });
  });
});
