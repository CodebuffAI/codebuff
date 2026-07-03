"use client";

import type { WebContainer } from "@webcontainer/api";

export interface WebContainerConvexEnv {
  convexUrl: string;
  convexSiteUrl: string;
  convexDeployment: string;
  deployKey: string;
  appId: string;
  monitoringUrl: string;
}

/**
 * Keys the platform writes itself. User-defined vars can never override the
 * deploy key; the rest are technically overridable but user lines are written
 * AFTER the managed block, and dotenv keeps the first occurrence — so managed
 * values win. CONVEX_DEPLOY_KEY is additionally rejected server-side.
 */
const MANAGED_KEYS = new Set([
  "VITE_CONVEX_URL",
  "CONVEX_SITE_URL",
  "CONVEX_DEPLOYMENT",
  "CONVEX_DEPLOY_KEY",
  "VITE_VLY_APP_ID",
  "VITE_VLY_MONITORING_URL",
]);

// Remembered so user env vars can be re-applied reactively (when they change
// in the webcontainer_env_vars table) without re-provisioning Convex.
let currentConvexEnv: WebContainerConvexEnv | null = null;
let currentUserVars: Record<string, string> = {};

/**
 * The Convex env of the current boot session (null before provisioning).
 * Used by the tool executor to inject CONVEX_DEPLOY_KEY/CONVEX_DEPLOYMENT
 * into agent-run terminal commands so `npx convex dev --once` (codegen +
 * typecheck + push) authenticates non-interactively.
 */
export function getCurrentConvexEnv(): WebContainerConvexEnv | null {
  return currentConvexEnv;
}

function buildEnvFileContents(
  env: WebContainerConvexEnv,
  userVars: Record<string, string>,
): string {
  const lines = [
    `VITE_CONVEX_URL=${env.convexUrl}`,
    `CONVEX_SITE_URL=${env.convexSiteUrl}`,
    `CONVEX_DEPLOYMENT=${env.convexDeployment}`,
    `CONVEX_DEPLOY_KEY=${env.deployKey}`,
    `VITE_VLY_APP_ID=${env.appId}`,
    `VITE_VLY_MONITORING_URL=${env.monitoringUrl}`,
  ];
  for (const [key, value] of Object.entries(userVars)) {
    if (MANAGED_KEYS.has(key.toUpperCase())) continue;
    // Values may be multiline / contain quotes — dotenv-style double quoting
    // with escaped inner quotes and newlines keeps them intact.
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    lines.push(`${key}="${escaped}"`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Writes Convex + Vly managed env vars plus the user's stored frontend env
 * vars into `.env.local` inside the container.
 */
export async function writeConvexEnvToContainer(
  container: WebContainer,
  env: WebContainerConvexEnv,
  userVars: Record<string, string> = currentUserVars,
): Promise<void> {
  currentConvexEnv = env;
  currentUserVars = userVars;
  await container.fs.writeFile(".env.local", buildEnvFileContents(env, userVars));
}

/**
 * Re-applies user frontend env vars on top of the last-written managed Convex
 * env. No-ops (returns false) if the container hasn't been provisioned yet —
 * the boot path will pick the vars up via `writeConvexEnvToContainer`.
 * Vite watches `.env.local` and restarts the dev server automatically.
 */
export async function applyUserFrontendEnvVars(
  container: WebContainer,
  userVars: Record<string, string>,
): Promise<boolean> {
  currentUserVars = userVars;
  if (!currentConvexEnv) return false;
  await container.fs.writeFile(
    ".env.local",
    buildEnvFileContents(currentConvexEnv, userVars),
  );
  return true;
}
