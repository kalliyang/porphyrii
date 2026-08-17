/**
 * app/db.js — IndexedDB history store (PRD R-F9).
 *
 * The ONLY persistent store for business data. localStorage is reserved
 * for the ds-theme UI preference (SPEC §7.3) and used nowhere else.
 *
 * Records: {
 *   id: number (autoincrement),
 *   createdAt: string (ISO 8601),
 *   input: string (the submitted text),
 *   meter: string, meterConfidence: string,
 *   snippet: string (first input line, for the history list),
 *   result: object (full PRD §7.2 analysis JSON — re-rendering a past
 *     result must not need the network, R-NF6)
 * }
 */

const DB_NAME = "porphyrii";
const DB_VERSION = 1;
const STORE = "history";
const DEFAULT_LIMIT = 50;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = run(store);
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/**
 * Save an analysis to the local history.
 * @param {object} record everything except `id`
 * @returns {Promise<number>} the new record id
 */
export async function saveScansion(record) {
  const db = await openDb();
  try {
    return await tx(db, "readwrite", (store) => store.add(record));
  } finally {
    db.close();
  }
}

/**
 * Read history, newest first.
 * @param {number} [limit]
 * @returns {Promise<Array<object>>}
 */
export async function getHistory(limit = DEFAULT_LIMIT) {
  const db = await openDb();
  try {
    const records = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
    return records
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  } finally {
    db.close();
  }
}

/**
 * Delete one history record.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteRecord(id) {
  const db = await openDb();
  try {
    await tx(db, "readwrite", (store) => store.delete(id));
  } finally {
    db.close();
  }
}
