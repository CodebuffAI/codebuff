"use client";

import type { FileSystemTree, WebContainer } from "@webcontainer/api";

let cachedTemplate: Promise<FileSystemTree> | undefined;

/**
 * Fetches the default vly project template as a WebContainer `FileSystemTree`.
 * Cached for the lifetime of the tab — the template is static per deploy.
 */
export function loadTemplateFileSystemTree(): Promise<FileSystemTree> {
  if (!cachedTemplate) {
    cachedTemplate = fetch("/api/webcontainer/template")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load WebContainer template (${response.status})`);
        }
        return response.json() as Promise<FileSystemTree>;
      })
      .catch((error) => {
        // Don't poison the cache with a failed fetch — allow retrying.
        cachedTemplate = undefined;
        throw error;
      });
  }
  return cachedTemplate;
}

/** Mounts the default vly project template into a booted WebContainer. */
export async function mountTemplate(container: WebContainer): Promise<void> {
  const tree = await loadTemplateFileSystemTree();
  await container.mount(tree);
}
