"use client";

/**
 * Browser-side IndexedDB cache for WebContainer node_modules.
 *
 * After the first npm install, the node_modules binary is compressed and
 * stored keyed by a dependency fingerprint (package.json + lockfile). On
 * subsequent boots the binary is restored directly into the container, skipping npm install
 * entirely (cuts boot from ~3 min to ~10 s).
 *
 * The cache is per-browser with no server storage cost. It auto-invalidates
 * whenever package.json/lockfile changes (different hash = cache miss).
 */

import { compressWithLz4, decompressWithLz4 } from "./compression";
import type { WebContainer } from "@webcontainer/api";

const DB_NAME = "vly-webcontainer-cache";
const DB_VERSION = 1;
const STORE_NAME = "node-modules";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

/** SHA-256 helper used for dependency fingerprint cache keys. */
async function hashString(content: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 20); // 20-char hex prefix is plenty for cache keying
}

/**
 * Read dependency manifests from the mounted container and return a stable
 * cache key hash. Includes package-lock.json when present.
 */
export async function getPackageJsonHash(
  container: WebContainer,
): Promise<string | null> {
  try {
    const packageJson = await container.fs.readFile("package.json", "utf-8");
    let lockFile = "";
    try {
      lockFile = await container.fs.readFile("package-lock.json", "utf-8");
    } catch {
      // Older snapshots/templates may not have a lock file yet.
    }
    const fingerprint = lockFile
      ? `pkg:\n${packageJson}\n\nlock:\n${lockFile}`
      : `pkg:\n${packageJson}`;
    return hashString(fingerprint);
  } catch {
    return null;
  }
}

/** Return the cached node_modules binary for this package.json hash, or null. */
async function getCache(hash: string): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(hash);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Persist the node_modules binary under this package.json hash. */
async function setCache(hash: string, data: Uint8Array): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(data, hash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Try to restore node_modules from IndexedDB cache.
 * Returns true if the cache hit was successful and node_modules was mounted.
 */
export async function restoreNodeModulesFromCache(
  container: WebContainer,
  packageJsonHash: string,
): Promise<boolean> {
  const compressed = await getCache(packageJsonHash);
  if (!compressed) return false;

  try {
    const binary = decompressWithLz4(compressed);
    // Mount under node_modules explicitly. Without mountPoint, a binary export
    // of "node_modules" can leak package folders at project root.
    await container.mount(
      binary as unknown as Parameters<typeof container.mount>[0],
      { mountPoint: "node_modules" },
    );
    console.log("[WebContainer] node_modules restored from browser cache");
    return true;
  } catch (err) {
    console.warn("[WebContainer] cache restore failed, will reinstall:", err);
    return false;
  }
}

/**
 * Export node_modules from the container, compress, and store in IndexedDB.
 * Runs fire-and-forget — errors are swallowed so they never block boot.
 */
export function cacheNodeModulesInBackground(
  container: WebContainer,
  packageJsonHash: string,
): void {
  void (async () => {
    try {
      console.log("[WebContainer] caching node_modules to IndexedDB…");
      const binary = await container.export("node_modules", { format: "binary" });
      const compressed = compressWithLz4(binary as Uint8Array);
      await setCache(packageJsonHash, compressed);
      console.log(
        `[WebContainer] node_modules cached (${(compressed.byteLength / 1024 / 1024).toFixed(1)} MB compressed)`,
      );
    } catch (err) {
      console.warn("[WebContainer] node_modules cache write failed:", err);
    }
  })();
}
