import type { FileSystemTree } from "@webcontainer/api";

/**
 * Builds a WebContainer `FileSystemTree` (the nested `{ name: { directory: ... } | { file: ... } }`
 * shape `container.mount()` expects) from a flat map of POSIX-style relative
 * paths to UTF-8 file contents, e.g. `{ "src/main.tsx": "..." }`.
 */
export function buildFileSystemTree(files: Record<string, string>): FileSystemTree {
  const root: FileSystemTree = {};

  for (const [relativePath, contents] of Object.entries(files)) {
    const segments = relativePath.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const existing = cursor[segment];
      if (existing && "directory" in existing) {
        cursor = existing.directory;
      } else {
        const directory: FileSystemTree = {};
        cursor[segment] = { directory };
        cursor = directory;
      }
    }

    const fileName = segments[segments.length - 1];
    cursor[fileName] = { file: { contents } };
  }

  return root;
}
