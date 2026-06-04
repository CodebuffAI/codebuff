"use node";

import { v } from "convex/values";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";
import { action } from "../_generated/server";
import { getAuthUser } from "../users";
import { getVerifiedAccessProject } from "../project";
import {
  validateAndFixCronIntervals,
  isCronsFile,
} from "../coding_agent/agent/process/cronValidator";
import { internal } from "../_generated/api";
import { VersioningService } from "../services/VersioningService";
export const listFiles = action({
  args: {
    projectId: v.id("project"),
    path: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      name: v.string(),
      path: v.string(),
      type: v.union(v.literal("file"), v.literal("directory")),
      size: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    // Validate path to prevent directory traversal
    if (
      args.path &&
      (args.path === ".." ||
        args.path.startsWith("../") ||
        args.path.includes("/../") ||
        args.path.endsWith("/..") ||
        /[/\\]\.\./.test(args.path) ||
        /\\/.test(args.path))
    ) {
      throw new Error("Invalid path: directory traversal not allowed");
    }

    // Get authenticated user
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );
    const targetPath = args.path || "./";

    try {
      // Use the codebase's getAllFilePaths method to get all files
      const allFilePaths = await codebase.getAllFilePaths();

      // Filter files based on the target path
      let filteredPaths: string[];
      if (targetPath === "./") {
        // For root directory, show only top-level files and directories
        filteredPaths = allFilePaths.filter((path) => !path.includes("/"));

        // Also include top-level directories by checking if any files are in subdirectories
        const topLevelDirs = new Set<string>();
        allFilePaths.forEach((path) => {
          const firstSlash = path.indexOf("/");
          if (firstSlash > 0) {
            topLevelDirs.add(path.substring(0, firstSlash));
          }
        });

        // Add top-level directories to the list
        topLevelDirs.forEach((dir) => {
          if (!filteredPaths.includes(dir)) {
            filteredPaths.push(dir);
          }
        });
      } else {
        // For subdirectories, filter paths that start with the target path
        const normalizedTargetPath = targetPath.endsWith("/")
          ? targetPath
          : targetPath + "/";
        filteredPaths = allFilePaths
          .filter((path) => path.startsWith(normalizedTargetPath))
          .map((path) => path.substring(normalizedTargetPath.length))
          .filter((path) => path.length > 0);

        // Show only immediate children (no nested paths)
        const immediateChildren = new Set<string>();
        filteredPaths.forEach((path) => {
          const firstSlash = path.indexOf("/");
          if (firstSlash === -1) {
            // It's a file in this directory
            immediateChildren.add(path);
          } else {
            // It's in a subdirectory, add the subdirectory name
            immediateChildren.add(path.substring(0, firstSlash));
          }
        });

        filteredPaths = Array.from(immediateChildren);
      }

      // Check each path to determine if it's a file or directory
      const fileList = await Promise.all(
        filteredPaths
          .filter((name) => name !== ".git")
          .map(async (name) => {
            const fullPath =
              targetPath === "./" ? name : `${targetPath}/${name}`;

            // Check if this is a directory by seeing if any files exist with this prefix
            const isDirectory = allFilePaths.some((path) => {
              if (targetPath === "./") {
                return path.startsWith(name + "/");
              } else {
                const normalizedTargetPath = targetPath.endsWith("/")
                  ? targetPath
                  : targetPath + "/";
                return path.startsWith(normalizedTargetPath + name + "/");
              }
            });

            return {
              name,
              path: fullPath,
              type: isDirectory ? ("directory" as const) : ("file" as const),
              size: undefined,
            };
          }),
      );

      // Sort directories first, then files
      return fileList.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === "directory" ? -1 : 1;
      });
    } catch (error) {
      console.error("Error listing files:", error);
      throw new Error("Failed to list files");
    }
  },
});

