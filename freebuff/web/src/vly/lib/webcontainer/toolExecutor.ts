"use client";

import { applyPatch } from "diff";
import type { WebContainer } from "@webcontainer/api";

import { IGNORED_SNAPSHOT_PATHS } from "./constants";
import { ContainerBootState, waitForContainerBootState } from "./bootState";
import { getCurrentConvexEnv } from "./env";

// Convex v.any() rejects arrays longer than 8192 elements. Stay well under.
const MAX_FILE_LIST = 2000;
// Keep terminal/search output reasonable (~50 KB).
const MAX_OUTPUT_CHARS = 50_000;

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const half = MAX_OUTPUT_CHARS / 2;
  return (
    output.slice(0, half) +
    `\n\n... [output truncated — ${output.length} chars total] ...\n\n` +
    output.slice(-half)
  );
}

function truncateFiles(files: string[]): { files: string[]; truncated?: number } {
  if (files.length <= MAX_FILE_LIST) return { files };
  return {
    files: files.slice(0, MAX_FILE_LIST),
    truncated: files.length - MAX_FILE_LIST,
  };
}

const DAYTONA_ROOT = "/home/daytona/codebase";

function normalizePath(path: string): string {
  // Strip the Daytona sandbox root that the model may include in file paths.
  // WebContainer files live at the container root, not under this prefix.
  if (path.startsWith(DAYTONA_ROOT + "/")) {
    path = path.slice(DAYTONA_ROOT.length + 1);
  } else if (path === DAYTONA_ROOT) {
    path = "";
  }
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Translate an absolute cwd (possibly Daytona-rooted) to a WebContainer absolute path. */
function normalizeCwd(cwd: string): string {
  if (cwd.startsWith(DAYTONA_ROOT + "/")) {
    return "/" + cwd.slice(DAYTONA_ROOT.length + 1);
  }
  if (cwd === DAYTONA_ROOT) return "/";
  if (!cwd.startsWith("/")) return "/" + cwd;
  return cwd;
}

/** Replace any /home/daytona/codebase occurrences in a shell command string. */
function normalizeCommand(command: string): string {
  // /home/daytona/codebase/src/... → /src/...
  // /home/daytona/codebase          → /
  return command
    .replace(new RegExp(DAYTONA_ROOT.replace(/\//g, "\\/") + "\\/", "g"), "/")
    .replace(new RegExp(DAYTONA_ROOT.replace(/\//g, "\\/") + "\\b", "g"), "/");
}

function shouldIgnorePath(path: string): boolean {
  return IGNORED_SNAPSHOT_PATHS.some(
    (ignored) => path === ignored || path.startsWith(`${ignored}/`),
  );
}

async function walkFiles(
  container: WebContainer,
  dir: string,
  files: string[] = [],
): Promise<string[]> {
  let entries: Awaited<ReturnType<WebContainer["fs"]["readdir"]>>;
  try {
    entries = await container.fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const path = dir === "." ? entry.name : `${dir}/${entry.name}`;
    if (shouldIgnorePath(path)) continue;

    if (entry.isDirectory()) {
      await walkFiles(container, path, files);
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function parseCreateDiff(diff: string): string {
  return diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

async function mkdirRecursive(
  container: WebContainer,
  dirPath: string,
): Promise<void> {
  if (!dirPath || dirPath === "." || dirPath === "") return;
  try {
    await container.fs.mkdir(dirPath, { recursive: true });
  } catch {
    // Already exists or can't be created — swallow, writeFile will surface the real error
  }
}

async function readFileSafe(
  container: WebContainer,
  path: string,
): Promise<string | null> {
  try {
    return await container.fs.readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export async function executeWebContainerTool(
  container: WebContainer,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  // Mirror browserPod behavior: do not execute tools until boot is fully ready.
  await waitForContainerBootState(ContainerBootState.READY);

  switch (toolName) {
    case "read_files": {
      const filePaths = Array.isArray(input.filePaths) ? input.filePaths : [];
      const results: Record<string, string | null> = {};
      await Promise.all(
        filePaths.map(async (filePath) => {
          const originalPath = String(filePath);
          const normalized = normalizePath(originalPath);
          results[originalPath] = await readFileSafe(container, normalized);
        }),
      );
      return results;
    }

    case "write_file": {
      const filePath = normalizePath(String(input.path ?? ""));
      const content = String(input.content ?? "");
      const dir = filePath.includes("/") ? filePath.split("/").slice(0, -1).join("/") : "";
      if (dir) await mkdirRecursive(container, dir);
      if (input.type === "patch") {
        const oldContent = await readFileSafe(container, filePath);
        if (oldContent === null) {
          return { file: filePath, errorMessage: "File does not exist." };
        }
        const patched = applyPatch(oldContent, content);
        if (patched === false) {
          return { file: filePath, errorMessage: "Failed to apply patch." };
        }
        await container.fs.writeFile(filePath, patched);
        return { file: filePath, message: "Applied patch in WebContainer." };
      }
      await container.fs.writeFile(filePath, content);
      return { file: filePath, message: "Wrote file in WebContainer." };
    }

    case "str_replace": {
      const filePath = normalizePath(String(input.path ?? ""));
      const oldString = String(input.old_str ?? input.oldString ?? "");
      const newString = String(input.new_str ?? input.newString ?? "");
      const oldContent = await readFileSafe(container, filePath);
      if (oldContent === null) {
        return { file: filePath, errorMessage: "File does not exist." };
      }
      if (!oldContent.includes(oldString)) {
        return { file: filePath, errorMessage: "Old string was not found." };
      }
      await container.fs.writeFile(
        filePath,
        oldContent.replace(oldString, newString),
      );
      return { file: filePath, message: "Replaced string in WebContainer." };
    }

    case "apply_patch": {
      const operation = input.operation as Record<string, unknown> | undefined;
      const filePath = normalizePath(String(operation?.path ?? ""));
      if (operation?.type === "delete_file") {
        await container.fs.rm(filePath);
        return {
          message: "Deleted file in WebContainer.",
          applied: [{ file: filePath, action: "delete" }],
        };
      }
      const diff = String(operation?.diff ?? "");
      if (operation?.type === "create_file") {
        const dir = filePath.includes("/") ? filePath.split("/").slice(0, -1).join("/") : "";
        if (dir) await mkdirRecursive(container, dir);
        await container.fs.writeFile(filePath, parseCreateDiff(diff));
        return {
          message: "Created file in WebContainer.",
          applied: [{ file: filePath, action: "add" }],
        };
      }
      if (operation?.type === "update_file") {
        const oldContent = await readFileSafe(container, filePath);
        if (oldContent === null) {
          return { errorMessage: "File does not exist." };
        }
        const patched = applyPatch(oldContent, diff);
        if (patched === false) {
          return { errorMessage: "Failed to apply patch." };
        }
        await container.fs.writeFile(filePath, patched);
        return {
          message: "Updated file in WebContainer.",
          applied: [{ file: filePath, action: "update" }],
        };
      }
      return { errorMessage: "Invalid apply_patch operation." };
    }

    case "run_terminal_command": {
      const rawCommand = String(input.command ?? "");
      // Translate any leftover /home/daytona/codebase references so commands
      // resolve correctly inside the WebContainer filesystem (rooted at /).
      const command = normalizeCommand(rawCommand);
      const timeoutSeconds = Number(input.timeout_seconds ?? 30);
      // Honour an explicit cwd if the agent set it; normalize Daytona prefix.
      const rawCwd = input.cwd ? String(input.cwd) : undefined;
      const cwd = rawCwd ? normalizeCwd(rawCwd) : "/";
      // Inject the Convex dev deploy key so `npx convex dev --once` (the
      // agent's post-task codegen/typecheck/push check) authenticates
      // non-interactively, same as the background `convex dev` watcher.
      const convexEnv = getCurrentConvexEnv();
      const env: Record<string, string> = convexEnv
        ? {
            CONVEX_DEPLOY_KEY: convexEnv.deployKey,
            CONVEX_DEPLOYMENT: convexEnv.convexDeployment,
          }
        : {};
      const shell = await container.spawn("jsh", ["-c", command], { cwd, env });
      let output = "";
      shell.output.pipeTo(
        new WritableStream({
          write(data) {
            output += data;
          },
        }),
      );
      const exitCode = await Promise.race([
        shell.exit,
        new Promise<number>((resolve) =>
          setTimeout(() => {
            shell.kill();
            resolve(124);
          }, Math.max(1, timeoutSeconds) * 1000),
        ),
      ]);
      return { output: truncateOutput(output), exitCode };
    }

    case "list_directory": {
      const directoryPath = normalizePath(String(input.path ?? "."));
      const prefix =
        directoryPath === "." || directoryPath === ""
          ? ""
          : `${directoryPath.replace(/\/+$/, "")}/`;
      const allFiles = await walkFiles(container, ".");
      const filtered = allFiles.filter((f) => f.startsWith(prefix));
      return { ...truncateFiles(filtered), path: directoryPath };
    }

    case "glob": {
      const pattern = String(input.pattern ?? "**/*");
      const matcher = globToRegExp(pattern);
      const allFiles = await walkFiles(container, ".");
      const matched = allFiles.filter((f) => matcher.test(f));
      return truncateFiles(matched);
    }

    case "code_search": {
      const query = String(input.query ?? "").replace(/'/g, "'\\''");

      const runSearch = async (command: string) => {
        const shell = await container.spawn("jsh", ["-c", command]);
        let output = "";
        shell.output.pipeTo(
          new WritableStream({
            write(data) {
              output += data;
            },
          }),
        );
        const exitCode = await shell.exit;
        return { output, exitCode };
      };

      // Fast path: most UI work lives under src, so search there first.
      const srcFirst = await runSearch(
        `if [ -d src ]; then grep -rn -- '${query}' src 2>/dev/null || true; fi`,
      );
      if (srcFirst.output.trim().length > 0) {
        return {
          output: truncateOutput(srcFirst.output),
          exitCode: srcFirst.exitCode,
          searchedIn: "src",
        };
      }

      const fullProject = await runSearch(
        `grep -rn -- '${query}' . 2>/dev/null || true`,
      );
      return {
        output: truncateOutput(fullProject.output),
        exitCode: fullProject.exitCode,
        searchedIn: "project",
      };
    }
      return { errorMessage: `Unsupported WebContainer tool: ${toolName}` };
  }
}
