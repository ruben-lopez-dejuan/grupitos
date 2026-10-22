"use client";

export type WcifPerson = {
  registrantId?: number | null;
  name: string;
  wcaId?: string | null;
  roles?: string[];
  registration?: {
    status?: string;
    isCompeting?: boolean;
    eventIds?: string[];
  };
};

export type WcifRound = { id: string; format?: string };
export type WcifEvent = { id: string; rounds?: WcifRound[] };
export type WcifRoom = { id?: number; name?: string; activities?: unknown[] };
export type WcifVenue = { id?: number; name?: string; rooms?: WcifRoom[] };

export type StoredCompetition = {
  id: string;
  name: string;
  shortName?: string;
  persons?: WcifPerson[];
  events?: WcifEvent[];
  schedule?: { venues?: WcifVenue[] };
  importedAt?: string;
};

const DB_NAME = "wca-easy-groups";
const STORE_NAME = "competitions";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCompetition(wcif: StoredCompetition) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...wcif, importedAt: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function getCompetition(id: string): Promise<StoredCompetition | undefined> {
  const db = await openDatabase();
  const competition = await new Promise<StoredCompetition | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as StoredCompetition | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return competition;
}

export async function getImportedCompetitionIds(): Promise<string[]> {
  const db = await openDatabase();
  const ids = await new Promise<string[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAllKeys();
    request.onsuccess = () => resolve(request.result.map(String));
    request.onerror = () => reject(request.error);
  });
  db.close();
  return ids;
}