export const readFile = action({
  args: {
    projectId: v.id("project"),
    path: v.string(),
  },
  returns: v.object({
    content: v.string(),
    language: v.string(),
    isImage: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    // Validate path to prevent directory traversal
    if (
      !args.path ||
      args.path === "." ||
      args.path === ".." ||
      args.path.startsWith("../") ||
      args.path.includes("/../") ||
      args.path.endsWith("/..") ||
      /[/\\]\.\./.test(args.path) ||
      /\\/.test(args.path)
    ) {
      throw new Error("Invalid file path: backslashes are not allowed");
    }

    // Get authenticated user
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    try {
      // Determine file type from extension
      const ext = args.path.split(".").pop()?.toLowerCase() || "";
      const fileName = args.path.split("/").pop()?.toLowerCase() || "";

      // Check if it's an image file (excluding SVG which should be treated as code)
      const imageExtensions = [
        "png",
        "jpg",
        "jpeg",
        "gif",
        "webp",
        "bmp",
        "ico",
      ];
      const isImage = imageExtensions.includes(ext);

      let content: string;
      let language: string;

      if (isImage) {
        // Check if file exists
        const fileExists = await (
          codebase as DaytonaCodebase
        ).checkIfFileExistsInCodebase(args.path);
        if (!fileExists) {
          throw new Error("Image file not found: " + args.path);
        }
        const imageBytes = await codebase.readFileBytes(args.path);

        content = Buffer.from(imageBytes).toString("base64");

        language = "image";

        return {
          content: content,
          language,
          isImage: true,
        };
      } else {
        // For text files, read as text
        content = await codebase.readFile(args.path);

        // Special handling for JSX/TSX files and common config files
        if (ext === "jsx" || (ext === "js" && content.includes("jsx"))) {
          language = "javascript"; // Use javascript for JSX to avoid strict parsing
        } else if (ext === "tsx" || (ext === "ts" && content.includes("<"))) {
          language = "javascript"; // Use javascript for TSX to avoid strict parsing
        } else {
          const languageMap: Record<string, string> = {
            js: "javascript",
            jsx: "javascript",
            ts: "javascript", // Use javascript instead of typescript for more lenient parsing
            tsx: "javascript",
            css: "css",
            scss: "scss",
            less: "less",
            html: "html",
            json: "json",
            md: "markdown",
            py: "python",
            java: "java",
            c: "c",
            cpp: "cpp",
            cs: "csharp",
            php: "php",
            rb: "ruby",
            go: "go",
            rs: "rust",
            swift: "swift",
            kt: "kotlin",
            yaml: "yaml",
            yml: "yaml",
            xml: "xml",
            svg: "xml", // SVG files are XML-based
            sql: "sql",
            sh: "shell",
            bash: "shell",
            dockerfile: "dockerfile",
            gitignore: "gitignore",
          };

          // Check for special filenames
          if (fileName.includes("dockerfile")) language = "dockerfile";
          else if (fileName.includes("gitignore")) language = "gitignore";
          else if (fileName.includes("package.json")) language = "json";
          else language = languageMap[ext] || "plaintext";
        }

        return {
          content,
          language,
          isImage: false,
        };
      }
    } catch (error) {
      console.error("Error reading file");
      throw new Error("Failed to read file");
    }
  },
});

export const writeFile = action({
  args: {
    projectId: v.id("project"),
    path: v.string(),
    content: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    adjustedContent: v.optional(v.string()),
    adjustments: v.optional(
      v.array(
        v.object({
          lineNumber: v.number(),
          originalInterval: v.string(),
          adjustedInterval: v.string(),
        }),
      ),
    ),
  }),
  handler: async (ctx, args) => {
    // Validate path to prevent directory traversal
    if (
      !args.path ||
      args.path === "." ||
      args.path === ".." ||
      args.path.startsWith("../") ||
      args.path.includes("/../") ||
      args.path.endsWith("/..") ||
      /[/\\]\.\./.test(args.path) ||
      /\\/.test(args.path)
    ) {
      throw new Error("Invalid file path: backslashes are not allowed");
    }

    // Get authenticated user
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    // Validate and fix cron intervals for crons.ts files
    let contentToWrite = args.content;
    let cronAdjustments = undefined;

    if (isCronsFile(args.path)) {
      const validation = validateAndFixCronIntervals(args.content);
      if (validation.adjustments.length > 0) {
        // Log adjustments to Axiom via console
        console.log("[CRON_INTERVAL_ADJUSTMENT]", {
          projectId: args.projectId,
          filePath: args.path,
          source: "manual_edit",
          adjustments: validation.adjustments,
        });
        // Use the adjusted content
        contentToWrite = validation.content;
        cronAdjustments = validation.adjustments;
      }
    }

    try {
      await codebase.writeFile(args.path, contentToWrite);
      return {
        success: true,
        adjustedContent: cronAdjustments ? contentToWrite : undefined,
        adjustments: cronAdjustments,
      };
    } catch (error) {
      console.error("Error writing file");
      throw new Error("Failed to write file");
    }
  },
});

