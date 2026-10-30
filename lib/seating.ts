/*
 * How competitors sit at fixed stations. Stations are numbered left to right, front row first
 * (row 1 holds stations 1…tables×seats). "ranked" gives the best of the group station 1, the
 * second station 2…; "center" fills the front row from the middle outwards, left of the centre
 * first, then the next row the same way: with 4 tables of 2, the top 8 sit | 7 5 | 3 1 | 2 4 | 6 8 |.
 */
export type SeatingOrder = "ranked" | "center";
export const SEATING_ORDERS: SeatingOrder[] = ["ranked", "center"];

export type Seating = { order: SeatingOrder; rows: number; tables: number; seats: number };

export const DEFAULT_SEATING: Seating = { order: "ranked", rows: 2, tables: 4, seats: 2 };

const positive = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.min(99, Math.round(number)) : fallback;
};

export function normalizeSeating(value: Partial<Seating> | undefined): Seating {
  return {
    order: SEATING_ORDERS.includes(value?.order as SeatingOrder) ? value!.order! : DEFAULT_SEATING.order,
    rows: positive(value?.rows, DEFAULT_SEATING.rows),
    tables: positive(value?.tables, DEFAULT_SEATING.tables),
    seats: positive(value?.seats, DEFAULT_SEATING.seats),
  };
}

export const seatingStations = (seating: Seating) => seating.rows * seating.tables * seating.seats;

/**
 * Station of each place in the group (index 0 is the best): `stations` long. Rows hold
 * tables×seats stations; with fewer stations (a stage of its own) the last row is shorter and is
 * filled from its own middle.
 */
export function stationOrder(stations: number, seating: Seating | undefined): number[] {
  if (!seating || seating.order === "ranked") return Array.from({ length: stations }, (_, index) => index + 1);
  const perRow = Math.max(1, seating.tables * seating.seats);
  const order: number[] = [];
  for (let start = 0; start < stations; start += perRow) {
    const size = Math.min(perRow, stations - start);
    const middle = (size + 1) / 2;
    // Closest to the middle first; of two as close, the one on the left.
    const places = Array.from({ length: size }, (_, index) => index + 1).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
    order.push(...places.map(place => start + place));
  }
  return order;
}
