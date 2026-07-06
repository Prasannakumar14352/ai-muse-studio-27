// IndexedDB-backed blob store for large generated assets (carousel slides,
// video renders). localStorage tops out around 5 MB per origin which is not
// enough for even one 1024×1024 PNG carousel; IDB gives us tens of MB and
// keeps the JSON output metadata small enough to stay in localStorage.

const DB_NAME = "cv-blobs";
const STORE = "images";
const KEY_PREFIX = "idb:";

let dbp: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const r = run(s);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function isBlobKey(s: string | null | undefined): s is string {
  return typeof s === "string" && s.startsWith(KEY_PREFIX);
}
export function makeBlobKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}
function rawKey(k: string): string {
  return k.startsWith(KEY_PREFIX) ? k.slice(KEY_PREFIX.length) : k;
}

export async function putBlob(key: string, blob: Blob): Promise<string> {
  const raw = rawKey(key);
  await tx("readwrite", (s) => s.put(blob, raw));
  return makeBlobKey(raw);
}

export async function putDataURL(key: string, dataURL: string): Promise<string> {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  return putBlob(key, blob);
}

export async function getBlob(key: string): Promise<Blob | null> {
  const raw = rawKey(key);
  const v = await tx<Blob | undefined>("readonly", (s) => s.get(raw));
  return v ?? null;
}

const urlCache = new Map<string, string>();
export async function getObjectURL(key: string): Promise<string | null> {
  const raw = rawKey(key);
  const cached = urlCache.get(raw);
  if (cached) return cached;
  const b = await getBlob(raw);
  if (!b) return null;
  const url = URL.createObjectURL(b);
  urlCache.set(raw, url);
  return url;
}

export async function getDataURL(key: string): Promise<string | null> {
  const b = await getBlob(key);
  if (!b) return null;
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(b);
  });
}

export async function deleteBlob(key: string): Promise<void> {
  const raw = rawKey(key);
  const cached = urlCache.get(raw);
  if (cached) { URL.revokeObjectURL(cached); urlCache.delete(raw); }
  await tx("readwrite", (s) => s.delete(raw));
}

export async function deleteBlobsByPrefix(prefix: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const s = t.objectStore(STORE);
    const req = s.openKeyCursor();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { resolve(); return; }
      const k = String(c.key);
      if (k.startsWith(prefix)) {
        const cached = urlCache.get(k);
        if (cached) { URL.revokeObjectURL(cached); urlCache.delete(k); }
        c.delete();
      }
      c.continue();
    };
    t.oncomplete = () => resolve();
  });
}

export async function clearBlobs(): Promise<void> {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  await tx("readwrite", (s) => s.clear());
}
