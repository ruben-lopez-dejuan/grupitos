import { describe, expect, it } from "vitest";
import { competingGroup } from "@/lib/assignments";
import { demoCompetition } from "@/lib/demo-competition";
import { DEFAULT_OPTIONS, generateAssignments } from "@/lib/group-generator";
import { peopleFromWcif } from "@/lib/people";
import { initialRounds } from "@/lib/rounds";
import { DEFAULT_SEATING, normalizeSeating, seatingStations, stationOrder, tablesInRow } from "@/lib/seating";

/** Place in the group (1 = the best) seated at each station, left to right. */
const places = (order: number[]) => {
  const byStation = new Map(order.map((station, index) => [station, index + 1]));
  return Array.from({ length: order.length }, (_, index) => byStation.get(index + 1));
};

describe("seating at fixed stations", () => {
  it("is in seed order by default", () => {
    expect(DEFAULT_SEATING.order).toBe("ranked");
    expect(stationOrder(5, undefined)).toEqual([1, 2, 3, 4, 5]);
    expect(stationOrder(5, DEFAULT_SEATING)).toEqual([1, 2, 3, 4, 5]);
  });

  it("seats the top 16 from the centre: | 7 5 | 3 1 | 2 4 | 6 8 | in front, the same behind", () => {
    const order = stationOrder(16, { order: "center", rows: 2, tables: 4, seats: 2 });
    expect(places(order)).toEqual([7, 5, 3, 1, 2, 4, 6, 8, 15, 13, 11, 9, 10, 12, 14, 16]);
  });

  it("fills a shorter last row and an odd row from their own middle", () => {
    expect(places(stationOrder(12, { order: "center", rows: 2, tables: 4, seats: 2 }))).toEqual([7, 5, 3, 1, 2, 4, 6, 8, 11, 9, 10, 12]);
    expect(places(stationOrder(5, { order: "center", rows: 1, tables: 5, seats: 1 }))).toEqual([4, 2, 1, 3, 5]);
  });

  it("lets each row have its own tables, each filled from its own middle", () => {
    const seating = normalizeSeating({ order: "center", rows: 2, tables: 4, seats: 2, rowTables: [3, 4] });
    expect(seatingStations(seating)).toBe(14);
    // Front: | 5 3 | 1 2 | 4 6 |; behind, 4 tables: | 13 11 | 9 7 | 8 10 | 12 14 |.
    expect(places(stationOrder(14, seating))).toEqual([5, 3, 1, 2, 4, 6, 13, 11, 9, 7, 8, 10, 12, 14]);
    // A third row repeats the last one; the same tables everywhere need no list.
    expect(tablesInRow(seating, 2)).toBe(4);
    expect(normalizeSeating({ ...seating, rowTables: [4, 4] })).toEqual({ order: "center", rows: 2, tables: 4, seats: 2 });
    expect(normalizeSeating({ ...seating, rows: 3 }).rowTables).toEqual([3, 4, 4]);
  });

  it("reads missing or broken values as the defaults", () => {
    expect(normalizeSeating(undefined)).toEqual(DEFAULT_SEATING);
    expect(normalizeSeating({ order: "sideways" as never, rows: 0, tables: 3, seats: Number.NaN })).toEqual({ ...DEFAULT_SEATING, tables: 3 });
  });

  it("gives the best of each fixed-station group the centre stations of the front row", () => {
    const competition = demoCompetition("small");
    const rounds = initialRounds(competition, 8, "fixed").filter(round => round.id === "333-r1").map(round => ({ ...round, enabled: true, groups: 2 }));
    const seating = { order: "center" as const, rows: 1, tables: 4, seats: 2 };
    const rows = generateAssignments({ competition, rounds, stations: 8, zoneMode: "fixed", seating, people: peopleFromWcif(competition), options: { ...DEFAULT_OPTIONS, spreadDelegates: false } });
    for (const group of [1, 2]) {
      const members = rows.filter(row => row.roundId === "333-r1" && competingGroup(row) === group).sort((a, b) => (a.seedResult ?? Infinity) - (b.seedResult ?? Infinity));
      expect(members.length).toBeGreaterThanOrEqual(4);
      // The two best of the group sit at stations 4 and 5, either side of the centre.
      expect(members.slice(0, 2).map(row => row.station)).toEqual([4, 5]);
      // Eight stations, eight seated, each at a different one; the rest of the group gets none.
      const seated = members.filter(row => row.station !== undefined).map(row => row.station);
      expect(new Set(seated).size).toBe(8);
    }
  });
});
