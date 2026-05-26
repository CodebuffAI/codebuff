"use node";

import { ActionCtx } from "!/_generated/server";
import { internal } from "../../_generated/api";
import { Id } from "!/_generated/dataModel";
import { DaytonaCodebase } from "../../../codebase-utils/codebase/DaytonaCodebase";
import { cliAgentSystemPrompt, knowledgePrompts } from "./system_prompt";
import { escapeShellArg } from "./shellEscape";
import { processStreamItem as parseStreamItem } from "./streamParser";

export interface ExecuteClaudeCodeArgs {
  projectId: Id<"project">;
  threadId: Id<"agent_thread">;
  messageId: Id<"agent_message">;
  sandboxId: string;
  activeSessionId: string | undefined;
  executingUserId: Id<"users">;
  userMessage: string;
  images: Id<"_storage">[] | undefined;
}

export interface ExecuteClaudeCodeResult {
  success: boolean;
  error?: string;
  sessionId?: string;
}

export async function executeClaudeCode(
  ctx: ActionCtx,
  codebase: DaytonaCodebase,
  args: ExecuteClaudeCodeArgs,
): Promise<ExecuteClaudeCodeResult> {
  // Using AWS Bedrock instead of Anthropic API
  const awsBearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!awsBearerToken) {
    throw new Error("AWS_BEARER_TOKEN_BEDROCK environment variable is not set");
  }

  // Escape session ID if provided (user-controlled input)
  const escapedSessionId = args.activeSessionId?.trim() || "";
  const resumeFlag = escapedSessionId
    ? ` --resume ${escapeShellArg(escapedSessionId)} --fork-session`
    : "";

  // Get image URLs if images are provided and append them to the user message
  let userMessageWithImages = args.userMessage;
  if (args.images && args.images.length > 0) {
    const imageUrls: string[] = [];
    for (const imageId of args.images) {
      const imageUrl = await ctx.storage.getUrl(imageId);
      if (imageUrl) {
        imageUrls.push(imageUrl);
      }
    }

    // Append image URLs to the user message
    if (imageUrls.length > 0) {
      const imageReferences = imageUrls
        .map((url, idx) => `[Image ${idx + 1}: ${url}]`)
        .join("\n");
      userMessageWithImages = `${args.userMessage}\n\nUser has uploaded ${imageUrls.length} image(s):\n${imageReferences}`;
    }
  }

  // Escape user message/prompt (user-controlled input, now includes image URLs)
  const escapedPrompt = escapeShellArg(userMessageWithImages);

  // Get package manager and runner for system prompt interpolation
  const pm = codebase.getPackageManager();
  const runner = pm.runner(); // "npx" or "bunx"
  const packageManagerName = codebase.getPackageManagerName();

  // Escape system prompt for --append-system-prompt flag
  const escapedSystemPrompt = escapeShellArg(
    cliAgentSystemPrompt(runner) + knowledgePrompts(runner, packageManagerName),
  );

  // Build the base Claude Code command with escaped inputs
  // Add --tools "default" and --append-system-prompt flags
  const commandParts = [
    "claude",
    "--dangerously-skip-permissions",
    resumeFlag.trim(),
    "-p",
    escapedPrompt,
    "--append-system-prompt",
    escapedSystemPrompt,
    "--tools",
    '"default"',
    "--output-format",
    "stream-json",
    "--verbose",
  ].filter((part) => part.length > 0); // Remove empty parts (e.g., if resumeFlag is empty)

  const command = commandParts.join(" ");

  // Escape AWS bearer token for environment variable
  const escapedAwsToken = escapeShellArg(awsBearerToken);

  // Build PATH matching old agent: /home/daytona/.local/bin + system PATH, plus npm-global bin
  const systemPath = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
  // PATH doesn't need escaping since we control the value
  const pathValue = `"$HOME/.local/share/npm-global/bin:/home/daytona/.local/bin:${systemPath}"`;

  // Build env vars array (matching old agent's executeCommand env vars + AWS Bedrock config)
  // Use command substitution to get deploy key inline (faster than separate command)
  // $(cat ... || echo "") will return empty string if file doesn't exist
  const envVars = [
    `AWS_BEARER_TOKEN_BEDROCK=${escapedAwsToken}`,
    `CLAUDE_CODE_USE_BEDROCK=1`,
    //`CLAUDE_CODE_MAX_OUTPUT_TOKENS=4096`,
    `ANTHROPIC_DEFAULT_MODEL=us.anthropic.claude-sonnet-4-6`,
    //`MAX_THINKING_TOKENS=1024`,
    `AWS_REGION=us-east-1`,
    `CONVEX_DEPLOY_KEY=$(cat $HOME/.vly-convex/dev.key 2>/dev/null || echo "")`,
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

  // Batching mechanism to avoid concurrent update conflicts
  // Update every N items instead of on every item
  const BATCH_SIZE = 2; // Update every 2 items
  let lastUpdateCount = 0;

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
            modelUsed: undefined, // Model is not in result schema, can be added later if needed
          },
        ),
      );

      // Deduct credits from user balance ($1 = 1M credits)
      if (result.usage.totalCostUsd && result.usage.totalCostUsd > 0) {
        await ctx.runAction(
          internal.coding_agent.cli_agent.creditTracking.trackCliAgentUsage,
          {
            projectId: args.projectId,
            totalCostUsd: result.usage.totalCostUsd,
            executingUserId: args.executingUserId,
            agentType: "Claude Code",
            messageId: args.messageId,
          },
        );
      }
    }

    // Handle termination
    if (result.shouldTerminate) {
      shouldTerminate = true;
    }

    // Save stream item if shouldSave is true
    if (result.shouldSave && result.streamItem) {
      assistantStream.push(result.streamItem);

      // Batch updates to avoid concurrent update conflicts
      // Only update every BATCH_SIZE items
      if (assistantStream.length - lastUpdateCount >= BATCH_SIZE) {
        try {
          await trackMutation(
            ctx.runMutation(
              internal.coding_agent.cli_agent.agent_message
                .updateAgentMessageStream,
              {
                messageId: args.messageId,
                assistantStream: [...assistantStream],
              },
            ),
          );
          lastUpdateCount = assistantStream.length;
        } catch (error) {
          console.error(
            "[CLIAgent] Error updating stream (will continue):",
            error,
          );
          // Continue - will retry on next batch
        }
      }
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
      // Run command via PTY following Daytona documentation pattern
      // Note: Working directory is set to /home/daytona/codebase via codebase.runPtyCommand
      const ptyPromise = codebase.runPtyCommand(command, processOutputLines);

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

    // Send final update with all streamed data (if any pending)
    if (assistantStream.length > lastUpdateCount) {
      try {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message
            .updateAgentMessageStream,
          {
            messageId: args.messageId,
            assistantStream: [...assistantStream],
          },
        );
      } catch {
        // SECURITY: Don't log error details - may contain sensitive data
        // Non-fatal - stream data is already captured in assistantStream array
      }
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Don't update message state here - let onComplete handle it
    return { success: false, error: errorMessage };
  }
}
