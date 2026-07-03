import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { buildFileSystemTree } from "@/vly/lib/webcontainer/fileSystemTree";

export const dynamic = "force-dynamic";

// Directories/files that should never be mounted into the WebContainer
// (build output, package manager metadata, OS cruft, generated Convex codegen
// that gets regenerated fresh once `convex dev` runs against the user's own
// deployment).
const IGNORED_NAMES = new Set([
  "node_modules",
  "dist",
  ".git",
  ".DS_Store",
  "_generated",
]);

const TEMPLATE_ROOT = path.join(process.cwd(), "webcontainer-template");

async function collectFiles(
  dir: string,
  baseDir: string,
  out: Record<string, string>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;

    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(absolutePath, baseDir, out);
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, absolutePath).split(path.sep).join("/");
      out[relativePath] = await readFile(absolutePath, "utf-8");
    }
  }
}

/**
 * Serves the default vly Vite + React + Convex starter as a WebContainer
 * `FileSystemTree`, ready to be passed straight to `container.mount()`. The
 * template source is checked into `freebuff/web/webcontainer-template/`.
 */
export async function GET() {
  const files: Record<string, string> = {};
  await collectFiles(TEMPLATE_ROOT, TEMPLATE_ROOT, files);

  const tree = buildFileSystemTree(files);

  return NextResponse.json(tree, {
    headers: {
      // Static template source — safe to cache aggressively; a deploy bump
      // changes the asset's URL hash via Next's build, but this route is
      // path-stable, so keep the cache window short-ish and revalidate.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=3600",
    },
  });
}