export const createFile = action({
  args: {
    projectId: v.id("project"),
    path: v.string(),
    isDirectory: v.boolean(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Validate file path
    if (
      !args.path ||
      args.path === "." ||
      args.path === ".." ||
      args.path.startsWith("../") ||
      args.path.includes("/../") ||
      args.path.endsWith("/..") ||
      /[/\\]\.\./.test(args.path) ||
      /\\/.test(args.path)
    ) {
      throw new Error(
        "Invalid file path for creation: backslashes are not allowed",
      );
    }

    // Get authenticated user
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    try {
      if (args.isDirectory) {
        await codebase.createDirectory(args.path);
      } else {
        await codebase.writeFile(args.path, "");
      }
      return { success: true };
    } catch (error) {
      console.error("Error creating file/directory:", error);
      throw new Error("Failed to create file or directory");
    }
  },
});

export const deleteFile = action({
  args: {
    projectId: v.id("project"),
    path: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Validate file path
    if (
      !args.path ||
      args.path === "." ||
      args.path === ".." ||
      args.path.startsWith("../") ||
      args.path.includes("/../") ||
      args.path.endsWith("/..") ||
      /[/\\]\.\./.test(args.path) ||
      /\\/.test(args.path)
    ) {
      throw new Error(
        "Invalid file path for delete: backslashes are not allowed",
      );
    }

    // Get authenticated user
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify user has access to project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    try {
      await codebase.deleteFile(args.path);
      return { success: true };
    } catch (error) {
      console.error("Error deleting file");
      throw new Error("Failed to delete file");
    }
  },
});

/**
 * God mode only - List files at an absolute path from /home/daytona/
 */
export const godModeListFiles = action({
  args: {
    projectId: v.id("project"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error("Unauthorized: god mode required");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );
    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    const safePath = args.path.replace(/'/g, "'\\''");
    const absolutePath = `/home/daytona/${safePath}`.replace(/\/+/g, "/");
    const result = await codebase.runCommand(`ls -la '${absolutePath}' 2>&1`);

    const lines = result.output.trim().split("\n").filter(Boolean);
    const entries: {
      name: string;
      isDirectory: boolean;
      size: string;
      permissions: string;
    }[] = [];

    for (const line of lines) {
      if (line.startsWith("total ")) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;
      const permissions = parts[0];
      const size = parts[4];
      const name = parts.slice(8).join(" ");
      if (name === "." || name === "..") continue;
      entries.push({
        name,
        isDirectory: permissions.startsWith("d"),
        size,
        permissions,
      });
    }

    return { entries, rawOutput: result.output };
  },
});

/**
 * God mode only - Read a file at an absolute path from /home/daytona/
 */
export const godModeReadFile = action({
  args: {
    projectId: v.id("project"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error("Unauthorized: god mode required");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );
    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    const safePath = args.path.replace(/'/g, "'\\''");
    const absolutePath = `/home/daytona/${safePath}`.replace(/\/+/g, "/");
    const result = await codebase.runCommand(`cat '${absolutePath}'`);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.output}`);
    }

    return { content: result.output };
  },
});

/**
 * God mode only - Write a file at an absolute path from /home/daytona/
 */
export const godModeWriteFile = action({
  args: {
    projectId: v.id("project"),
    path: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error("Unauthorized: god mode required");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );
    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    const safePath = args.path.replace(/'/g, "'\\''");
    const absolutePath = `/home/daytona/${safePath}`.replace(/\/+/g, "/");
    const base64Content = Buffer.from(args.content).toString("base64");

    const result = await codebase.runCommand(
      `mkdir -p "$(dirname '${absolutePath}')" && printf '%s' '${base64Content}' | base64 -d > '${absolutePath}'`,
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.output}`);
    }

    return { success: true };
  },
});

/**
 * God mode only - Delete a file or directory at a path relative to /home/daytona/
 * Uses the Daytona file system API (DELETE /files) via sandbox.fs.deleteFile().
 * Sandbox: the project's sandbox (project.sandbox_id, e.g. daytona:<uuid>).
 */
export const godModeDeleteFile = action({
  args: {
    projectId: v.id("project"),
    path: v.string(),
    recursive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || user.role !== "god") {
      throw new Error("Unauthorized: god mode required");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined,
      args.projectId,
    );
    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or has no sandbox");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    if (!(codebase instanceof DaytonaCodebase)) {
      throw new Error(
        "Daytona FS delete is only supported for Daytona sandboxes",
      );
    }

    const normalizedPath = args.path.replace(/\/+/g, "/").replace(/^\//, "");
    await codebase.deleteFileAtPath(normalizedPath, {
      recursive: args.recursive ?? false,
    });

    return { success: true };
  },
});

/**
 * Commit editor changes and sync to GitHub
 * Called after a file is saved in the Monaco editor
 */
export const commitAndSyncEditorChange = action({
  args: {
    projectId: v.id("project"),
    filePath: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    commitHash: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // Get authenticated user
      const user = await getAuthUser(ctx);
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Verify user has access to project
      const project = await getVerifiedAccessProject(
        ctx,
        user._id,
        undefined,
        args.projectId,
      );

      if (!project) {
        throw new Error("Project not found");
      }

      // Create commit message
      const fileName = args.filePath.split("/").pop() || args.filePath;
      const commitMessage = `Update ${fileName} via editor`;

      console.log(`[Editor] Creating commit for file save: ${args.filePath}`);

      // Use VersioningService to create checkpoint (handles commit + GitHub sync)
      const versioningService = new VersioningService(ctx);
      const result = await versioningService.createCheckpoint(
        args.projectId,
        commitMessage,
      );

      if (result.success && result.checkpointId) {
        console.log(
          `[Editor] Successfully created commit: ${result.checkpointId}`,
        );

        // Schedule GitHub sync (non-blocking)
        await ctx.scheduler.runAfter(
          0,
          internal.codesandbox.versionControl.syncCommitToGitHub,
          {
            projectId: args.projectId,
            commitHash: result.checkpointId,
          },
        );

        return {
          success: true,
          commitHash: result.checkpointId,
        };
      } else {
        console.warn(
          `[Editor] Failed to create commit: ${result.error || "Unknown error"}`,
        );
        return {
          success: false,
          error: result.error || "Failed to create commit",
        };
      }
    } catch (error: any) {
      console.error("[Editor] Error committing and syncing:", error);
      return {
        success: false,
        error: error.message || "Failed to commit changes",
      };
    }
  },
});
