// Runner port of convex/coding_agent/cli_agent/executeClaudeCode.ts
// (docs/freebuff-render-harness.md). Differences from the Convex action copy:
//   - ctx is the RunnerCtx bridge (runQuery/runMutation/storage over HTTP).
//   - Stream items go through `emitStreamItem` → the runner's batched
//     recordRunEventBatch mutation → agent_message_delta rows, instead of
//     full-array updateAgentMessageStream rewrites.
//   - One wall-clock turn limit (`turnLimitMs`) replaces the per-action abort
//     + cloud chaining; `isInterrupted` covers user cancel / runner shutdown.

import { internal } from "../../web/convex/_generated/api";
import { Id } from "../../web/convex/_generated/dataModel";
import { DaytonaCodebase } from "../../web/codebase-utils/codebase/DaytonaCodebase";
import {
  cliAgentSystemPrompt,
  knowledgePrompts,
} from "../../web/convex/coding_agent/cli_agent/system_prompt";
import { escapeShellArg } from "../../web/convex/coding_agent/cli_agent/shellEscape";
import { refreshConnectedRepoOrigin } from "../../web/convex/coding_agent/cli_agent/gitRemoteAuth";
import { processStreamItem as parseStreamItem } from "../../web/convex/coding_agent/cli_agent/streamParser";
import { CLI_AGENT_TIMEOUT_MESSAGE } from "../../web/convex/coding_agent/cli_agent/timeLimits";

import type { RunnerCtx } from "./convexBridge";

export type CliStreamItem = {
  type: string;
  title?: string;
  status?: string;
  content: string;
  description?: string;
};

export interface ExecuteClaudeCodeArgs {
  projectId: Id<"project">;
  threadId: Id<"agent_thread">;
  messageId: Id<"agent_message">;
  sandboxId: string;
  activeSessionId: string | undefined;
  executingUserId: Id<"users">;
  userMessage: string;
  images: Id<"_storage">[] | undefined;
  claudeProviderPreference: "anthropic" | "bedrock";
  claudeModelPreference?: string;
  anthropicApiKey?: string;
  bedrockBearerToken?: string;
  // Wall-clock limit for this turn (no chaining on the runner).
  turnLimitMs: number;
  // Ship a UI-shaped stream item to the client (batched delta rows).
  emitStreamItem: (item: CliStreamItem) => void;
  // User cancel or runner shutdown — abort the CLI at the next stream chunk.
  isInterrupted: () => boolean;
}

export interface ExecuteClaudeCodeResult {
  success: boolean;
  error?: string;
  sessionId?: string;
  timedOut?: boolean;
}

const ANTHROPIC_CLAUDE_MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
] as const;

const BEDROCK_CLAUDE_MODELS = [
  "us.anthropic.claude-opus-4-8",
  "us.anthropic.claude-sonnet-4-6",
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
] as const;

const ANTHROPIC_CLAUDE_MODEL_SET = new Set<string>(ANTHROPIC_CLAUDE_MODELS);
const BEDROCK_CLAUDE_MODEL_SET = new Set<string>(BEDROCK_CLAUDE_MODELS);

const resolveClaudeModelPreference = (
  provider: "anthropic" | "bedrock",
  preference: string | undefined,
) => {
  const selected = preference?.trim();
  if (provider === "bedrock") {
    if (selected && BEDROCK_CLAUDE_MODEL_SET.has(selected)) {
      return selected;
    }
    return "us.anthropic.claude-sonnet-4-6";
  }

  if (selected && ANTHROPIC_CLAUDE_MODEL_SET.has(selected)) {
    return selected;
  }
  return "claude-sonnet-4-6";
};

