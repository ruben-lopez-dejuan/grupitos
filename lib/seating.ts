/*
 * How competitors sit at fixed stations. Stations are numbered left to right, front row first
 * (row 1 holds its tables×seats stations, then row 2…). Rows can have different numbers of tables.
 * "ranked" gives the best of the group station 1, the
 * second station 2…; "center" fills the front row from the middle outwards, left of the centre
 * first, then the next row the same way: with 4 tables of 2, the top 8 sit | 7 5 | 3 1 | 2 4 | 6 8 |.
 */
export type SeatingOrder = "ranked" | "center";
export const SEATING_ORDERS: SeatingOrder[] = ["ranked", "center"];

/** `tables`: tables of every row, unless `rowTables` gives each row its own number (front row first). */
export type Seating = { order: SeatingOrder; rows: number; tables: number; seats: number; rowTables?: number[] };

export const DEFAULT_SEATING: Seating = { order: "ranked", rows: 2, tables: 4, seats: 2 };

const positive = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.min(99, Math.round(number)) : fallback;
};

export function normalizeSeating(value: Partial<Seating> | undefined): Seating {
  const rows = positive(value?.rows, DEFAULT_SEATING.rows);
  const tables = positive(value?.tables, DEFAULT_SEATING.tables);
  // One number per row; when every row has the same, `tables` says it alone.
  const rowTables = Array.isArray(value?.rowTables) ? Array.from({ length: rows }, (_, row) => positive(value.rowTables![row], tables)) : undefined;
  const same = !rowTables || rowTables.every(count => count === rowTables[0]);
  return {
    order: SEATING_ORDERS.includes(value?.order as SeatingOrder) ? value!.order! : DEFAULT_SEATING.order,
    rows,
    tables: same && rowTables ? rowTables[0] : tables,
    seats: positive(value?.seats, DEFAULT_SEATING.seats),
    ...(same ? {} : { rowTables }),
  };
}

/** Tables in a row (0 is the front one); rows past the last repeat it. */
export const tablesInRow = (seating: Seating, row: number) => seating.rowTables?.[Math.min(row, seating.rows - 1)] ?? seating.tables;

export const seatingStations = (seating: Seating) => Array.from({ length: seating.rows }, (_, row) => tablesInRow(seating, row) * seating.seats).reduce((sum, count) => sum + count, 0);

/**
 * Station of each place in the group (index 0 is the best): `stations` long. Each row holds its
 * tables×seats stations and is filled from its own middle; with fewer stations (a stage of its
 * own) the last row is shorter and is filled from its own middle too.
 */
export function stationOrder(stations: number, seating: Seating | undefined): number[] {
  if (!seating || seating.order === "ranked") return Array.from({ length: stations }, (_, index) => index + 1);
  const order: number[] = [];
  for (let start = 0, row = 0; start < stations; row += 1) {
    const size = Math.min(Math.max(1, tablesInRow(seating, row) * seating.seats), stations - start);
    const middle = (size + 1) / 2;
    // Closest to the middle first; of two as close, the one on the left.
    const places = Array.from({ length: size }, (_, index) => index + 1).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
    order.push(...places.map(place => start + place));
    start += size;
  }
  return order;
}
