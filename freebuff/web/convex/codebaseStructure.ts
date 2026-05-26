"use node";

/**
 * Codebase Structure - File-Based with Background Tasks
 *
 * Writes CODEBASE_STRUCTURE.md to sandbox at /home/daytona/CODEBASE_STRUCTURE.md
 * All updates happen in background tasks to never block the agent.
 *
 * Flow:
 * 1. Session start: Read file from sandbox (fallback if missing)
 * 2. Agent works: Track changedFiles[] only
 * 3. Session end: Background task updates file with changed entries
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { initializeCodebase } from "../codebase-utils/codebase/initializeCodebase";
import pLimit from "p-limit";

// File path relative to project root in sandbox
const STRUCTURE_FILE_PATH = "../CODEBASE_STRUCTURE.md";

// =============================================================================
// PURE FUNCTIONS - Export extraction and formatting
// =============================================================================

function extractExportsWithRegex(fileName: string, content: string): string[] {
  const exports: string[] = [];

  const constExports = content.matchAll(/export\s+(?:constj|let|var)\s+(\w+)/g);
  for (const match of constExports) exports.push(match[1]);

  const funcExports = content.matchAll(
    /export\s+(?:async\s+)?function\s+(\w+)/g,
  );
  for (const match of funcExports) exports.push(match[1]);

  const typeExports = content.matchAll(/export\s+(?:type|interface)\s+(\w+)/g);
  for (const match of typeExports) exports.push(match[1]);

  const classExports = content.matchAll(
    /export\s+(?:abstract\s+)?class\s+(\w+)/g,
  );
  for (const match of classExports) exports.push(match[1]);

  const defaultExport = content.match(
    /export\s+default\s+(?:function\s+|class\s+|async\s+function\s+)?(\w+)/,
  );
  if (
    defaultExport &&
    defaultExport[1] !== "function" &&
    defaultExport[1] !== "class"
  ) {
    exports.push(`default:${defaultExport[1]}`);
  }

  const namedExports = content.matchAll(/export\s*\{([^}]+)\}/g);
  for (const match of namedExports) {
    const names = match[1].split(",").map((n) => {
      const parts = n.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    });
    exports.push(...names.filter((n) => n && n !== ""));
  }

  return [...new Set(exports)];
}

function formatFileEntry(fileName: string, exports: string[]): string {
  if (exports.length === 0) {
    return `- ${fileName}`;
  }
  const displayExports = exports.slice(0, 10);
  const suffix = exports.length > 10 ? `, +${exports.length - 10} more` : "";
  return `- ${fileName} → \`${displayExports.join("`, `")}\`${suffix}`;
}

const SKIP_PATTERNS = [
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".cache",
  "coverage",
  "__pycache__",
  ".DS_Store",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".env",
  ".env.local",
  "src/components/ui/",
];

function shouldSkipPath(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => filePath.includes(pattern));
}

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

function generateStructureMarkdown(allFiles: Record<string, string>): string {
  const filePaths = Object.keys(allFiles)
    .filter((p) => !shouldSkipPath(p))
    .sort();
  const tree: Record<string, { fileName: string; exports: string[] }[]> = {};

  for (const filePath of filePaths) {
    const content = allFiles[filePath];
    const parts = filePath.split("/");
    const fileName = parts.pop()!;
    const dir = parts.join("/") || ".";

    if (!tree[dir]) tree[dir] = [];
    const exports = isCodeFile(filePath)
      ? extractExportsWithRegex(fileName, content)
      : [];
    tree[dir].push({ fileName, exports });
  }

  const timestamp = new Date().toISOString();
  let md = `# Codebase Structure\n`;
  md += `<!-- Generated: ${timestamp} | Files: ${filePaths.length} -->\n\n`;

  for (const dir of Object.keys(tree).sort()) {
    md += `## ${dir}/\n`;
    for (const file of tree[dir]) {
      md += formatFileEntry(file.fileName, file.exports) + "\n";
    }
    md += "\n";
  }

  return md;
}

function updateStructureForFile(
  currentStructure: string,
  filePath: string,
  newContent: string,
): string {
  if (shouldSkipPath(filePath)) return currentStructure;

  const parts = filePath.split("/");
  const fileName = parts.pop()!;
  const dir = parts.join("/") || ".";

  const exports = isCodeFile(filePath)
    ? extractExportsWithRegex(fileName, newContent)
    : [];
  const newEntry = formatFileEntry(fileName, exports);

  const dirHeader = `## ${dir}/`;
  const lines = currentStructure.split("\n");
  const result: string[] = [];
  let inTargetDir = false;
  let fileUpdated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      if (line === dirHeader) {
        inTargetDir = true;
        result.push(line);
        continue;
      } else if (inTargetDir) {
        if (!fileUpdated) {
          result.push(newEntry);
          fileUpdated = true;
        }
        inTargetDir = false;
      }
    }

    if (inTargetDir && line.startsWith(`- ${fileName}`)) {
      result.push(newEntry);
      fileUpdated = true;
      continue;
    }

    result.push(line);
  }

  if (!fileUpdated) {
    const insertIndex = result.findIndex((line) => {
      if (!line.startsWith("## ")) return false;
      const existingDir = line.slice(3, -1);
      return existingDir > dir;
    });

    if (insertIndex === -1) {
      result.push(`\n${dirHeader}`);
      result.push(newEntry);
    } else {
      result.splice(insertIndex, 0, `${dirHeader}`, newEntry, "");
    }
  }

  return result.join("\n");
}

function removeFileFromStructure(
  currentStructure: string,
  filePath: string,
): string {
  if (shouldSkipPath(filePath)) return currentStructure;

  const parts = filePath.split("/");
  const fileName = parts.pop()!;
  const dir = parts.join("/") || ".";

  const dirHeader = `## ${dir}/`;
  const lines = currentStructure.split("\n");
  const result: string[] = [];
  let inTargetDir = false;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      inTargetDir = line === dirHeader;
    }

    if (inTargetDir && line.startsWith(`- ${fileName}`)) {
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

// =============================================================================
// CONVEX ACTIONS - Background tasks for file operations
// =============================================================================

/**
 * Generate full structure and write to sandbox.
 * Called in background when file doesn't exist.
 */
