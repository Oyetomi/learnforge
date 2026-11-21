import { validWorkspace, type ProjectWorkspace } from "./project";

/**
 * Project workspaces in IndexedDB (`learnforge-projects`), one per track.
 * When IndexedDB is unavailable, workspaces stay in memory for this session
 * and `projectStorageAvailable` reports false.
 */
const DATABASE = "learnforge-projects";
const STORE = "workspaces";
const memory = new Map<string, ProjectWorkspace>();
let unavailable = false;

export const projectStorageAvailable = () => !unavailable;

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "trackId" });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other LearnForge windows and retry."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openStore();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadProject(trackId: string): Promise<ProjectWorkspace | null> {
  try {
    const value = await run("readonly", (s) => s.get(trackId));
    unavailable = false;
    return validWorkspace(value) ? value : memory.get(trackId) ?? null;
  } catch {
    unavailable = true;
    return memory.get(trackId) ?? null;
  }
}

export async function saveProject(ws: ProjectWorkspace): Promise<boolean> {
  memory.set(ws.trackId, ws);
  try {
    await run("readwrite", (s) => s.put(ws));
    unavailable = false;
    return true;
  } catch {
    unavailable = true;
    return false;
  }
}

export async function deleteProject(trackId: string): Promise<void> {
  memory.delete(trackId);
  try {
    await run("readwrite", (s) => s.delete(trackId));
  } catch {
    /* Nothing stored. */
  }
}

/**
 * Remove the base workspace, all explicitly supplied project keys, and any
 * persisted `${trackId}--*` workspaces so multi-project tracks never leak.
 */
export async function deleteTrackProjects(
  trackId: string,
  workspaceKeys: string[] = []
): Promise<void> {
  if (!trackId) return;
  const prefix = `${trackId}--`;
  const targets = new Set<string>([trackId, ...workspaceKeys.filter(Boolean)]);
  for (const key of [...memory.keys()]) {
    if (key === trackId || key.startsWith(prefix)) {
      targets.add(key);
    }
  }
  for (const key of targets) {
    memory.delete(key);
  }
  try {
    const db = await openStore();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
          for (const rawKey of keysReq.result || []) {
            if (typeof rawKey === "string" && (rawKey === trackId || rawKey.startsWith(prefix))) {
              targets.add(rawKey);
              memory.delete(rawKey);
            }
          }
          for (const key of targets) {
            store.delete(key);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error || keysReq.error);
      });
    } finally {
      db.close();
    }
  } catch {
    /* Nothing stored or IndexedDB unavailable. */
  }
}
