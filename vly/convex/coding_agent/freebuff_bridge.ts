"use node";

import { createHmac, timingSafeEqual } from "crypto";
import { applyPatch } from "diff";
import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { internal } from "../_generated/api";

const CALLBACK_SKEW_MS = 5 * 60 * 1000;

function unauthorized(message = "Unauthorized") {
  return { ok: false, status: 401, body: { error: message } };
}

function verifyCallback(args: {
  rawBody: string;
  authorization?: string;
  timestamp?: string;
  signature?: string;
}) {
  const bearerToken = process.env.FREEBUFF_TO_VLY_CALLBACK_TOKEN;
  if (bearerToken && args.authorization === `Bearer ${bearerToken}`) {
    return true;
  }

  const secret = process.env.FREEBUFF_TO_VLY_CALLBACK_SECRET;
  if (!secret || !args.timestamp || !args.signature) {
    return false;
  }

  const timestamp = Number(args.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > CALLBACK_SKEW_MS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${args.timestamp}.${args.rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(args.signature, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function asJson(value: unknown) {
  return [{ type: "json", value }];
}

function normalizePath(value: unknown) {
  return typeof value === "string" ? value : "";
}

function assertProjectPath(filePath: string) {
  if (
    !filePath ||
    filePath.startsWith("/") ||
    filePath.includes("..") ||
    filePath.includes("\0")
  ) {
    throw new Error(`Invalid project path: ${filePath}`);
  }
}

function commandIsBlocked(command: string) {
  return /(^|\s)(git|gh)(\s|$)/.test(command);
}

function globToRegExp(pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function parseCreateDiff(diff: string) {
  return diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

export const handleToolRequest = internalAction({
  args: {
    rawBody: v.string(),
    authorization: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    signature: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!verifyCallback(args)) {
      return unauthorized();
    }

    const request = JSON.parse(args.rawBody) as {
      projectId: string;
      toolName: string;
      input: any;
    };

    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: request.projectId as Id<"project">,
    });
    if (!project) {
      return asJson({ errorMessage: "Project not found" });
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    try {
      switch (request.toolName) {
        case "read_files": {
          const filePaths = Array.isArray(request.input?.filePaths)
            ? request.input.filePaths
            : [];
          const results: Record<string, string | null> = {};
          for (const filePath of filePaths) {
            const normalized = normalizePath(filePath);
            assertProjectPath(normalized);
            try {
              results[normalized] = await codebase.readFile(normalized);
            } catch {
              results[normalized] = null;
            }
          }
          return results;
        }

        case "write_file":
        case "str_replace": {
          const filePath = normalizePath(request.input?.path);
          assertProjectPath(filePath);
          const content = String(request.input?.content ?? "");
          if (request.input?.type === "patch") {
            const oldContent = await codebase.readFile(filePath);
            const newContent = applyPatch(oldContent, content);
            if (newContent === false) {
              return asJson({
                file: filePath,
                errorMessage: "Failed to apply patch.",
              });
            }
            await codebase.writeFile(filePath, newContent);
            return asJson({
              file: filePath,
              message: "Applied patch through Vly Daytona bridge.",
            });
          }
          await codebase.writeFile(filePath, content);
          return asJson({
            file: filePath,
            message: "Wrote file through Vly Daytona bridge.",
          });
        }

        case "apply_patch": {
          const operation = request.input?.operation;
          const filePath = normalizePath(operation?.path);
          assertProjectPath(filePath);

          if (operation?.type === "delete_file") {
            await codebase.deleteFile(filePath);
            return asJson({
              message: "Deleted file through Vly Daytona bridge.",
              applied: [{ file: filePath, action: "delete" }],
            });
          }

          const diff = String(operation?.diff ?? "");
          if (operation?.type === "create_file") {
            await codebase.writeFile(filePath, parseCreateDiff(diff));
            return asJson({
              message: "Created file through Vly Daytona bridge.",
              applied: [{ file: filePath, action: "add" }],
            });
          }

          if (operation?.type === "update_file") {
            const oldContent = await codebase.readFile(filePath);
            const newContent = applyPatch(oldContent, diff);
            if (newContent === false) {
              return asJson({ errorMessage: "Failed to apply patch." });
            }
            await codebase.writeFile(filePath, newContent);
            return asJson({
              message: "Updated file through Vly Daytona bridge.",
              applied: [{ file: filePath, action: "update" }],
            });
          }

          return asJson({ errorMessage: "Invalid apply_patch operation." });
        }

        case "run_terminal_command": {
          const command = String(request.input?.command ?? "");
          if (commandIsBlocked(command)) {
            return asJson({
              errorMessage:
                "Git and GitHub commands are blocked; Vly manages version control.",
            });
          }
          const timeoutSeconds = Number(request.input?.timeout_seconds ?? 30);
          const result = await codebase.runCommand(
            command,
            Math.max(1, timeoutSeconds) * 1000,
          );
          return asJson({
            output: result.output,
            exitCode: result.exitCode ?? 0,
          });
        }

        case "list_directory": {
          const directoryPath = normalizePath(request.input?.path ?? ".");
          const prefix =
            directoryPath === "." || directoryPath === ""
              ? ""
              : `${directoryPath.replace(/\/+$/, "")}/`;
          assertProjectPath(prefix || "package.json");
          const files = await codebase.getAllFilePaths();
          return asJson({
            files: files.filter((filePath) => filePath.startsWith(prefix)),
          });
        }

        case "glob": {
          const pattern = String(request.input?.pattern ?? "**/*");
          const matcher = globToRegExp(pattern);
          const files = await codebase.getAllFilePaths();
          return asJson({
            files: files.filter((filePath) => matcher.test(filePath)),
          });
        }

        case "code_search": {
          const query = String(request.input?.query ?? "");
          const escaped = query.replace(/'/g, "'\\''");
          const result = await codebase.runCommand(
            `rg --line-number --no-heading -- '${escaped}' .`,
            30_000,
          );
          return asJson({
            output: result.output,
            exitCode: result.exitCode ?? 0,
          });
        }

        default:
          return asJson({
            errorMessage: `Unsupported Vly bridge tool: ${request.toolName}`,
          });
      }
    } catch (error) {
      return asJson({
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

export const handleRunEvent = internalAction({
  args: {
    rawBody: v.string(),
    authorization: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    signature: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!verifyCallback(args)) {
      return unauthorized();
    }

    const event = JSON.parse(args.rawBody) as any;
    let runStateStorageId: Id<"_storage"> | undefined;

    if (event.type === "final" && event.runState !== undefined) {
      const blob = new Blob([JSON.stringify(event.runState)], {
        type: "application/json",
      });
      runStateStorageId = await ctx.storage.store(blob);
      delete event.runState;
    }

    await ctx.runMutation(
      (internal as any).coding_agent.freebuff_bridge.recordRunEvent,
      {
        event,
        runStateStorageId,
      },
    );

    return { ok: true };
  },
});

export const recordRunEvent = internalMutation({
  args: {
    event: v.any(),
    runStateStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const event = args.event as any;
    const messageId = event.messageId as Id<"agent_message">;
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Agent message not found");

    const threadId = event.threadId as Id<"agent_thread">;
    const thread = await ctx.db.get(threadId);
    if (!thread || message.thread_id !== threadId) {
      throw new Error("Thread/message mismatch");
    }

    if (thread.project_id !== (event.projectId as Id<"project">)) {
      throw new Error("Project/thread mismatch");
    }

    const assistantStream = [...(message.assistant_stream ?? [])];

    if (event.type === "text_delta") {
      assistantStream.push({
        type: "text",
        content: String(event.chunk ?? ""),
      });
    } else if (event.type === "reasoning_delta") {
      assistantStream.push({
        type: "reasoning",
        title: "Reasoning",
        content: String(event.chunk ?? ""),
      });
    } else if (event.type === "subagent_delta") {
      assistantStream.push({
        type: "subagent",
        title: event.agentType,
        content: String(event.chunk ?? ""),
      });
    } else if (event.type === "status") {
      assistantStream.push({
        type: "status",
        title: event.title ?? event.status,
        content: String(event.content ?? event.status ?? ""),
      });
    } else if (event.type === "error") {
      assistantStream.push({
        type: "error",
        title: "Freebuff error",
        content: String(event.message ?? "Unknown Freebuff error"),
      });
    }

    const patch: Record<string, any> = {
      assistant_stream: assistantStream,
    };

    if (event.type === "start") {
      patch.state = "Processing";
      patch.isStreaming = true;
    } else if (event.type === "final") {
      patch.state = "Completed";
      patch.isStreaming = false;
      patch.session_id = event.runId;
      await ctx.db.patch(threadId, {
        active_session_id: event.runId,
        active_freebuff_run_state_storage_id: args.runStateStorageId,
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      } as any);
      await ctx.db.patch(thread.project_id, { state: "active" });
    } else if (event.type === "error") {
      patch.state = "Error";
      patch.state_message = String(event.message ?? "Freebuff run failed");
      patch.isStreaming = false;
      await ctx.db.patch(threadId, {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      });
      await ctx.db.patch(thread.project_id, { state: "active" });
    }

    await ctx.db.patch(messageId, patch);
  },
});
