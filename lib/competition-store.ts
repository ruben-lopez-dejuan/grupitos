"use client";

export type WcifPerson = {
  registrantId?: number | null;
  wcaUserId?: number;
  name: string;
  wcaId?: string | null;
  countryIso2?: string;
  birthdate?: string;
  /** Public WCA profile photo. */
  avatar?: { url?: string; thumbUrl?: string } | null;
  roles?: string[];
  personalBests?: Array<{
    eventId: string;
    type: "single" | "average";
    best: number;
    worldRanking?: number;
    continentalRanking?: number;
    nationalRanking?: number;
  }>;
  registration?: {
    status?: string;
    isCompeting?: boolean;
    eventIds?: string[];
  };
};

export type WcifAdvancementCondition = { type: "ranking" | "percent" | "attemptResult"; level: number };
/** WCIF 1.2 uses `advancementCondition`; newer exports use `participationRuleset`. */
export type WcifParticipationSource =
  | { type: "registrations" }
  | { type: "round"; roundId: string; resultCondition: { type: "ranking" | "percent" | "resultAchieved"; value: number | null; scope?: "single" | "average" } }
  | { type: "linkedRounds"; roundIds: string[]; resultCondition: { type: "ranking" | "percent" | "resultAchieved"; value: number | null; scope?: "single" | "average" } };
export type WcifRound = {
  id: string;
  format?: string;
  timeLimit?: { centiseconds: number; cumulativeRoundIds: string[] } | null;
  cutoff?: { numberOfAttempts: number; attemptResult?: number; resultValue?: number } | null;
  advancementCondition?: WcifAdvancementCondition | null;
  participationRuleset?: { participationSource: WcifParticipationSource } | null;
  results?: Array<{ personId: number; ranking?: number | null }>;
};
export type WcifEvent = { id: string; rounds?: WcifRound[] };
export type WcifActivity = { id: number; name: string; activityCode: string; startTime: string; endTime: string; childActivities?: WcifActivity[] };
export type WcifRoom = { id?: number; name?: string; color?: string; activities?: WcifActivity[] };
export type WcifVenue = { id?: number; name?: string; countryIso2?: string; timezone?: string; rooms?: WcifRoom[] };

export type StoredCompetition = {
  id: string;
  name: string;
  shortName?: string;
  persons?: WcifPerson[];
  events?: WcifEvent[];
  schedule?: { startDate?: string; numberOfDays?: number; venues?: WcifVenue[] };
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
