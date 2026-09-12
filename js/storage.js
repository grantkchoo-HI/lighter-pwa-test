const DB_NAME = "lighter-db";
const DB_VERSION = 1;
const STORE = "app";
const KEY = "current";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("This browser does not support local database storage."));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Lighter could not open its local database."));
  });
}

export async function loadData() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error("Lighter could not read your saved data."));
    tx.oncomplete = () => db.close();
  });
}

export async function saveData(data) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(structuredClone(data), KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(new Error("Your latest change could not be saved on this device.")); };
  });
}

export async function clearData() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(new Error("Saved data could not be reset.")); };
  });
}

