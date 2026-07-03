"use client";

import type { WebContainer, WebContainerProcess } from "@webcontainer/api";

import {
  ContainerBootState,
  getContainerBootStatus,
  setContainerBootState,
} from "./bootState";
import { getWebContainer } from "./client";
import { writeConvexEnvToContainer, type WebContainerConvexEnv } from "./env";
import {
  getWebContainerPreviewUrl,
  setWebContainerPreviewUrl,
} from "./previewUrl";
import {
  exportFilesystemSnapshot,
  importFilesystemSnapshot,
  uploadFilesystemSnapshot,
} from "./snapshot";
import { loadTemplateFileSystemTree } from "./template";
import {
  getPackageJsonHash,
  restoreNodeModulesFromCache,
  cacheNodeModulesInBackground,
} from "./nodeModulesCache";

const VITE_PORT = 5173;
const SNAPSHOT_BACKUP_INTERVAL_MS = 60_000;

export interface SetupWebContainerProjectOptions {
  projectId: string;
  semanticIdentifier: string;
  snapshotUrl?: string | null;
  provisionConvex: () => Promise<WebContainerConvexEnv>;
  onPreviewUrl?: (url: string) => void;
}

let backupIntervalId: ReturnType<typeof setInterval> | undefined;
let backupDebounceId: ReturnType<typeof setTimeout> | undefined;
let backupBeforeUnloadHandler: (() => void) | undefined;
let backupVisibilityChangeHandler: (() => void) | undefined;
let backupPageHideHandler: (() => void) | undefined;
let activeBackupContext:
  | {
      projectId: string;
      container: WebContainer;
      inFlight: Promise<void> | null;
    }
  | undefined;
let devProcesses: WebContainerProcess[] = [];
let activeProjectSemanticIdentifier: string | null = null;
let activeSetupPromise: Promise<WebContainer> | null = null;

function streamProcessOutput(process: WebContainerProcess, label: string) {
  process.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(`[WebContainer:${label}]`, data);
      },
    }),
  );
}

async function mountProjectFiles(
  container: WebContainer,
  snapshotUrl?: string | null,
): Promise<void> {
  if (snapshotUrl) {
    try {
      const response = await fetch(snapshotUrl);
      if (!response.ok) {
        throw new Error(`Failed to download snapshot (${response.status})`);
      }
      const compressed = new Uint8Array(await response.arrayBuffer());
      await importFilesystemSnapshot(container, compressed);
      return;
    } catch (snapshotErr) {
      // Corrupted/expired snapshot — log and fall through to template mount
      console.warn(
        "[WebContainer] snapshot restore failed, loading fresh template instead:",
        snapshotErr,
      );
    }
  }

  const tree = await loadTemplateFileSystemTree();
  await container.mount(tree);
}

/**
 * Apply narrow runtime hotfixes for legacy snapshots created before recent
 * WebContainer stability fixes. This keeps older projects bootable without
 * forcing users to recreate the project from scratch.
 */
