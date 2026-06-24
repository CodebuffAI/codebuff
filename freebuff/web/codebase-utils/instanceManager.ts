"use node";

import { CodeSandbox } from "@codesandbox/sdk";
import axios from "axios";
import { action } from "../convex/_generated/server";
import { createRepository } from "./github";
import { DaytonaSdkManager } from "./codebase/DaytonaSdkManager";
import type { DaytonaServer } from "./codebase/DaytonaSdkManager";

export async function openSandboxWithRetry(
  sdk: CodeSandbox,
  sandboxId: string,
) {
  const maxRetries = 6;
  let lastError: Error | null = null;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      return await sdk.sandboxes.resume(sandboxId);
    } catch (error) {
      console.log("Sandbox open failed, retrying...");
      lastError = error as Error;
      retryCount++;

      if (retryCount >= maxRetries) {
        break;
      }

      const backoffTime = Math.pow(2, retryCount) * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoffTime));
    }
  }

  // If we've exhausted all retries, throw the last error
  throw (
    lastError ||
    new Error(
      `Failed to open sandbox ${sandboxId} after ${maxRetries} attempts`,
    )
  );
}

/**
 * Writes a record to the cloudlfare workers KV to proxy the URL of the sandbox
 */
export async function configProxy({
  slug,
  target,
}: {
  slug: string;
  target: string;
}) {
  const key = slug.trim();
  // Remove https:// from target if it exists
  const cleanTarget = target.startsWith("https://")
    ? target.substring(8)
    : target;

  try {
    await axios.put(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDLFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.DOMAIN_PROXY_KV_NAMESPACE}/values/${encodeURIComponent(key)}`,
      cleanTarget,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_KV_TOKEN}`,
          "Content-Type": "*/*",
        },
      },
    );
  } catch (err) {
    console.error(JSON.stringify((err as any).response.data));
    throw err;
  }

  console.log("Proxy KV record written");
}

/**
 * @returns the url of the created repository
 */
export async function initializeGithubRepositoryOnSandbox(
  codeSandboxId: string,
  installationId?: number,
) {
  const sdk = new CodeSandbox(process.env.CSB_API_KEY);

  const sandbox = await openSandboxWithRetry(sdk, codeSandboxId);
  const session = await sandbox.connect();

  if (!installationId) {
    throw new Error("Installation ID is required");
  }

  const { clone_url } = await createRepository(codeSandboxId, installationId);

  console.log("Setting remote");
  const result = await session.commands.run(
    `cd codebase && git remote add origin ${clone_url}`,
  );
  console.log(result);

  console.log("Committing");
  const commitResult = await session.commands.run(
    "cd codebase && git add . && git commit -m 'Initial commit'",
  );
  console.log(commitResult);

  // console.log("Pushing to remote");
  // const pushResult = await sandbox.shells.run(
  //   "cd codebase && git push -u origin main",
  // );
  // console.log(pushResult.output);

  return clone_url;
}

export async function createCodeSandbox() {
  console.log("Starting createInstance");
  try {
    console.log(
      "Creating CodeSandbox SDK instance with key:",
      process.env.CSB_API_KEY ? "present" : "missing",
    );
    const sdk = new CodeSandbox(process.env.CSB_API_KEY);

    console.log(
      "Creating sandbox with template:",
      process.env.CODESANDBOX_TEMPLATE_ID,
    );
    const sandbox = await sdk.sandboxes.create({
      id: process.env.CODESANDBOX_TEMPLATE_ID,
      hibernationTimeoutSeconds: 60,
      automaticWakeupConfig: {
        http: true,
        websocket: true,
      },
      privacy: "unlisted",
    });
    console.log("Sandbox created:", sandbox.id);

    return { id: sandbox.id };
  } catch (error) {
    console.error("createInstance failed:", error);
    throw error;
  }
}

/**
 * True when an error is Daytona's "Too Many Requests" throttle. We match by
 * name/status rather than `instanceof` so it survives across bundles where the
 * SDK error class identity may differ.
 */
export function isDaytonaRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const e = error as {
    name?: string;
    statusCode?: number;
    message?: string;
  };
  return (
    e.name === "DaytonaRateLimitError" ||
    e.statusCode === 429 ||
    (typeof e.message === "string" &&
      /too many requests|throttlerexception|rate limit/i.test(e.message))
  );
}

