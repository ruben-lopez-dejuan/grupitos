"use client";

export type WcifPerson = {
  /** App-only: identifies PRO volunteers, who have no registrant id. Never in a WCIF. */
  appKey?: string;
  registrantId?: number | null;
  wcaUserId?: number;
  name: string;
  wcaId?: string | null;
  countryIso2?: string;
  /** Only in the private WCIF (requested with a manager's token). */
  email?: string;
  birthdate?: string;
  /** Public WCA profile photo. */
  avatar?: { url?: string; thumbUrl?: string } | null;
  roles?: string[];
  personalBests?: Array<{
    eventId: string;
    type: "single" | "average";
    /** WCIF 1.x field name. */
    best?: number;
    /** WCIF 2.x field name. */
    value?: number;
    worldRanking?: number;
    continentalRanking?: number;
    nationalRanking?: number;
  }>;
  extensions?: WcifExtension[];
  registration?: {
    status?: string;
    isCompeting?: boolean;
    eventIds?: string[];
  };
  /** Group and staff assignments already in the WCIF. */
  assignments?: Array<{ activityId: number; assignmentCode: string; stationNumber?: number | null }>;
};

export type WcifAdvancementCondition = { type: "ranking" | "percent" | "attemptResult"; level: number };
/** WCIF 1.x uses `advancementCondition`; WCIF 2 uses `participationRuleset`. Both are read. */
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
  results?: Array<{ personId: number; ranking?: number | null; best?: number; average?: number }>;
};
export type WcifEvent = { id: string; rounds?: WcifRound[] };
export type WcifExtension = { id: string; specUrl?: string; data?: unknown };
export type WcifActivity = { id: number; name: string; activityCode: string; startTime: string; endTime: string; childActivities?: WcifActivity[]; extensions?: WcifExtension[] };
export type WcifRoom = { id?: number; name?: string; color?: string; activities?: WcifActivity[]; extensions?: WcifExtension[] };
export type WcifVenue = { id?: number; name?: string; countryIso2?: string; timezone?: string; rooms?: WcifRoom[] };

export type StoredCompetition = {
  /** "2.2" for WCIF requested with /wcif/version/2; a PATCH must send it back with `id`. */
  formatVersion?: string;
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