export async function executeClaudeCode(
  ctx: RunnerCtx,
  codebase: DaytonaCodebase,
  args: ExecuteClaudeCodeArgs,
): Promise<ExecuteClaudeCodeResult> {
  const projectRecord = await ctx.runQuery(internal.project.getProject, {
    projectId: args.projectId,
  });
  const shouldInjectConvexDeployKey = projectRecord?.project_type === "template";
  // Freebuff Cloud (connected_repo) operates on the user's real repo, so git is
  // allowed here; web/template stays platform-managed.
  const isConnectedRepoProject =
    projectRecord?.project_type === "connected_repo";

  // Authenticate `origin` up front so agent-run fetch/pull/push work on
  // long-lived cloud sandboxes. Best-effort; local git works regardless.
  if (isConnectedRepoProject) {
    await refreshConnectedRepoOrigin(codebase, projectRecord);
  }

  const selectedProvider = args.claudeProviderPreference;
  const anthropicApiKey = args.anthropicApiKey?.trim() || undefined;
  const awsBearerToken = args.bedrockBearerToken?.trim() || undefined;
  const selectedModel = resolveClaudeModelPreference(
    selectedProvider,
    args.claudeModelPreference,
  );

  if (selectedProvider === "anthropic" && !anthropicApiKey) {
    return {
      success: false,
      sessionId: undefined,
      error:
        "Claude provider is set to Anthropic, but no API key is saved. Add one in Settings > AI Credentials.",
    };
  }

  if (selectedProvider === "bedrock" && !awsBearerToken) {
    return {
      success: false,
      sessionId: undefined,
      error:
        "Claude provider is set to Bedrock, but no bearer token is saved. Add one in Settings > AI Credentials.",
    };
  }

  // Escape session ID if provided (user-controlled input)
  const escapedSessionId = args.activeSessionId?.trim() || "";
  const resumeFlag = escapedSessionId
    ? ` --resume ${escapeShellArg(escapedSessionId)} --fork-session`
    : "";

  // Download images to temp files so the CLI agent can read them visually
  let userMessageWithImages = args.userMessage;
  if (args.images && args.images.length > 0) {
    const downloadedPaths: string[] = [];
    for (let i = 0; i < args.images.length; i++) {
      const imageUrl = await ctx.storage.getUrl(args.images[i]);
      if (imageUrl) {
        const tempPath = `/tmp/vly-user-image-${i + 1}.png`;
        try {
          await codebase.runCommand(
            `curl -sL ${escapeShellArg(imageUrl)} -o ${escapeShellArg(tempPath)}`,
            15000,
          );
          downloadedPaths.push(tempPath);
        } catch {
          // If download fails, skip this image
        }
      }
    }

    if (downloadedPaths.length > 0) {
      const imageReferences = downloadedPaths
        .map(
          (path, idx) =>
            `Image ${idx + 1}: ${path} (use your Read tool to view this image)`,
        )
        .join("\n");
      userMessageWithImages = `${args.userMessage}\n\nThe user has attached ${downloadedPaths.length} image(s). Read these image files to see what the user is referring to:\n${imageReferences}`;
    }
  }

  // Escape user message/prompt (user-controlled input, now includes image URLs)
  const escapedPrompt = escapeShellArg(userMessageWithImages);

  // Get package manager and runner for system prompt interpolation
  const pm = codebase.getPackageManager();
  const runner = pm.runner(); // "npx" or "bunx"
  const packageManagerName = codebase.getPackageManagerName();

  // Template projects get the platform prompt. Cloud connected repos should
  // receive only the user's prompt and repo-local instructions.
  const escapedSystemPrompt = isConnectedRepoProject
    ? undefined
    : escapeShellArg(
        cliAgentSystemPrompt(runner, { allowGit: false }) +
          knowledgePrompts(runner, packageManagerName),
      );

  // Build the base Claude Code command with escaped inputs
  const commandParts = [
    "claude",
    "--model",
    escapeShellArg(selectedModel),
    "--dangerously-skip-permissions",
    resumeFlag.trim(),
    "-p",
    escapedPrompt,
    escapedSystemPrompt ? "--append-system-prompt" : "",
    escapedSystemPrompt ?? "",
    "--tools",
    '"default"',
    "--output-format",
    "stream-json",
    "--verbose",
  ].filter((part) => part.length > 0); // Remove empty parts (e.g., if resumeFlag is empty)

  const command = commandParts.join(" ");

  const escapedAwsToken = awsBearerToken
    ? escapeShellArg(awsBearerToken)
    : undefined;
  const escapedAnthropicApiKey = anthropicApiKey
    ? escapeShellArg(anthropicApiKey)
    : undefined;

  // Build PATH matching old agent: /home/daytona/.local/bin + system PATH, plus npm-global bin
  const systemPath = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
  // PATH doesn't need escaping since we control the value
  const pathValue = `"$HOME/.local/share/npm-global/bin:/home/daytona/.local/bin:${systemPath}"`;

  // Build env vars array (matching old agent's executeCommand env vars + AWS Bedrock config)
  // For connected-repo cloud projects, do not inject Convex deploy credentials.
  const envVars = [
    `ANTHROPIC_API_KEY=`,
    `AWS_BEARER_TOKEN_BEDROCK=`,
    `AWS_ACCESS_KEY_ID=`,
    `AWS_SECRET_ACCESS_KEY=`,
    `AWS_SESSION_TOKEN=`,
    `AWS_PROFILE=`,
    `CLAUDE_CODE_USE_BEDROCK=`,
    ...(selectedProvider === "bedrock" && escapedAwsToken
      ? [
          `AWS_BEARER_TOKEN_BEDROCK=${escapedAwsToken}`,
          `CLAUDE_CODE_USE_BEDROCK=1`,
          `AWS_REGION=us-east-1`,
        ]
      : []),
    ...(selectedProvider === "anthropic" && escapedAnthropicApiKey
      ? [`ANTHROPIC_API_KEY=${escapedAnthropicApiKey}`]
      : []),
    ...(shouldInjectConvexDeployKey
      ? [`CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/dev.key 2>/dev/null || echo "")`]
      : []),
    `GIT_TERMINAL_PROMPT=0`,
    `PATH=${pathValue}`,
  ].join(" ");

  // Prepend environment variables and change to codebase directory before running
  // Matches old agent's environment setup for consistency (working dir: /home/daytona/codebase)
  // Using command substitution for deploy key eliminates the need for a separate command
  const fullCommand = `cd /home/daytona/codebase && ${envVars} ${command}`;

  // Set up streaming assistant_stream array
  const assistantStream: Array<{
    type: string;
    title?: string;
    status?: string;
    content: string;
    description?: string;
  }> = [];

  // Track session ID from result type chunks
  let newSessionId: string | undefined = undefined;

  // Track if we should terminate (when result type received with session ID and usage)
  let shouldTerminate = false;
  // Runner turn limit: one wall-clock ceiling for the whole turn — there is no
  // Convex action ceiling here, so no chaining and no cloud budget math.
  let timedOut = false;
  const runTimeoutHandle = setTimeout(() => {
    timedOut = true;
    shouldTerminate = true;
  }, args.turnLimitMs);

  // Items are shipped as batched delta rows via emitStreamItem; this counter
  // tracks what has already been emitted.
  let lastUpdateCount = 0;
  const flushAssistantStream = () => {
    const pending = assistantStream.slice(lastUpdateCount);
    lastUpdateCount = assistantStream.length;
    for (const item of pending) args.emitStreamItem(item);
  };

  // Track all mutation promises to ensure they complete (prevents dangling promise warnings)
  const pendingMutations: Promise<any>[] = [];

  // Helper to track mutation promises
  const trackMutation = <T>(promise: Promise<T>): Promise<T> => {
    pendingMutations.push(promise);
    promise.finally(() => {
      const index = pendingMutations.indexOf(promise);
      if (index > -1) {
        pendingMutations.splice(index, 1);
      }
    });
    return promise;
  };

  // Buffer for incomplete JSON lines that span multiple PTY chunks
  let lineBuffer = "";

  // Callback for processing stdout chunks from PTY
  const processOutputLines = async (data: string) => {
    // User cancel / runner shutdown: stop the CLI at the next chunk.
    if (!shouldTerminate && args.isInterrupted()) {
      shouldTerminate = true;
    }
    // Append new data to buffer (handles incomplete lines from previous chunks)
    lineBuffer += data;

    // Split by newlines to get complete lines
    const lines = lineBuffer.split("\n");

    // Keep the last line in buffer (it might be incomplete)
    // All other lines are complete
    lineBuffer = lines.pop() || "";

    // Process complete lines
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue; // Skip empty lines
      }

      // Skip processing if we should terminate
      if (shouldTerminate) {
        return;
      }

      try {
        const parsed = JSON.parse(trimmedLine);

        // Handle arrays - process each item in the array separately
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            await processStreamItem(item);
            if (shouldTerminate) {
              return;
            }
          }
          continue;
        }

        // Process single item
        await processStreamItem(parsed);
      } catch {
        // Check if this is a "No conversation found" error from Claude Code
        if (
          trimmedLine.includes("No conversation found") ||
          (trimmedLine.includes("session") && trimmedLine.includes("not found"))
        ) {
          // Clear the session ID and continue as a new session
          if (newSessionId === args.activeSessionId) {
            newSessionId = undefined;
            // Update thread to clear invalid session ID
            try {
              await trackMutation(
                ctx.runMutation(
                  internal.coding_agent.cli_agent.agent_thread
                    .updateAgentThreadActiveSessionId,
                  {
                    threadId: args.threadId,
                    activeSessionId: "", // Clear invalid session
                  },
                ),
              );
            } catch (error) {
              console.error(
                "[CLIAgent] Error clearing invalid session ID:",
                error,
              );
            }
          }
          // Don't add text types to stream - they may contain sensitive data
        } else {
          // If JSON parsing failed and it's not an error message, it might be an incomplete line
          // This will be handled by the buffer on the next chunk
          // SECURITY: Do not save text types - they may contain API keys or sensitive data
          // Skip adding to assistantStream
        }
      }
    }
  };

  // Helper function to process a single stream item
  // Uses the stream parser module for parsing logic
  const processStreamItem = async (parsed: any) => {
    const result = parseStreamItem(parsed);

    // Handle result type - update session ID and usage
    if (result.sessionId && result.sessionId !== newSessionId) {
      newSessionId = result.sessionId;
      // Update thread with new session ID
      await trackMutation(
        ctx.runMutation(
          internal.coding_agent.cli_agent.agent_thread
            .updateAgentThreadActiveSessionId,
          {
            threadId: args.threadId,
            activeSessionId: newSessionId,
          },
        ),
      );
      // Save session ID to message
      await trackMutation(
        ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message
            .updateAgentMessageSessionId,
          {
            messageId: args.messageId,
            sessionId: newSessionId,
          },
        ),
      );
    }

    // Handle usage information
    if (result.usage) {
      await trackMutation(
        ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message.updateAgentMessageUsage,
          {
            messageId: args.messageId,
            totalCostUsd: result.usage.totalCostUsd,
            usageBreakdown: result.usage.usageBreakdown,
            modelUsed: `Claude Code (${selectedProvider})`,
          },
        ),
      );

      // Do not deduct platform credits for user BYOK credentials.
    }

    // Handle termination
    if (result.shouldTerminate) {
      shouldTerminate = true;
    }

    // Save stream item if shouldSave is true
    if (result.shouldSave && result.streamItem) {
      assistantStream.push(result.streamItem);
      flushAssistantStream();
    }
  };

  try {
    // Install Claude Code if not already installed (following Daytona docs pattern)
    // This ensures Claude Code is available before running the PTY command
    // Use --prefix to install to user-writable directory to avoid permission issues
    try {
      // Check if claude command exists before installing
      const checkResult = await codebase.runCommand(
        'export PATH="$HOME/.local/share/npm-global/bin:$HOME/.local/bin:$PATH" && command -v claude >/dev/null 2>&1 && echo "EXISTS" || echo "MISSING"',
        5000,
      );
      const claudeExists = checkResult.output?.trim() === "EXISTS";

      if (!claudeExists) {
        // Install to ~/.local/share/npm-global/bin (user-writable directory)
        await codebase.runCommand(
          "mkdir -p ~/.local/share/npm-global && npm install -g --prefix ~/.local/share/npm-global @anthropic-ai/claude-code",
          60000,
        ); // 60 second timeout
      }
      // SECURITY: Don't log installation output - may contain sensitive data
    } catch {
      // If installation fails, continue - Claude Code might already be installed
      // The command execution will fail later if it's actually missing
      // SECURITY: Don't log error details - may contain sensitive data
    }

    const runClaudeCommandAndProcessOutput = async (command: string) => {
      // Run via a script file rather than typing the whole command into the
      // PTY. Daytona's PTY input intermittently drops/doubles characters on
      // long commands, which can silently corrupt credential env vars/flags.
      // Uploading the command via the fs API and running `bash <path>` removes
      // that class of transit corruption while preserving streaming + exit code.
      const ptyPromise = codebase.runPtyCommandViaScript(
        command,
        processOutputLines,
        { scriptPath: `/home/daytona/.vly-claude-run-${args.messageId}.sh` },
      );

      // Terminate early once we've received final usage/result info.
      // This prevents Claude CLI sessions from hanging after work is complete.
      const terminationPromise = new Promise<{
        exitCode: number | null;
        error?: string;
      }>((resolve) => {
        const checkTermination = setInterval(() => {
          if (shouldTerminate) {
            clearInterval(checkTermination);
            codebase
              .runCommand(
                'pkill -f "claude.*--output-format stream-json" || true',
                5000,
              )
              .catch(() => {
                // Ignore kill errors; process may have already exited.
              });
            resolve({ exitCode: 0, error: undefined });
          }
        }, 100);

        ptyPromise
          .then(() => clearInterval(checkTermination))
          .catch(() => clearInterval(checkTermination));
      });

      const result = await Promise.race([ptyPromise, terminationPromise]);

      // Process any remaining buffered line (in case command ended mid-line)
      if (lineBuffer.trim()) {
        try {
          const parsed = JSON.parse(lineBuffer.trim());
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              await processStreamItem(item);
            }
          } else {
            await processStreamItem(parsed);
          }
        } catch {
          // If final buffer doesn't parse, it's likely incomplete - skip it
        }
      }

      lineBuffer = "";
      return result;
    };

    const result = await runClaudeCommandAndProcessOutput(fullCommand);

    // Ship any items not yet emitted.
    flushAssistantStream();

    // If the in-process 9-min timer fired, surface that to the workflow
    // handler so it marks the message as Paused with the canonical copy.
    if (timedOut) {
      return {
        success: false,
        error: CLI_AGENT_TIMEOUT_MESSAGE,
        timedOut: true,
        sessionId: newSessionId,
      };
    }

    // If we received final usage/result info, terminate immediately
    if (shouldTerminate) {
      return { success: true, sessionId: newSessionId };
    }

    // Check exit code
    if (result.exitCode !== null && result.exitCode !== 0) {
      throw new Error(
        `Command failed with exit code ${result.exitCode}: ${result.error || "Unknown error"}`,
      );
    }

    return { success: true, sessionId: newSessionId };
  } catch (error) {
    if (timedOut) {
      return {
        success: false,
        error: CLI_AGENT_TIMEOUT_MESSAGE,
        timedOut: true,
        sessionId: newSessionId,
      };
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Don't update message state here - let onComplete handle it
    return { success: false, error: errorMessage };
  } finally {
    clearTimeout(runTimeoutHandle);
  }
}
