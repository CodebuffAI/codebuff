"use client";

import type { WebContainer } from "@webcontainer/api";

import { ContainerBootState, getContainerBootStatus } from "./bootState";
import { getWebContainer } from "./client";

/**
 * Client half of the WebContainer publish flow.
 *
 * Daytona projects build inside their server-side sandbox; WebContainer
 * projects only exist inside this browser tab, so the flow is:
 *
 *  1. server `prepareWebContainerProdDeploy` — provisions the prod Convex
 *     deployment, copies backend env vars, mints a prod deploy key
 *  2. (here) run `convex deploy --yes --cmd 'vite build'` inside the
 *     container — pushes Convex functions to prod AND builds the frontend
 *  3. (here) collect `dist/` and upload it to `/api/webcontainer/dist`
 *  4. server `finalizeWebContainerDeployment` — branding, Vercel upload,
 *     deployment activation
 */

export interface WebContainerPublishHandlers {
  /** Convex action codesandbox.webcontainerPublish.prepareWebContainerProdDeploy */
  prepare: () => Promise<{ prodDeploymentName: string; prodDeployKey: string }>;
  /** Convex action codesandbox.webcontainerPublish.finalizeWebContainerDeployment */
  finalize: (args: { distStorageId: string }) => Promise<{ domain: string }>;
  /** Convex mutation deployment.reportWebContainerDeployProgress */
  reportProgress: (args: {
    statusText?: string;
    failed?: boolean;
  }) => Promise<unknown>;
}

const BUILD_TIMEOUT_MS = 5 * 60 * 1000;

async function runBuild(
  container: WebContainer,
  prodDeployKey: string,
): Promise<void> {
  const process = await container.spawn(
    "npx",
    ["convex", "deploy", "--yes", "--cmd", "vite build"],
    { env: { CONVEX_DEPLOY_KEY: prodDeployKey, CI: "true" } },
  );

  let output = "";
  void process.output.pipeTo(
    new WritableStream({
      write(data) {
        output += data;
        console.log("[WebContainer:publish]", data);
      },
    }),
  );

  const exitCode = await Promise.race([
    process.exit,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Build timed out after 5 minutes")),
        BUILD_TIMEOUT_MS,
      ),
    ),
  ]);

  if (exitCode !== 0) {
    // Strip ANSI escapes and keep the tail — that's where the actual error is.
    // eslint-disable-next-line no-control-regex
    const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
    throw new Error(`Build failed (exit ${exitCode}):\n${clean.slice(-2000)}`);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function collectDistFiles(
  container: WebContainer,
  dir: string,
  prefix: string,
): Promise<Array<{ path: string; contentBase64: string }>> {
  const entries = await container.fs.readdir(dir, { withFileTypes: true });
  const files: Array<{ path: string; contentBase64: string }> = [];

  for (const entry of entries) {
    const fullPath = `${dir}/${entry.name}`;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectDistFiles(container, fullPath, relativePath)));
    } else {
      const content = await container.fs.readFile(fullPath);
      files.push({ path: relativePath, contentBase64: toBase64(content) });
    }
  }

  return files;
}

async function uploadDist(
  projectId: string,
  files: Array<{ path: string; contentBase64: string }>,
): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not configured");
  }

  const response = await fetch(
    `${siteUrl}/api/webcontainer/dist?projectId=${encodeURIComponent(projectId)}`,
    {
      method: "POST",
      body: JSON.stringify({ files }),
      headers: { "Content-Type": "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`Build artifact upload failed (${response.status})`);
  }

  const { storageId } = (await response.json()) as { storageId?: string };
  if (!storageId) {
    throw new Error("Build artifact upload did not return a storage id");
  }
  return storageId;
}

export async function runWebContainerPublish(
  projectId: string,
  handlers: WebContainerPublishHandlers,
): Promise<{ domain: string }> {
  try {
    if (getContainerBootStatus().state !== ContainerBootState.READY) {
      throw new Error(
        "The project workspace is still starting. Wait for it to finish loading, then deploy again.",
      );
    }
    const container = await getWebContainer();

    await handlers.reportProgress({
      statusText: "Preparing prod deployment...",
    });
    const { prodDeployKey } = await handlers.prepare();

    await handlers.reportProgress({
      statusText: "Building in your browser...",
    });
    await runBuild(container, prodDeployKey);

    await handlers.reportProgress({
      statusText: "Uploading build artifacts...",
    });
    const files = await collectDistFiles(container, "dist", "");
    if (files.length === 0) {
      throw new Error("Build produced no output in dist/");
    }
    const distStorageId = await uploadDist(projectId, files);

    return await handlers.finalize({ distStorageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await handlers
      .reportProgress({
        failed: true,
        statusText: `Deployment failed: ${message.slice(0, 500)}`,
      })
      .catch(() => {});
    throw error;
  }
}