/** Pull a Retry-After delay (ms) from the error's response headers, if present. */
function getRetryAfterMs(error: unknown): number | undefined {
  const headers = (error as { headers?: Record<string, unknown> } | undefined)
    ?.headers;
  if (!headers) {
    return undefined;
  }
  const raw =
    (typeof headers.get === "function"
      ? (headers as { get: (k: string) => unknown }).get("retry-after")
      : (headers["retry-after"] ?? headers["Retry-After"])) ?? undefined;
  if (raw == null) {
    return undefined;
  }
  const seconds = Number.parseInt(String(raw), 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

/**
 * Retry a Daytona call when it trips the API throttle (429). Uses the server's
 * Retry-After header when provided, otherwise exponential backoff with jitter.
 * Non-rate-limit errors are rethrown immediately.
 */
export async function withDaytonaRateLimitRetry<T>(
  fn: () => Promise<T>,
  label = "daytona call",
  maxRetries = 5,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (!isDaytonaRateLimitError(error) || attempt >= maxRetries) {
        throw error;
      }
      const backoff = Math.min(2 ** attempt * 1000, 30_000);
      const jitter = Math.floor(Math.random() * 500);
      const waitMs = (getRetryAfterMs(error) ?? backoff) + jitter;
      attempt += 1;
      console.warn(
        `[${label}] rate limited (429); retry ${attempt}/${maxRetries} in ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export async function createDaytonaSandbox(
  daytonaServer: DaytonaServer = "new",
  snapshotId?: string,
) {
  try {
    const effectiveSnapshotId = snapshotId ?? process.env.DAYTONA_SNAPSHOT_ID;
    console.log(
      `[createDaytonaSandbox] requested server=${daytonaServer} snapshot=${effectiveSnapshotId ?? "undefined"}`,
    );
    // Use the singleton SDK instance instead of creating a new one
    const daytona = DaytonaSdkManager.getDaytonaSDK(daytonaServer);

    console.log(
      "Creating sandbox with snapshot:",
      effectiveSnapshotId,
    );

    // Snapshot-based sandboxes inherit the snapshot's fixed CPU/RAM/disk, so
    // sizing tiers are expressed as separate snapshots (standard vs limited),
    // not as per-create resource overrides.
    const sandbox = await withDaytonaRateLimitRetry(
      () =>
        daytona.create({
          snapshot: effectiveSnapshotId,
          public: true,
          autoStopInterval: 10,
        }),
      "createDaytonaSandbox",
    );

    return { id: sandbox.id };
  } catch (error) {
    console.error("createDaytonaSandbox failed:", error);
    throw error;
  }
}

export async function shutdownInstance(id: string) {
  console.log("Starting shutdownInstance:", id);
  try {
    const sdk = new CodeSandbox(process.env.CSB_API_KEY);
    await sdk.sandboxes.shutdown(id);
    console.log("Instance shutdown complete");
  } catch (error) {
    console.error("shutdownInstance failed:", error);
    throw error;
  }
}

export async function startPreviewServerAndGetUrl(sandboxId: string) {
  console.log("Starting startPreviewServerAndGetUrl for sandboxId:", sandboxId);
  try {
    const sdk = new CodeSandbox(process.env.CSB_API_KEY);
    console.log("Opening sandbox");
    const sandbox = await openSandboxWithRetry(sdk, sandboxId);
    const session = await sandbox.connect();

    console.log("Waiting for preview port (5173) to open");

    await session.ports.waitForPort(5173);

    const previewUrl = session.hosts.getUrl(5173);

    fetch(previewUrl);

    console.log("Preview URL after server initialization is", previewUrl);

    return { previewUrl };
  } catch (error) {
    console.error("startPreviewServerAndGetUrl failed:", error);
    throw error;
  }
}

export async function getConvexUrl(sandboxId: string) {
  const sdk = new CodeSandbox(process.env.CSB_API_KEY);
  const sandbox = await openSandboxWithRetry(sdk, sandboxId);
  const session = await sandbox.connect();

  const extractURL = (inputString: string) => {
    // This regex pattern looks for http/https URLs
    const urlPattern = /(https?:\/\/[^\s]+)/;
    const match = inputString.match(urlPattern);

    if (match && match[1]) {
      return match[1];
    }

    return null; // Return null if no URL is found
  };

  const result = await session.commands.run(
    "cd codebase && npx convex dashboard --no-open",
  );

  return extractURL(result);
}

export const testSandbox = action({
  handler: async (ctx, args) => {
    const sdk = new CodeSandbox(process.env.CSB_API_KEY);
    const sandbox = await openSandboxWithRetry(sdk, "9kfj3m");
  },
});
