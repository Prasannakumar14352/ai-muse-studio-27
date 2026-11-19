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
  // Mirror to the user's account in the background so it survives a new
  // device or a cleared browser.
  void import("@/lib/cloud-sync").then((m) => m.uploadBlob(raw, blob)).catch(() => {});
  return makeBlobKey(raw);
}

export async function listBlobKeys(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
  return keys.map(String);
}

export async function putDataURL(key: string, dataURL: string): Promise<string> {
  let blob: Blob;
  if (dataURL.startsWith("data:")) {
    const match = dataURL.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid image data returned");
    const mime = match[1] || "application/octet-stream";
    const isBase64 = Boolean(match[2]);
    const payload = match[3] ?? "";
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: mime });
    } else {
      blob = new Blob([decodeURIComponent(payload)], { type: mime });
    }
  } else {
    const res = await fetch(dataURL);
    if (!res.ok) throw new Error(`Image asset fetch failed (${res.status})`);
    blob = await res.blob();
  }
  return putBlob(key, blob);
}

export async function getBlob(key: string, opts?: { localOnly?: boolean }): Promise<Blob | null> {
  const raw = rawKey(key);
  const v = await tx<Blob | undefined>("readonly", (s) => s.get(raw));
  if (v || opts?.localOnly) return v ?? null;
  // Not on this device — fetch the account copy and keep it locally.
  try {
    const { downloadBlob } = await import("@/lib/cloud-sync");
    const remote = await downloadBlob(raw);
    if (remote) {
      await tx("readwrite", (s) => s.put(remote, raw));
      return remote;
    }
  } catch { /* offline or not signed in */ }
  return null;
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
    // openCursor() (not openKeyCursor) — .delete() requires a value cursor
    const req = s.openCursor();
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
