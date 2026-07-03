"use client";

import type { WebContainer } from "@webcontainer/api";

import { compressWithLz4, decompressWithLz4 } from "./compression";
import { IGNORED_SNAPSHOT_PATHS } from "./constants";

export async function exportFilesystemSnapshot(
  container: WebContainer,
): Promise<Uint8Array> {
  const raw = await container.export(".", {
    excludes: IGNORED_SNAPSHOT_PATHS,
    format: "binary",
  });
  return compressWithLz4(raw);
}

export async function importFilesystemSnapshot(
  container: WebContainer,
  compressed: Uint8Array,
): Promise<void> {
  const decompressed = decompressWithLz4(compressed);
  await container.mount(decompressed);
}

export async function uploadFilesystemSnapshot(
  projectId: string,
  compressed: Uint8Array,
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not configured");
  }

  const response = await fetch(
    `${siteUrl}/api/webcontainer/snapshot?projectId=${encodeURIComponent(projectId)}`,
    {
      method: "POST",
      body: new Blob([Uint8Array.from(compressed)], {
        type: "application/octet-stream",
      }),
      headers: { "Content-Type": "application/octet-stream" },
    },
  );

  if (!response.ok) {
    throw new Error(`Snapshot upload failed (${response.status})`);
  }
}
