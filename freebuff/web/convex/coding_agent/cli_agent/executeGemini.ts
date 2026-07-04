"use node";

import { ActionCtx } from "!/_generated/server";
import { internal } from "../../_generated/api";
import { Id } from "!/_generated/dataModel";
import { DaytonaCodebase } from "../../../codebase-utils/codebase/DaytonaCodebase";
import { cliAgentSystemPrompt, knowledgePrompts } from "./system_prompt";
import { escapeShellArg, escapeShellArgSingleQuotes } from "./shellEscape";
import { refreshConnectedRepoOrigin } from "./gitRemoteAuth";

export interface ExecuteGeminiArgs {
  projectId: Id<"project">;
  threadId: Id<"agent_thread">;
  messageId: Id<"agent_message">;
  sandboxId: string;
  activeSessionId: string | undefined;
  executingUserId: Id<"users">;
  userMessage: string;
  images: Id<"_storage">[] | undefined;
}

export interface ExecuteGeminiResult {
  success: boolean;
  error?: string;
  sessionId?: string;
}

export async function executeGemini(
  ctx: ActionCtx,
  codebase: DaytonaCodebase,
  args: ExecuteGeminiArgs,
): Promise<ExecuteGeminiResult> {
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

  // Get Google API key
  const googleApiKey = process.env.GOOGLE_API_KEY;
  if (!googleApiKey) {
    throw new Error("GOOGLE_API_KEY environment variable is not set");
  }

  // Check if this is the first message (no active session ID means new thread)
  const isFirstMessage = !args.activeSessionId;

  // Template projects get generated Gemini context files. Cloud connected repos
  // should receive only the user's prompt and repo-local instructions.
  if (isFirstMessage && !isConnectedRepoProject) {
    try {
      const agentsMdExists =
        await codebase.checkIfFileExistsInCodebase("AGENTS.md");
      if (!agentsMdExists) {
        // Create AGENTS.md with the system prompt content
        // Get package manager and runner for system prompt interpolation
        const pm = codebase.getPackageManager();
        const runner = pm.runner(); // "npx" or "bunx"
        const packageManagerName = codebase.getPackageManagerName();
        const systemPromptContent =
          cliAgentSystemPrompt(runner, { allowGit: isConnectedRepoProject }) +
          knowledgePrompts(runner, packageManagerName);
        await codebase.writeFile("AGENTS.md", systemPromptContent);
      }

      // Check if .gemini/settings.json exists
      const geminiSettingsExists = await codebase.checkIfFileExistsInCodebase(
        ".gemini/settings.json",
      );
      if (!geminiSettingsExists) {
        // Create .gemini/settings.json with the specified content
        const settingsContent = JSON.stringify(
          {
            context: {
              fileName: ["AGENTS.md", "CONTEXT.md", "GEMINI.md"],
            },
          },
          null,
          2,
        );
        await codebase.writeFile(".gemini/settings.json", settingsContent);
      }
    } catch (error) {
      // If file check/write fails, log but continue - gemini will handle it
      console.error(
        "[Gemini] Error checking/creating AGENTS.md or .gemini/settings.json:",
        error,
      );
    }
  }

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

  // Build the command prompt - do not append system prompt
  const commandPrompt = userMessageWithImages;

  // Escape the final prompt for shell
  const escapedPrompt = escapeShellArg(commandPrompt);

  // Escape Google API key for environment variable
  const escapedApiKey = escapeShellArgSingleQuotes(googleApiKey);

  // Build PATH matching old agent: /home/daytona/.local/bin + system PATH, plus npm-global bin
  const systemPath = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
  // PATH doesn't need escaping since we control the value
  const pathValue = `"$HOME/.local/share/npm-global/bin:/home/daytona/.local/bin:${systemPath}"`;

  // Get Google Cloud project and location from environment or use defaults
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || "crack-458606";
  const googleCloudLocation =
    process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

  // Build the gemini command. For connected-repo cloud projects, do not inject
  // Convex deploy credentials.
  const convexEnvPrefix = shouldInjectConvexDeployKey
    ? 'CONVEX_DEPLOY_KEY="$(cat $HOME/.vly-convex/dev.key 2>/dev/null || echo "")" '
    : "";
  const fullCommand = `cd /home/daytona/codebase && unset GOOGLE_API_KEY GEMINI_API_KEY && GOOGLE_API_KEY=${escapedApiKey} GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT="${googleCloudProject}" GOOGLE_CLOUD_LOCATION="${googleCloudLocation}" ${convexEnvPrefix}GIT_TERMINAL_PROMPT=0 PATH=${pathValue} gemini -p ${escapedPrompt} --output-format stream-json --yolo`;

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

  // Track tool_use items by tool_id to update them when tool_result arrives
  const toolUseMap = new Map<
    string,
    { index: number; description: string; toolName: string }
  >();

  // Track the last assistant message index for delta accumulation
  let lastAssistantMessageIndex: number | null = null;

  // Helper function to process a single gemini stream item
  const processGeminiStreamItem = async (parsed: any) => {
    const type = parsed.type || "";

    // Handle init - extract session_id
    if (type === "init" && parsed.session_id) {
      if (parsed.session_id !== newSessionId) {
        newSessionId = parsed.session_id;
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
      return; // Don't save init events
    }

    // Handle message - only process assistant messages, skip user messages
    if (type === "message") {
      const role = parsed.role || "";
      if (role === "assistant" && parsed.content) {
        // Handle delta messages (streaming content)
        const content =
          typeof parsed.content === "string" ? parsed.content : "";
        if (content) {
          // Check if this is a delta (streaming) or complete message
          const isDelta = parsed.delta === true;

          if (isDelta && lastAssistantMessageIndex !== null) {
            // Accumulate delta content into the last assistant message
            const lastMessage = assistantStream[lastAssistantMessageIndex];
            if (lastMessage && lastMessage.type === "assistant") {
              lastMessage.content += content;
            } else {
              // Last message is not an assistant message, create new one
              assistantStream.push({
                type: "assistant",
                content: content,
              });
              lastAssistantMessageIndex = assistantStream.length - 1;
            }
          } else {
            // Non-delta message or first message - create new assistant message
            assistantStream.push({
              type: "assistant",
              content: content,
            });
            lastAssistantMessageIndex = assistantStream.length - 1;
          }

          // Batch updates
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
                "[Gemini] Error updating stream (will continue):",
                error,
              );
            }
          }
        }
      }
      // Skip user messages - they're just echoes of what we sent
      return;
    }

    // Handle tool_use - create tool_use item
    if (type === "tool_use") {
      const toolId = parsed.tool_id || "";
      const toolName = parsed.tool_name || "Unknown Tool";
      const parameters = parsed.parameters || {};

      // Format description based on tool name and parameters
      let description = toolName;

      if (toolName === "run_shell_command") {
        // For shell commands, use the command or description
        if (parameters.command) {
          description = parameters.command;
        } else if (parameters.description) {
          description = parameters.description;
        }
      } else if (toolName === "Bash" && parameters.command) {
        // Legacy Bash tool support
        description = parameters.command;
      } else if (toolName === "read_file" && parameters.file_path) {
        description = `read_file: ${parameters.file_path}`;
      } else if (toolName === "write_file" && parameters.file_path) {
        description = `write_file: ${parameters.file_path}`;
      } else if (toolName === "replace" && parameters.file_path) {
        // For replace, show file path and optionally instruction
        description = parameters.instruction
          ? `replace: ${parameters.file_path} - ${parameters.instruction}`
          : `replace: ${parameters.file_path}`;
      } else if (toolName === "list_directory" && parameters.dir_path) {
        description = `list_directory: ${parameters.dir_path}`;
      } else if (toolName === "list_directory" && parameters.path) {
        description = `list_directory: ${parameters.path}`;
      } else if (Object.keys(parameters).length > 0) {
        // Fallback: format with key parameters
        const keyParams: string[] = [];
        if (parameters.file_path)
          keyParams.push(`file: ${parameters.file_path}`);
        if (parameters.dir_path) keyParams.push(`dir: ${parameters.dir_path}`);
        if (parameters.path) keyParams.push(`path: ${parameters.path}`);
        if (parameters.command) keyParams.push(`cmd: ${parameters.command}`);
        if (keyParams.length > 0) {
          description = `${toolName}: ${keyParams.join(", ")}`;
        }
      }

      // Create tool_use item
      const toolUseItem = {
        type: "tool_use" as const,
        title: "Command Execution",
        status: "in_progress" as const,
        content: "",
        description,
      };

      assistantStream.push(toolUseItem);
      const toolUseIndex = assistantStream.length - 1;

      // Track this tool_use by tool_id for when tool_result arrives
      if (toolId) {
        toolUseMap.set(toolId, {
          index: toolUseIndex,
          description,
          toolName,
        });
      }

      // Batch updates
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
            "[Gemini] Error updating stream (will continue):",
            error,
          );
        }
      }
      return;
    }

    // Handle tool_result - update existing tool_use item
    if (type === "tool_result") {
      const toolId = parsed.tool_id || "";
      const status = parsed.status || "";
      // Handle both cases: output may be present or missing
      const output =
        parsed.output !== undefined ? String(parsed.output || "") : "";

      // Find the corresponding tool_use item
      const toolUseInfo = toolId ? toolUseMap.get(toolId) : undefined;

      if (toolUseInfo) {
        // Update the existing tool_use item
        const toolUseItem = assistantStream[toolUseInfo.index];
        if (toolUseItem && toolUseItem.type === "tool_use") {
          // Update the tool_use item with output content
          toolUseItem.content = output;

          // Set status based on result
          toolUseItem.status =
            status === "success" || status === "completed"
              ? "completed"
              : status === "error" || status === "failed"
                ? "error"
                : "in_progress";

          // Update description with status if it's an error
          if (status && status !== "success" && status !== "completed") {
            toolUseItem.description = `${toolUseInfo.description} [${status}]`;
          }

          // Ensure title still shows the tool name
          toolUseItem.title = toolUseInfo.toolName;

          // Remove from map since we've processed it
          toolUseMap.delete(toolId);

          // Immediately update stream when tool_result arrives (don't wait for batch)
          // This ensures tool results are saved correctly
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
              "[Gemini] Error updating stream after tool_result (will continue):",
              error,
            );
          }
        }
      } else {
        // No matching tool_use found, create a new tool_result item
        // This shouldn't normally happen, but handle gracefully
        assistantStream.push({
          type: "tool_use",
          title: "Tool Result",
          status:
            status === "success" || status === "completed"
              ? "completed"
              : status === "error" || status === "failed"
                ? "error"
                : "in_progress",
          content: output,
          description: `Tool Result${toolId ? ` (${toolId})` : ""}`,
        });

        // Batch updates for orphaned tool results
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
              "[Gemini] Error updating stream (will continue):",
              error,
            );
          }
        }
      }
      return;
    }

    // Handle result - extract usage information and terminate
    if (type === "result" && parsed.stats) {
      const stats = parsed.stats;
      const inputTokens = stats.input_tokens || 0;
      const outputTokens = stats.output_tokens || 0;
      const totalTokens = stats.total_tokens || inputTokens + outputTokens;

      // Calculate cost using Gemini pricing
      // Input: $2 per 1M tokens
      // Output: $12 per 1M tokens
      const totalCostUsd =
        (inputTokens / 1_000_000) * 2.0 + // Input: $2 per 1M tokens
        (outputTokens / 1_000_000) * 12.0; // Output: $12 per 1M tokens

      // Build other stats as JSON string if we have extra info
      const otherStats = {
        total_tokens: totalTokens,
        duration_ms: stats.duration_ms,
        tool_calls: stats.tool_calls,
      };
      const otherString =
        stats.duration_ms || stats.tool_calls
          ? JSON.stringify(otherStats)
          : undefined;

      await trackMutation(
        ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message.updateAgentMessageUsage,
          {
            messageId: args.messageId,
            totalCostUsd,
            usageBreakdown: {
              input_tokens: inputTokens,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0, // Gemini doesn't report cached tokens in stats
              output_tokens: outputTokens,
              other: otherString,
            },
            modelUsed: parsed.model || undefined,
          },
        ),
      );

      // Deduct credits from user balance ($1 = 1M credits)
      if (totalCostUsd > 0) {
        await ctx.runAction(
          internal.coding_agent.cli_agent.creditTracking.trackCliAgentUsage,
          {
            projectId: args.projectId,
            totalCostUsd,
            executingUserId: args.executingUserId,
            agentType: "Gemini CLI",
            messageId: args.messageId,
          },
        );
      }

      // Mark for termination after usage is recorded
      // The Promise.race in the main execution will detect this and kill the process
      shouldTerminate = true;

      return; // Don't save result events
    }

    // Ignore other event types (user messages are handled above and skipped)
  };

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

      // Filter out error logs (non-JSON lines starting with timestamps like "2026-01-15T10:14:22.335606Z")
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmedLine)) {
        continue; // Skip error log lines
      }

      // Check if this is a "No conversation found" error from Gemini
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
            console.error("[Gemini] Error clearing invalid session ID:", error);
          }
        }
        continue; // Skip error messages
      }

      try {
        const parsed = JSON.parse(trimmedLine);

        // Handle arrays - process each item in the array separately
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            await processGeminiStreamItem(item);
            if (shouldTerminate) {
              return;
            }
          }
          continue;
        }

        // Process single item
        await processGeminiStreamItem(parsed);
      } catch {
        // If JSON parsing failed, it might be plain text output or incomplete JSON
        // Skip it - it will be handled by the buffer on the next chunk if it's incomplete
        // Or it's just a non-JSON line that we should ignore
      }
    }
  };

  try {
    // Install @google/gemini-cli if not already installed (following Daytona docs pattern)
    // This ensures Gemini CLI is available before running the PTY command
    // Use --prefix to install to user-writable directory to avoid permission issues
    try {
      // Check if gemini command exists before installing
      const checkResult = await codebase.runCommand(
        'export PATH="$HOME/.local/share/npm-global/bin:$HOME/.local/bin:$PATH" && command -v gemini >/dev/null 2>&1 && echo "EXISTS" || echo "MISSING"',
        5000,
      );
      const geminiExists = checkResult.output?.trim() === "EXISTS";

      if (!geminiExists) {
        // Install to ~/.local/share/npm-global/bin (user-writable directory)
        await codebase.runCommand(
          "mkdir -p ~/.local/share/npm-global && npm install -g --prefix ~/.local/share/npm-global @google/gemini-cli",
          60000,
        ); // 60 second timeout
      }
      // SECURITY: Don't log installation output - may contain sensitive data
    } catch {
      // If installation fails, continue - Gemini CLI might already be installed
      // The command execution will fail later if it's actually missing
      // SECURITY: Don't log error details - may contain sensitive data
    }

    // Run via a script file rather than typing the whole command into the PTY.
    // Daytona's PTY input intermittently drops/doubles characters on long
    // commands, which can silently corrupt credential env vars/flags. Uploading
    // the command via the fs API and running `bash <path>` removes that class
    // of transit corruption while preserving output streaming + exit code.
    const ptyPromise = codebase.runPtyCommandViaScript(
      fullCommand,
      processOutputLines,
      { scriptPath: `/home/daytona/.vly-gemini-run-${args.messageId}.sh` },
    );

    // Create a promise that resolves when we should terminate
    const terminationPromise = new Promise<{ exitCode: number | null }>(
      (resolve) => {
        // Check periodically if we should terminate
        const checkTermination = setInterval(() => {
          if (shouldTerminate) {
            clearInterval(checkTermination);
            // Try to kill the gemini process
            codebase
              .runCommand(
                'pkill -f "gemini -p" || true', // Kill gemini processes, ignore if not found
                5000,
              )
              .catch(() => {
                // Ignore errors - process may have already terminated
              });
            resolve({ exitCode: 0 });
          }
        }, 100); // Check every 100ms

        // Clear interval if PTY completes first
        ptyPromise
          .then(() => clearInterval(checkTermination))
          .catch(() => clearInterval(checkTermination));
      },
    );

    // Race between PTY completion and termination signal
    const result = await Promise.race([ptyPromise, terminationPromise]);

    // Process any remaining buffered line (in case command ended mid-line)
    if (lineBuffer.trim()) {
      try {
        const parsed = JSON.parse(lineBuffer.trim());
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            await processGeminiStreamItem(item);
          }
        } else {
          await processGeminiStreamItem(parsed);
        }
      } catch {
        // If final buffer doesn't parse, it's likely incomplete - skip it
      }
    }

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

    // If we received result type with session ID and usage, terminate immediately
    if (shouldTerminate) {
      return { success: true, sessionId: newSessionId };
    }

    // Check exit code
    if (result.exitCode !== null && result.exitCode !== 0) {
      const errorMsg =
        "error" in result && typeof result.error === "string"
          ? result.error
          : "Unknown error";
      throw new Error(
        `Command failed with exit code ${result.exitCode}: ${errorMsg}`,
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