export const generateFullStructure = internalAction({
  args: {
    sandboxId: v.string(),
    packageManager: v.union(v.literal("pnpm"), v.literal("bun")),
  },
  handler: async (ctx, args) => {
    console.log("[CodebaseStructure] Starting full structure generation...");

    const codebase = await initializeCodebase(
      args.sandboxId,
      args.packageManager,
    );

    // Get all file paths
    const filePaths = await codebase.getAllFilePaths();
    console.log(`[CodebaseStructure] Found ${filePaths.length} files`);

    // Read files in parallel with limit
    const limit = pLimit(50);
    const allFiles: Record<string, string> = {};

    await Promise.all(
      filePaths.map((path) =>
        limit(async () => {
          try {
            const content = await codebase.readFile(path);
            if (content) allFiles[path] = content;
          } catch {}
        }),
      ),
    );

    // Generate markdown
    const structure = generateStructureMarkdown(allFiles);

    // Write to sandbox
    await codebase.writeFile(STRUCTURE_FILE_PATH, structure);

    console.log(
      `[CodebaseStructure] Generated and wrote structure file (${Object.keys(allFiles).length} files)`,
    );
  },
});

/**
 * Update structure for changed files only.
 * Called in background after session ends.
 */
export const updateChangedFiles = internalAction({
  args: {
    sandboxId: v.string(),
    packageManager: v.union(v.literal("pnpm"), v.literal("bun")),
    changedFiles: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.changedFiles.length === 0) {
      console.log("[CodebaseStructure] No changed files to update");
      return;
    }

    console.log(
      `[CodebaseStructure] Updating ${args.changedFiles.length} changed files...`,
    );

    const codebase = await initializeCodebase(
      args.sandboxId,
      args.packageManager,
    );

    // Read current structure
    let structure: string;
    try {
      structure = await codebase.readFile(STRUCTURE_FILE_PATH);
    } catch {
      // File doesn't exist, generate full instead
      console.log(
        "[CodebaseStructure] Structure file missing, generating full...",
      );

      const filePaths = await codebase.getAllFilePaths();
      const limit = pLimit(50);
      const allFiles: Record<string, string> = {};

      await Promise.all(
        filePaths.map((path) =>
          limit(async () => {
            try {
              const content = await codebase.readFile(path);
              if (content) allFiles[path] = content;
            } catch {}
          }),
        ),
      );

      structure = generateStructureMarkdown(allFiles);
      await codebase.writeFile(STRUCTURE_FILE_PATH, structure);
      console.log("[CodebaseStructure] Generated full structure");
      return;
    }

    // Update each changed file
    for (const filePath of args.changedFiles) {
      try {
        const content = await codebase.readFile(filePath);
        structure = updateStructureForFile(structure, filePath, content);
      } catch {
        // File was deleted
        structure = removeFileFromStructure(structure, filePath);
      }
    }

    // Write updated structure
    await codebase.writeFile(STRUCTURE_FILE_PATH, structure);

    console.log(
      `[CodebaseStructure] Updated structure for ${args.changedFiles.length} files`,
    );
  },
});