async function applyLegacyRuntimeHotfixes(container: WebContainer): Promise<void> {
  const mainPath = "src/main.tsx";
  let mainSource: string;
  try {
    mainSource = await container.fs.readFile(mainPath, "utf-8");
  } catch {
    return;
  }

  // Legacy template wrapped the entire app in InstrumentationProvider. In some
  // cached dependency states this crashes very early with:
  // "Cannot read properties of null (reading 'useState')", leaving a blank page.
  if (!mainSource.includes("InstrumentationProvider")) {
    return;
  }

  let patched = mainSource.replace(
    /\nimport\s+\{\s*InstrumentationProvider\s*\}\s+from\s+["']@\/instrumentation(?:\.[a-z]+)?["'];?\n/,
    "\n",
  );
  // Also handle namespaced path variants like @/instrumentation/index
  patched = patched.replace(
    /\nimport\s+\{\s*InstrumentationProvider\s*\}\s+from\s+["']@\/instrumentation\/index(?:\.[a-z]+)?["'];?\n/,
    "\n",
  );
  patched = patched.replace(/<InstrumentationProvider\b[^>]*>/g, "<>");
  patched = patched.replace(/<\/InstrumentationProvider>/g, "</>");

  if (patched === mainSource) return;

  await container.fs.writeFile(mainPath, patched);
  console.log("[WebContainer] applied legacy hotfix: removed InstrumentationProvider wrapper");
}

/**
 * Hotfix invalid auth.config.ts produced by older prompts/tooling that wrote
 * provider entries like `type: "email"` (rejected by Convex deploy API).
 * We patch only this known-bad shape to keep user-authored valid configs intact.
 */
async function fixInvalidConvexAuthConfig(container: WebContainer): Promise<void> {
  const authConfigPath = "src/convex/auth.config.ts";
  let authConfigSource: string;
  try {
    authConfigSource = await container.fs.readFile(authConfigPath, "utf-8");
  } catch {
    return;
  }

  if (!/type\s*:\s*["']email["']/.test(authConfigSource)) {
    return;
  }

  const fixedAuthConfig = `import type { AuthConfig } from "convex/server";

const issuer =
  process.env.VLY_CONVEX_AUTH_ISSUER ??
  process.env.CONVEX_SITE_URL ??
  "http://localhost:5173";

export default {
  providers: [
    {
      type: "customJwt",
      issuer,
      jwks: \`\${issuer}/api/web/.well-known/jwks.json\`,
      applicationID: "convex",
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
`;

  await container.fs.writeFile(authConfigPath, fixedAuthConfig);
  console.log("[WebContainer] applied auth hotfix: repaired invalid src/convex/auth.config.ts");
}

/**
 * Hotfix for older sessions where cached node_modules was mounted at project
 * root, leaking many package folders (e.g. /tslib, /recharts). This confuses
 * Vite dep-scan and can cascade into hook/runtime failures.
 */
async function cleanupLeakedNodeModulesAtProjectRoot(
  container: WebContainer,
): Promise<void> {
  const sentinelPaths = [
    "tslib/tslib.es6.html",
    "decimal.js-light/doc/API.html",
    "recharts/umd/report.html",
  ];

  let looksPolluted = false;
  for (const sentinel of sentinelPaths) {
    try {
      await container.fs.readFile(sentinel);
      looksPolluted = true;
      break;
    } catch {
      // continue
    }
  }

  if (!looksPolluted) return;

  let lockRaw = "";
  try {
    lockRaw = await container.fs.readFile("package-lock.json", "utf-8");
  } catch {
    console.warn("[WebContainer] root pollution detected but package-lock.json missing");
    return;
  }

  let packageLock: any;
  try {
    packageLock = JSON.parse(lockRaw);
  } catch {
    console.warn("[WebContainer] root pollution detected but package-lock.json invalid");
    return;
  }

  const packageNames = new Set<string>();
  const packages = packageLock?.packages ?? {};
  for (const key of Object.keys(packages)) {
    if (!key.startsWith("node_modules/")) continue;
    const relative = key.slice("node_modules/".length);
    if (!relative || relative.includes("/node_modules/")) continue;

    if (relative.startsWith("@")) {
      const parts = relative.split("/");
      if (parts.length === 2) {
        packageNames.add(`${parts[0]}/${parts[1]}`);
      }
      continue;
    }

    if (!relative.includes("/")) {
      packageNames.add(relative);
    }
  }

  let removed = 0;
  for (const packageName of packageNames) {
    try {
      await container.fs.rm(packageName, { recursive: true });
      removed += 1;
    } catch {
      // Path absent or not removable; ignore.
    }
  }

  if (removed > 0) {
    console.log(
      `[WebContainer] removed ${removed} leaked package folder(s) from project root`,
    );
  }
}

/**
 * Read the `bin` entry from a package's package.json and return the resolved
 * path relative to the container root. Returns null on any error.
 */
async function resolvePackageBin(
  container: WebContainer,
  packageName: string,
  binName: string,
): Promise<string | null> {
  try {
    const raw = await container.fs.readFile(
      `node_modules/${packageName}/package.json`,
      "utf-8",
    );
    const pkg = JSON.parse(raw);
    const binEntry: string | undefined =
      typeof pkg.bin === "string"
        ? pkg.bin
        : pkg.bin?.[binName];
    if (!binEntry) return null;
    const candidate = `node_modules/${packageName}/${binEntry.replace(/^\.\//, "")}`;
    // Verify the file actually exists in the container
    await container.fs.readFile(candidate);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Find vite's JS entry point. Tries package.json first, then known fallback
 * paths across major vite versions.
 */
async function findViteBin(container: WebContainer): Promise<string | null> {
  const fromPkg = await resolvePackageBin(container, "vite", "vite");
  if (fromPkg) return fromPkg;

  for (const path of [
    "node_modules/vite/bin/vite.js",
    "node_modules/vite/dist/node/cli.js",
  ]) {
    try {
      await container.fs.readFile(path);
      return path;
    } catch {}
  }
  return null;
}

/**
 * Find convex CLI's JS entry point. Tries package.json first, then known
 * fallback paths across convex versions (1.x structure varies).
 */
async function findConvexBin(container: WebContainer): Promise<string | null> {
  const fromPkg = await resolvePackageBin(container, "convex", "convex");
  if (fromPkg) return fromPkg;

  for (const path of [
    "node_modules/convex/dist/bundler/main.js",
    "node_modules/convex/dist/cjs/cli/main.js",
    "node_modules/convex/bin/main.cjs",
    "node_modules/convex/bin/convex.js",
  ]) {
    try {
      await container.fs.readFile(path);
      return path;
    } catch {}
  }
  return null;
}

async function npmInstall(container: WebContainer): Promise<void> {
  let useCi = false;
  try {
    await container.fs.readFile("package-lock.json", "utf-8");
    useCi = true;
  } catch {
    useCi = false;
  }

  const args = useCi
    ? ["ci", "--no-fund", "--no-audit", "--prefer-offline"]
    : ["install", "--no-fund", "--no-audit", "--prefer-offline"];
  console.log(
    `[WebContainer] dependency install mode: npm ${useCi ? "ci" : "install"}`,
  );
  const install = await container.spawn("npm", args);
  streamProcessOutput(install, "npm-install");
  const exitCode = await install.exit;
  if (exitCode !== 0) {
    throw new Error(
      `npm ${useCi ? "ci" : "install"} failed with exit code ${exitCode}`,
    );
  }
}

async function runNpmInstall(container: WebContainer): Promise<void> {
  // Skip if node_modules already exists in this container session
  try {
    await container.fs.readdir("node_modules");
    console.log("[WebContainer] node_modules already present, skipping install");
    return;
  } catch {
    // node_modules doesn't exist — check browser cache first
  }

  // Try restoring from IndexedDB cache (keyed by package.json hash)
  const hash = await getPackageJsonHash(container);
  if (hash) {
    const restored = await restoreNodeModulesFromCache(container, hash);
    if (restored) {
      // Validate the cache is usable — verify vite is accessible.
      // If the binary snapshot was partial/corrupt, findViteBin returns null.
      const viteBin = await findViteBin(container);
      if (viteBin) {
        // Clear Vite's pre-bundled dep cache so it re-optimizes on startup with
        // the current vite.config.ts. Stale .vite/deps bundles (from when this
        // node_modules snapshot was originally created) can bundle duplicate
        // React instances, causing "Cannot read properties of null (reading
        // 'useState')" errors at runtime.
        try {
          await container.fs.rm("node_modules/.vite", { recursive: true });
          console.log("[WebContainer] cleared node_modules/.vite (stale pre-bundled deps) after cache restore");
        } catch {
          // .vite may not exist — that's fine
        }
        console.log("[WebContainer] cache restore validated, skipping npm install");
        return;
      }
      console.warn("[WebContainer] cache restored but vite missing — corrupt cache, running npm install");
      // Invalidate this cache entry so future reloads don't hit it again
      if (hash) {
        cacheNodeModulesInBackground(container, hash); // overwrites with fresh install below
      }
    }
  }

  // Full npm install (first ever load, or after corrupt cache)
  await npmInstall(container);

  // Re-cache the freshly installed node_modules
  const freshHash = await getPackageJsonHash(container);
  if (freshHash) {
    cacheNodeModulesInBackground(container, freshHash);
  }
}

async function startBackgroundProcesses(
  container: WebContainer,
  convexEnv: WebContainerConvexEnv,
): Promise<void> {
  for (const proc of devProcesses) {
    proc.kill();
  }
  devProcesses = [];

  // Resolve actual JS entry points from each package's package.json bin field.
  // This bypasses node_modules/.bin/ symlinks, which are not preserved when
  // node_modules is restored from the IndexedDB binary cache.
  const convexBin = await findConvexBin(container);
  const viteBin = await findViteBin(container);

  if (!viteBin) {
    throw new Error("Could not resolve vite entry point — is node_modules installed?");
  }

  // Keep Convex running in watch mode so newly created/edited functions
  // (for example src/convex/services.ts -> services:list) are pushed
  // continuously while the WebContainer session is alive.
  if (convexBin) {
    const convexDev = await container.spawn(
      "node",
      [convexBin, "dev"],
      {
        env: {
          CONVEX_DEPLOY_KEY: convexEnv.deployKey,
          CONVEX_DEPLOYMENT: convexEnv.convexDeployment,
        },
      },
    );
    streamProcessOutput(convexDev, "convex-dev");
    devProcesses.push(convexDev);
    void convexDev.exit.then((code) => {
      if (code !== 0) {
        console.warn(`[WebContainer] convex dev exited with code ${code}`);
      }
    });
  } else {
    console.warn("[WebContainer] convex binary not found, skipping convex dev");
  }

  // Start Vite dev server. host:true is already set in vite.config.ts.
  const viteDev = await container.spawn("node", [viteBin, "--host"]);
  streamProcessOutput(viteDev, "vite-dev");
  devProcesses.push(viteDev);
  void viteDev.exit.then((code) => {
    if (code !== 0) {
      console.error(`[WebContainer] vite dev server exited unexpectedly with code ${code}`);
    }
  });
}

function listenForPreviewUrl(
  container: WebContainer,
  onPreviewUrl?: (url: string) => void,
): void {
  container.on("port", (port, type, url) => {
    if (port !== VITE_PORT || type !== "open") return;
    console.log(`[WebContainer] port open on ${port}: ${url}`);
    setWebContainerPreviewUrl(url);
    onPreviewUrl?.(url);
  });

  container.on("server-ready", (port, url) => {
    console.log(`[WebContainer] server-ready on port ${port}: ${url}`);
    if (port !== VITE_PORT) {
      console.warn(`[WebContainer] ignoring server-ready on unexpected port ${port} (expected ${VITE_PORT})`);
      return;
    }
    setWebContainerPreviewUrl(url);
    onPreviewUrl?.(url);
  });
}

async function runSnapshotBackupNow(): Promise<void> {
  if (!activeBackupContext) return;
  if (activeBackupContext.inFlight) {
    await activeBackupContext.inFlight;
    return;
  }
  activeBackupContext.inFlight = (async () => {
    try {
      const compressed = await exportFilesystemSnapshot(activeBackupContext!.container);
      await uploadFilesystemSnapshot(activeBackupContext!.projectId, compressed);
    } catch (error) {
      console.warn("[WebContainer] snapshot backup failed:", error);
    } finally {
      if (activeBackupContext) {
        activeBackupContext.inFlight = null;
      }
    }
  })();
  await activeBackupContext.inFlight;
}

/**
 * Request a near-term snapshot save (debounced) after meaningful file changes
 * such as editor saves and agent tool write batches.
 */
export function requestWebContainerSnapshotBackup(delayMs = 2000): void {
  if (!activeBackupContext) return;
  if (backupDebounceId) {
    clearTimeout(backupDebounceId);
  }
  backupDebounceId = setTimeout(() => {
    void runSnapshotBackupNow();
  }, Math.max(0, delayMs));
}

function startSnapshotBackup(projectId: string, container: WebContainer) {
  if (backupIntervalId) {
    clearInterval(backupIntervalId);
  }
  if (backupDebounceId) {
    clearTimeout(backupDebounceId);
    backupDebounceId = undefined;
  }
  if (backupBeforeUnloadHandler) {
    window.removeEventListener("beforeunload", backupBeforeUnloadHandler);
    backupBeforeUnloadHandler = undefined;
  }
  if (backupVisibilityChangeHandler) {
    document.removeEventListener("visibilitychange", backupVisibilityChangeHandler);
    backupVisibilityChangeHandler = undefined;
  }
  if (backupPageHideHandler) {
    window.removeEventListener("pagehide", backupPageHideHandler);
    backupPageHideHandler = undefined;
  }

  activeBackupContext = { projectId, container, inFlight: null };

  backupIntervalId = setInterval(() => {
    void runSnapshotBackupNow();
  }, SNAPSHOT_BACKUP_INTERVAL_MS);

  backupBeforeUnloadHandler = () => {
    void runSnapshotBackupNow();
  };
  window.addEventListener("beforeunload", backupBeforeUnloadHandler);

  // `beforeunload` is not guaranteed on mobile/backgrounding. Save once when
  // the tab becomes hidden or page is being put into bfcache.
  backupVisibilityChangeHandler = () => {
    if (document.visibilityState === "hidden") {
      void runSnapshotBackupNow();
    }
  };
  document.addEventListener("visibilitychange", backupVisibilityChangeHandler);

  backupPageHideHandler = () => {
    void runSnapshotBackupNow();
  };
  window.addEventListener("pagehide", backupPageHideHandler);
}

/**
 * Full boot sequence for a WebContainer-backed project: mount files, install
 * deps, provision Convex, start dev servers, and begin periodic snapshot backup.
 */
export async function setupWebContainerProject(
  options: SetupWebContainerProjectOptions,
): Promise<WebContainer> {
  // Reuse an in-flight/resolved setup for the same project within this tab.
  // This prevents remounts (view/tab switches) from re-running mount/install.
  if (
    activeProjectSemanticIdentifier === options.semanticIdentifier &&
    activeSetupPromise
  ) {
    const existingUrl = getWebContainerPreviewUrl();
    if (existingUrl) {
      options.onPreviewUrl?.(existingUrl);
    }
    return activeSetupPromise;
  }

  // If we are already READY for this project, return immediately.
  if (
    activeProjectSemanticIdentifier === options.semanticIdentifier &&
    getContainerBootStatus().state === ContainerBootState.READY
  ) {
    const container = await getWebContainer();
    const existingUrl = getWebContainerPreviewUrl();
    if (existingUrl) {
      options.onPreviewUrl?.(existingUrl);
    }
    return container;
  }

  const setupPromise = (async (): Promise<WebContainer> => {
  const fail = (step: string, cause: unknown): never => {
    const message = cause instanceof Error ? cause.message : String(cause);
    const error = new Error(`[${step}] ${message}`);
    setContainerBootState(ContainerBootState.ERROR, error);
    throw error;
  };

  setContainerBootState(ContainerBootState.LOADING_SNAPSHOT);
  const container = await getWebContainer();
  listenForPreviewUrl(container, options.onPreviewUrl);

  try {
    await mountProjectFiles(container, options.snapshotUrl);
    await applyLegacyRuntimeHotfixes(container);
    await fixInvalidConvexAuthConfig(container);
    await cleanupLeakedNodeModulesAtProjectRoot(container);
  } catch (e) {
    fail("mount files", e);
  }

  // Start Convex provisioning in parallel with dependency install.
  // This overlaps remote API latency with npm work and reduces end-to-end boot time.
  const convexProvisionPromise = options
    .provisionConvex()
    .then((env) => ({ ok: true as const, env }))
    .catch((error) => ({ ok: false as const, error }));

  setContainerBootState(ContainerBootState.DOWNLOADING_DEPENDENCIES);
  try {
    await runNpmInstall(container);
  } catch (e) {
    fail("npm install", e);
  }

  setContainerBootState(ContainerBootState.SETTING_UP_CONVEX_PROJECT);
  let convexEnv: WebContainerConvexEnv;
  {
    const provisionResult = await convexProvisionPromise;
    if (!provisionResult.ok) {
      fail("provision Convex", provisionResult.error);
    } else {
      convexEnv = provisionResult.env;
    }
  }

  setContainerBootState(ContainerBootState.SETTING_UP_CONVEX_ENV_VARS);
  try {
    await writeConvexEnvToContainer(container, convexEnv!);
  } catch (e) {
    fail("write Convex env", e);
  }

  setContainerBootState(ContainerBootState.CONFIGURING_CONVEX_AUTH);
  try {
    await startBackgroundProcesses(container, convexEnv!);
  } catch (e) {
    fail("start dev processes", e);
  }

  setContainerBootState(ContainerBootState.STARTING_BACKUP);
  startSnapshotBackup(options.projectId, container);

  setContainerBootState(ContainerBootState.READY);
  return container;
  })();

  activeProjectSemanticIdentifier = options.semanticIdentifier;
  activeSetupPromise = setupPromise;

  void setupPromise.catch(() => {
    // Allow retries after a failed setup attempt.
    if (activeSetupPromise === setupPromise) {
      activeSetupPromise = null;
      if (activeProjectSemanticIdentifier === options.semanticIdentifier) {
        activeProjectSemanticIdentifier = null;
      }
    }
  });

  return setupPromise;
}

export function stopWebContainerProjectBackup(): void {
  if (backupIntervalId) {
    clearInterval(backupIntervalId);
    backupIntervalId = undefined;
  }
  if (backupDebounceId) {
    clearTimeout(backupDebounceId);
    backupDebounceId = undefined;
  }
  if (backupBeforeUnloadHandler) {
    window.removeEventListener("beforeunload", backupBeforeUnloadHandler);
    backupBeforeUnloadHandler = undefined;
  }
  if (backupVisibilityChangeHandler) {
    document.removeEventListener("visibilitychange", backupVisibilityChangeHandler);
    backupVisibilityChangeHandler = undefined;
  }
  if (backupPageHideHandler) {
    window.removeEventListener("pagehide", backupPageHideHandler);
    backupPageHideHandler = undefined;
  }
  activeBackupContext = undefined;
}
