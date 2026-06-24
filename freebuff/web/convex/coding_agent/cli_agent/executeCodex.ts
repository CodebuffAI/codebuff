"use node";

import { ActionCtx } from "!/_generated/server";
import { internal } from "../../_generated/api";
import { Id } from "!/_generated/dataModel";
import { DaytonaCodebase } from "../../../codebase-utils/codebase/DaytonaCodebase";
import { cliAgentSystemPrompt, knowledgePrompts } from "./system_prompt";
import { escapeShellArg } from "./shellEscape";
import {
  CODEX_DEVICE_AUTH_URL,
  CodexAuthFileStatus,
  DeviceAuthInfo,
  decryptCodexAuthPayload,
  encryptCodexAuthPayload,
  getCodexAuthEncryptionSecret,
  getCodexAuthHashSalt,
  parseCodexAuthFileStatus,
  parseDeviceAuthInfo,
} from "./codexAuth";

export interface ExecuteCodexArgs {
  projectId: Id<"project">;
  threadId: Id<"agent_thread">;
  messageId: Id<"agent_message">;
  sandboxId: string;
  activeSessionId: string | undefined;
  executingUserId: Id<"users">;
  userMessage: string;
  images: Id<"_storage">[] | undefined;
  gptAuthMethod: "oauth" | "byok";
  gptModelPreference?: string;
  openAiApiKey?: string;
}

export interface ExecuteCodexResult {
  success: boolean;
  error?: string;
  sessionId?: string;
  timedOut?: boolean;
}

// Mirrors executeFreebuff.ts FREEBUFF_RUN_TIMEOUT_MS. Aborts the Codex run
// before the 10-minute cron sweep so the action has time to clean up state.
const CODEX_RUN_TIMEOUT_MS = 9 * 60 * 1000;
const CLI_AGENT_TIMEOUT_MESSAGE =
  "Maximum time limit for a prompt reached. Engagement required to continue.";

const CODEX_MODEL_PREFERENCE_SET = new Set<string>([
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
]);

const resolveCodexModelPreference = (
  preference: string | undefined,
): string | undefined => {
  const selected = preference?.trim();
  if (selected && CODEX_MODEL_PREFERENCE_SET.has(selected)) {
    return selected;
  }
  return undefined;
};

export async function executeCodex(
  ctx: ActionCtx,
  codebase: DaytonaCodebase,
  args: ExecuteCodexArgs,
): Promise<ExecuteCodexResult> {
  const normalizeCommandForDisplay = (raw: string): string => {
    const command = raw.trim();
    const shellWrapped = command.match(/^\/bin\/(?:ba)?sh\s+-lc\s+'([\s\S]*)'$/i);
    if (!shellWrapped) {
      return command;
    }

    return shellWrapped[1]
      .replace(/'"'"'/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  };

  const normalizeByokOpenAiKey = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }
    // Common paste typo: keys accidentally start with "ssk-".
    if (trimmed.startsWith("ssk-")) {
      return trimmed.slice(1);
    }
    return trimmed;
  };

  const sanitizeCodexShellCommand = (command: string): string =>
    command
      .replaceAll("$HOME/.local//share", "$HOME/.local/share")
      .replaceAll("VVLY_CODEX_USE_STORED_CREDENTIALS", "VLY_CODEX_USE_STORED_CREDENTIALS")
      .replaceAll(".vly-convex/devv.key", ".vly-convex/dev.key")
      .replaceAll(" codex exec --yolo ---color ", " codex exec --yolo --color ");

  // Check if this is the first message (no active session ID means new thread)
  const isFirstMessage = !args.activeSessionId;

  // For first message, check if AGENTS.md exists and create it if it doesn't
  if (isFirstMessage) {
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
          cliAgentSystemPrompt(runner) +
          knowledgePrompts(runner, packageManagerName);
        await codebase.writeFile("AGENTS.md", systemPromptContent);
      }
    } catch (error) {
      // If file check/write fails, log but continue - codex will handle it
      console.error("[Codex] Error checking/creating AGENTS.md:", error);
    }
  }

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
            `Image ${idx + 1}: ${path} (read this image file to view it)`,
        )
        .join("\n");
      userMessageWithImages = `${args.userMessage}\n\nThe user has attached ${downloadedPaths.length} image(s). Read these image files to see what the user is referring to:\n${imageReferences}`;
    }
  }

  // Add Codex-specific runtime constraints to every prompt.
  // These constraints are also reinforced by AGENTS.md on first message.
  const codexRuntimeConstraints = [
    "Important constraints:",
    "- Do not run any Git or GitHub commands (for example: git, gh, github). Version control and sync are platform-managed.",
    isFirstMessage
      ? "- This is the first message in this thread. Make at least one clearly visible landing-page edit so the user can immediately see changes in preview."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const commandPrompt = `${codexRuntimeConstraints}\n\nUser request:\n${userMessageWithImages}`;

  // Escape the final prompt for shell
  const escapedPrompt = escapeShellArg(commandPrompt);

  // Build PATH matching old agent: /home/daytona/.local/bin + system PATH, plus npm-global bin
  const systemPath = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
  // PATH doesn't need escaping since we control the value
  const pathValue = `"$HOME/.local/share/npm-global/bin:/home/daytona/.local/bin:${systemPath}"`;

  // Active session ID if provided (user-controlled input)
  const activeSessionId = args.activeSessionId?.trim() || "";

  // Build the codex command
  // For new sessions: codex exec --yolo --color never --json "prompt"
  // For resuming (current CLI): codex exec resume <SESSION_ID> --yolo --json "prompt"
  // For resuming (legacy fallback): codex exec --resume <SESSION_ID> --yolo --color never --json "prompt"
  // Note: PATH must be exported at the start so codex can be found in both login and exec commands
  // Note: --json flag makes codex output JSON format for easier parsing
  type ResumeCommandMode = "subcommand" | "legacy_flag";
  const buildCodexCommand = (
    sessionId: string | undefined,
    authSource: "stored_chatgpt" | "byok_openai",
    openAiApiKey: string | undefined,
    resumeMode: ResumeCommandMode = "subcommand",
  ) => {
    const escapedSessionId = sessionId ? escapeShellArg(sessionId) : undefined;
    const selectedModel = resolveCodexModelPreference(args.gptModelPreference);
    const modelFlag = selectedModel
      ? ` --model ${escapeShellArg(selectedModel)}`
      : "";
    const codexExecCommand = (() => {
      if (!escapedSessionId) {
        return `codex exec --yolo --color never --json${modelFlag} ${escapedPrompt}`;
      }
      if (resumeMode === "legacy_flag") {
        return `codex exec --resume ${escapedSessionId} --yolo --color never --json${modelFlag} ${escapedPrompt}`;
      }
      // codex exec resume does not accept --color; keep args to the supported subset.
      return `codex exec resume ${escapedSessionId} --yolo --json${modelFlag} ${escapedPrompt}`;
    })();
    const authEnv =
      authSource === "stored_chatgpt"
        ? `OPENAI_API_KEY="" VLY_CODEX_USE_STORED_CREDENTIALS=1 VLY_CODEX_AUTH_SOURCE="${authSource}"`
        : `OPENAI_API_KEY=${escapeShellArg(openAiApiKey || "")} VLY_CODEX_AUTH_SOURCE="${authSource}"`;
    const convexDeployKeyExpr =
      '$(cat "$HOME/.vly-convex/dev.key" 2>/dev/null || cat "$HOME/.vly-coonvex/dev.key" 2>/dev/null || echo "")';
    const baseCommand = `cd /home/daytona/codebase && export PATH=${pathValue} && ${authEnv} CONVEX_DEPLOY_KEY="${convexDeployKeyExpr}" GIT_TERMINAL_PROMPT=0 ${codexExecCommand}`;
    return sanitizeCodexShellCommand(baseCommand);
  };
  let fullCommand = "";

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
  // Tracks the 9-minute in-process timeout (mirrors Freebuff). When this
  // fires we flip shouldTerminate so the existing termination promise calls
  // pkill, and we report timedOut=true so the workflow handler marks the
  // message as Paused with the canonical timeout copy.
  let timedOut = false;
  const runTimeoutHandle = setTimeout(() => {
    timedOut = true;
    shouldTerminate = true;
  }, CODEX_RUN_TIMEOUT_MS);

  // Batching mechanism to avoid concurrent update conflicts
  // Update every N items instead of on every item
  const BATCH_SIZE = 1; // Flush each item for lower perceived latency
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
  let invalidResumeSessionCleared = false;
  const rawCliOutputLines: string[] = [];
  const stripAnsi = (value: string) =>
    value
      .replace(/\x1b\[[0-9;]*m/g, "")
      .replace(/\r/g, "")
      .trim();

  const rememberRawCliLine = (line: string) => {
    const normalized = stripAnsi(line);
    if (!normalized) {
      return;
    }
    rawCliOutputLines.push(normalized);
    if (rawCliOutputLines.length > 40) {
      rawCliOutputLines.splice(0, rawCliOutputLines.length - 40);
    }
  };

  const hasStaleSessionSignal = (errorText?: string) => {
    const haystack = [...rawCliOutputLines.slice(-20), errorText || ""]
      .join("\n")
      .toLowerCase();
    return (
      haystack.includes("no conversation found") ||
      haystack.includes("conversation not found") ||
      haystack.includes("session not found") ||
      haystack.includes("unknown session") ||
      haystack.includes("invalid session") ||
      haystack.includes("thread/resume failed") ||
      haystack.includes("no rollout found for thread id")
    );
  };

  const SESSION_ID_REGEX =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const extractSessionIdCandidate = (value: unknown): string | undefined => {
    if (typeof value !== "string") {
      return undefined;
    }
    const match = stripAnsi(value).match(SESSION_ID_REGEX);
    return match?.[0];
  };

  const extractSessionIdFromEvent = (
    node: unknown,
    contextHint = "",
    depth = 0,
  ): string | undefined => {
    if (depth > 6 || node === null || node === undefined) {
      return undefined;
    }

    if (typeof node === "string") {
      const candidate = extractSessionIdCandidate(node);
      if (!candidate) {
        return undefined;
      }
      const loweredHint = contextHint.toLowerCase();
      return loweredHint.includes("session") ||
        loweredHint.includes("thread") ||
        loweredHint.includes("conversation")
        ? candidate
        : undefined;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const candidate = extractSessionIdFromEvent(
          item,
          contextHint,
          depth + 1,
        );
        if (candidate) {
          return candidate;
        }
      }
      return undefined;
    }

    if (typeof node !== "object") {
      return undefined;
    }

    const record = node as Record<string, unknown>;
    const typeHint =
      `${contextHint} ${String(record.type ?? "")} ${String(record.event ?? "")} ${String(record.kind ?? "")}`.toLowerCase();

    const directKeys = [
      "session_id",
      "sessionId",
      "thread_id",
      "threadId",
      "conversation_id",
      "conversationId",
    ];
    for (const key of directKeys) {
      const candidate = extractSessionIdCandidate(record[key]);
      if (candidate) {
        return candidate;
      }
    }

    const objectIdCandidate = extractSessionIdCandidate(record.id);
    if (
      objectIdCandidate &&
      (typeHint.includes("session") ||
        typeHint.includes("thread") ||
        typeHint.includes("conversation"))
    ) {
      return objectIdCandidate;
    }

    for (const [key, value] of Object.entries(record)) {
      const candidate = extractSessionIdFromEvent(
        value,
        `${typeHint} ${key.toLowerCase()}`,
        depth + 1,
      );
      if (candidate) {
        return candidate;
      }
    }

    return undefined;
  };

  const setDiscoveredSessionId = async (candidate: string | undefined) => {
    if (!candidate || candidate === newSessionId) {
      return;
    }
    newSessionId = candidate;
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
  };

  // Helper function to process a single codex stream item
  const processCodexStreamItem = async (parsed: any) => {
    const type = parsed.type || "";

    // Capture session ID from any known event shape as early as possible.
    const discoveredSessionId =
      extractSessionIdFromEvent(parsed, String(type)) ||
      ((typeof type === "string" &&
      (type.includes("session") ||
        type.includes("thread") ||
        type.includes("conversation"))
        ? extractSessionIdCandidate(parsed?.id) ||
          extractSessionIdCandidate(parsed?.payload?.id) ||
          extractSessionIdCandidate(parsed?.payload?.session_id)
        : undefined) as string | undefined);
    await setDiscoveredSessionId(discoveredSessionId);

    // Handle thread.started events explicitly.
    if (type === "thread.started") {
      return; // Don't save thread.started events
    }

    // Handle turn.completed - extract usage information
    if (type === "turn.completed" && parsed.usage) {
      const usage = parsed.usage;
      // Codex pricing: input: $1.75, cached input: $0.175, output: $14.00 per 1M tokens
      const inputTokens = usage.input_tokens || 0;
      const cachedInputTokens = usage.cached_input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;

      // Calculate cost using Codex pricing
      const calculatedCostUsd =
        (inputTokens / 1_000_000) * 1.75 +
        (cachedInputTokens / 1_000_000) * 0.175 +
        (outputTokens / 1_000_000) * 14.0;
      // Codex runs use user-owned credentials only; we record cost for
      // observability but never deduct platform credits.
      void calculatedCostUsd;
      const totalCostUsd = 0;

      await trackMutation(
        ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message.updateAgentMessageUsage,
          {
            messageId: args.messageId,
            totalCostUsd,
            usageBreakdown: {
              input_tokens: inputTokens,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: cachedInputTokens,
              output_tokens: outputTokens,
              other: undefined,
            },
            modelUsed: parsed.model || "codex",
          },
        ),
      );

      // Mark for termination after usage is recorded
      shouldTerminate = true;
      return; // Don't save turn.completed events
    }

    // Handle item.completed - convert to appropriate stream item types
    if (type === "item.completed" && parsed.item) {
      const item = parsed.item;
      const itemType = item.type || "";

      // Convert reasoning items to thinking type
      if (
        itemType === "reasoning" &&
        item.text &&
        typeof item.text === "string"
      ) {
        assistantStream.push({
          type: "thinking",
          title: "Thinking...",
          content: item.text,
        });
      }
      // Convert command_execution items to tool_use type
      else if (itemType === "command_execution") {
        const command = normalizeCommandForDisplay(item.command || "Unknown command");
        const rawOutput = item.aggregated_output || "";
        const output =
          rawOutput.length > 4000
            ? `${rawOutput.slice(0, 4000)}\n... [command output truncated] ...`
            : rawOutput;
        const exitCode = item.exit_code;
        const status = item.status || "";

        // Format the tool use description
        let description = command;
        if (exitCode !== null && exitCode !== undefined) {
          description += ` (exit code: ${exitCode})`;
        }
        if (status) {
          description += ` [${status}]`;
        }

        assistantStream.push({
          type: "tool_use",
          title: "Command Execution",
          status:
            status === "completed"
              ? "completed"
              : status === "failed"
                ? "error"
                : "in_progress",
          content: output,
          description,
        });
      }
      // Convert agent_message items to assistant type
      else if (
        itemType === "agent_message" &&
        item.text &&
        typeof item.text === "string"
      ) {
        assistantStream.push({
          type: "assistant",
          content: item.text,
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
            "[Codex] Error updating stream (will continue):",
            error,
          );
        }
      }
    }

    // Ignore other event types (turn.started, item.started, etc.)
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
      const normalizedLine = stripAnsi(line);
      if (!normalizedLine) {
        continue; // Skip empty lines
      }

      // Skip processing if we should terminate
      if (shouldTerminate) {
        return;
      }

      // Filter out error logs (non-JSON lines starting with timestamps like "2026-01-15T10:14:22.335606Z")
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(normalizedLine)) {
        continue; // Skip error log lines
      }

      // Check if this is a stale session/conversation error from Codex.
      if (
        /no conversation found/i.test(normalizedLine) ||
        /conversation not found/i.test(normalizedLine) ||
        /(session not found|unknown session|invalid session)/i.test(
          normalizedLine,
        )
      ) {
        // Clear the session ID and continue as a new session
        if (activeSessionId && !invalidResumeSessionCleared) {
          invalidResumeSessionCleared = true;
          newSessionId = undefined;
          // Update thread to clear invalid session ID
          try {
            await trackMutation(
              ctx.runMutation(
                internal.coding_agent.cli_agent.agent_thread
                  .updateAgentThreadActiveSessionId,
                {
                  threadId: args.threadId,
                  activeSessionId: undefined,
                },
              ),
            );
          } catch (error) {
            console.error("[Codex] Error clearing invalid session ID:", error);
          }
        }
        continue; // Skip error messages
      }

      try {
        const parsed = JSON.parse(normalizedLine);

        // Handle arrays - process each item in the array separately
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            await processCodexStreamItem(item);
            if (shouldTerminate) {
              return;
            }
          }
          continue;
        }

        // Process single item
        await processCodexStreamItem(parsed);
      } catch {
        // If JSON parsing failed, it might be plain text output or incomplete JSON
        // Skip it - it will be handled by the buffer on the next chunk if it's incomplete
        // Or it's just a non-JSON line that we should ignore
        rememberRawCliLine(normalizedLine);
      }
    }
  };

  const discoverLatestCodexSessionId = async (): Promise<
    string | undefined
  > => {
    try {
      const result = await codebase.runCommand(
        'cd /home/daytona/codebase && latest="$(find /home/daytona/.codex/sessions -type f -name \'*.jsonl\' 2>/dev/null | sort | tail -n 1)" && if [ -n "$latest" ]; then { head -n 1 "$latest" 2>/dev/null || true; echo "$latest"; }; fi',
        5000,
      );
      return extractSessionIdCandidate(result.output || "");
    } catch {
      return undefined;
    }
  };

  const maybeHydrateSessionIdFromLocalState = async () => {
    // Only use this fallback when we expected a fresh session to be created.
    if (newSessionId || (activeSessionId && !invalidResumeSessionCleared)) {
      return;
    }
    const discovered = await discoverLatestCodexSessionId();
    if (!discovered) {
      return;
    }
    await setDiscoveredSessionId(discovered);
  };

  const readCodexAuthFileStatus = async (): Promise<CodexAuthFileStatus> => {
    const authFileResult = await codebase.runCommand(
      'cd /home/daytona/codebase && [ -f "/home/daytona/.codex/auth.json" ] && cat "/home/daytona/.codex/auth.json" || true',
      5000,
    );
    return parseCodexAuthFileStatus(
      authFileResult.output || "",
      getCodexAuthHashSalt(),
    );
  };

  const restoreCodexAuthFromStoredCredentials = async (): Promise<boolean> => {
    const encryptionSecret = getCodexAuthEncryptionSecret();
    if (!encryptionSecret) {
      return false;
    }

    const user = await ctx.runQuery(internal.users.get, {
      userId: args.executingUserId,
    });
    if (
      !user ||
      user.codex_auth_mode !== "chatgpt" ||
      !user.codex_auth_encrypted_payload
    ) {
      return false;
    }

    const decrypted = decryptCodexAuthPayload(
      user.codex_auth_encrypted_payload,
      encryptionSecret,
    );
    if (!decrypted?.authPayloadJson) {
      return false;
    }

    const encodedPayload = Buffer.from(
      decrypted.authPayloadJson,
      "utf8",
    ).toString("base64");
    await codebase.runCommand(
      `cd /home/daytona/codebase && mkdir -p "/home/daytona/.codex" && printf '%s' '${encodedPayload}' | base64 -d > "/home/daytona/.codex/auth.json" && chmod 600 "/home/daytona/.codex/auth.json"`,
      5000,
    );

    const restoredStatus = await readCodexAuthFileStatus();
    return restoredStatus.isAuthenticated;
  };

  const syncCodexAuthStateForExecutingUser = async (
    status: CodexAuthFileStatus,
  ) => {
    const encryptedPayload = (() => {
      const encryptionSecret = getCodexAuthEncryptionSecret();
      if (
        !encryptionSecret ||
        !status.isAuthenticated ||
        !status.authPayloadJson
      ) {
        return undefined;
      }
      return encryptCodexAuthPayload(status.authPayloadJson, encryptionSecret);
    })();

    await ctx.runMutation(internal.users.upsertCodexAuthFingerprintInternal, {
      userId: args.executingUserId,
      codexAuthFingerprint: status.authFingerprint,
      codexAuthEncryptedPayload: encryptedPayload?.encryptedPayload,
      codexAuthEncryptionVersion: encryptedPayload?.encryptionVersion,
      codexAuthMode: status.authMode,
      codexAuthLastRefresh: status.lastRefresh,
      codexAuthUpdatedAt: Date.now(),
      codexOauthRevoked: status.isAuthenticated ? false : undefined,
    });
  };

  try {
    // Install Codex if not already installed (following Daytona docs pattern)
    // This ensures Codex is available before running the PTY command
    // Use --prefix to install to user-writable directory to avoid permission issues
    try {
      // Check if codex command exists before installing
      const checkResult = await codebase.runCommand(
        'export PATH="$HOME/.local/share/npm-global/bin:$HOME/.local/bin:$PATH" && command -v codex >/dev/null 2>&1 && echo "EXISTS" || echo "MISSING"',
        5000,
      );
      const codexExists = checkResult.output?.trim() === "EXISTS";

      if (!codexExists) {
        // Install to ~/.local/share/npm-global/bin (user-writable directory)
        await codebase.runCommand(
          "mkdir -p ~/.local/share/npm-global && npm install -g --prefix ~/.local/share/npm-global @openai/codex",
          60000,
        ); // 60 second timeout
      }
      // SECURITY: Don't log installation output - may contain sensitive data
    } catch {
      // If installation fails, continue - Codex might already be installed
      // The command execution will fail later if it's actually missing
      // SECURITY: Don't log error details - may contain sensitive data
    }

    let authSource: "stored_chatgpt" | "byok_openai" = "stored_chatgpt";
    let resolvedOpenAiApiKey: string | undefined = undefined;

    if (args.gptAuthMethod === "byok") {
      resolvedOpenAiApiKey = normalizeByokOpenAiKey(args.openAiApiKey);
      if (!resolvedOpenAiApiKey) {
        assistantStream.push({
          type: "assistant",
          content:
            "Codex BYOK is enabled but no OpenAI API key is saved. Go to Settings > AI Credentials, save your OpenAI API key, and retry.",
        });
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message.updateAgentMessageStream,
          {
            messageId: args.messageId,
            assistantStream: [...assistantStream],
          },
        );
        return { success: true, sessionId: undefined };
      }
      authSource = "byok_openai";

      if (!resolvedOpenAiApiKey.startsWith("sk-")) {
        assistantStream.push({
          type: "assistant",
          content:
            "Your OpenAI API key looks invalid (it should start with `sk-`). Go to Settings > AI Credentials, update it, and retry.",
        });
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message.updateAgentMessageStream,
          {
            messageId: args.messageId,
            assistantStream: [...assistantStream],
          },
        );
        return { success: true, sessionId: undefined };
      }
    } else {
      const executingUser = await ctx.runQuery(internal.users.get, {
        userId: args.executingUserId,
      });
      const oauthRevoked = executingUser?.codex_oauth_revoked === true;
      if (oauthRevoked) {
        await codebase.runCommand(
          `cd /home/daytona/codebase && export PATH=${pathValue} && (codex logout || true) && rm -f "/home/daytona/.codex/auth.json" "/home/daytona/.codex/vly-device-auth.log" "/home/daytona/.codex/vly-device-auth.pid"`,
          10000,
        );
      }
      const hasPersistedCodexAuth = executingUser?.codex_auth_mode === "chatgpt";

      // Prefer stored ChatGPT device auth credentials, auto-restoring from encrypted
      // cross-project storage if needed.
      let authFileStatus: CodexAuthFileStatus = oauthRevoked
        ? { hasAuthFile: false, isAuthenticated: false }
        : await readCodexAuthFileStatus();
      if (!oauthRevoked && !authFileStatus.isAuthenticated && hasPersistedCodexAuth) {
        const restored = await restoreCodexAuthFromStoredCredentials();
        if (restored) {
          authFileStatus = await readCodexAuthFileStatus();
        }
      }

      const hasStoredLogin = authFileStatus.isAuthenticated;
      if (hasStoredLogin) {
        await syncCodexAuthStateForExecutingUser(authFileStatus);
      }
      // No stored login: start device auth and instruct user.
      if (!hasStoredLogin) {
      if (oauthRevoked) {
        await ctx.runMutation(internal.users.setCodexOauthRevokedInternal, {
          userId: args.executingUserId,
          revoked: false,
        });
      }
      await codebase.runCommand(
        `cd /home/daytona/codebase && export PATH=${pathValue} && mkdir -p "/home/daytona/.codex" && if pgrep -f "codex login --device-auth" >/dev/null 2>&1; then echo "RUNNING"; else rm -f "/home/daytona/.codex/vly-device-auth.log" "/home/daytona/.codex/vly-device-auth.pid"; if command -v timeout >/dev/null 2>&1; then nohup timeout 900 codex login --device-auth > "/home/daytona/.codex/vly-device-auth.log" 2>&1 < /dev/null & else nohup codex login --device-auth > "/home/daytona/.codex/vly-device-auth.log" 2>&1 < /dev/null & fi; echo $! > "/home/daytona/.codex/vly-device-auth.pid"; echo "STARTED"; fi`,
        10000,
      );

      let deviceAuthInfo: DeviceAuthInfo = {};
      for (let attempt = 0; attempt < 15; attempt++) {
        const deviceAuthLogResult = await codebase.runCommand(
          'cd /home/daytona/codebase && [ -f "/home/daytona/.codex/vly-device-auth.log" ] && tail -n 400 "/home/daytona/.codex/vly-device-auth.log" || true',
          5000,
        );
        deviceAuthInfo = parseDeviceAuthInfo(deviceAuthLogResult.output || "");
        if (deviceAuthInfo.userCode) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const authUrl = CODEX_DEVICE_AUTH_URL;
      const oneTimeCode = deviceAuthInfo.userCode || "<code pending>";
      const loginInstructionLines = [
        "Codex device authentication required.",
        "",
        `Auth URL: ${authUrl}`,
        `One-time code: ${oneTimeCode}`,
        "",
        "Copy the URL and code above, open the link, and enter the code.",
        "This flow is safe when the domain is auth.openai.com. We are a trusted company backed by YC and VCs.",
        "Security note: device codes are a phishing target. Never share this code with anyone.",
        "After you complete sign-in, send your message again. Credentials are saved on this machine for future Codex runs.",
      ];

      assistantStream.push({
        type: "assistant",
        content: loginInstructionLines.join("\n"),
      });
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message.updateAgentMessageStream,
        {
          messageId: args.messageId,
          assistantStream: [...assistantStream],
        },
      );

      return { success: true, sessionId: undefined };
      }
    }

    fullCommand = buildCodexCommand(
      activeSessionId || undefined,
      authSource,
      resolvedOpenAiApiKey,
      "subcommand",
    );
    // Skipping the pre-run filesystem scan for the latest session file:
    // the streamed Codex events expose the session ID directly, and we
    // still hydrate from the local state after the run as a fallback.

    const runCodexCommandAndProcessOutput = async (command: string) => {
      // Run command via PTY following Daytona documentation pattern
      // Note: Working directory is set to /home/daytona/codebase via codebase.runPtyCommand
      const ptyPromise = codebase.runPtyCommand(command, processOutputLines);

      // Terminate early once Codex emits final turn usage.
      // This prevents the workflow from waiting on lingering CLI sessions.
      const terminationPromise = new Promise<{
        exitCode: number | null;
        error?: string;
      }>((resolve) => {
        const checkTermination = setInterval(() => {
          if (shouldTerminate) {
            clearInterval(checkTermination);
            codebase
              .runCommand('pkill -f "codex exec" || true', 5000)
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
      const finalLine = stripAnsi(lineBuffer);
      if (finalLine) {
        try {
          const parsed = JSON.parse(finalLine);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              await processCodexStreamItem(item);
            }
          } else {
            await processCodexStreamItem(parsed);
          }
        } catch {
          // If final buffer doesn't parse, it's likely incomplete - skip it
          rememberRawCliLine(finalLine);
        }
      }
      lineBuffer = "";
      return result;
    };

    let result = await runCodexCommandAndProcessOutput(fullCommand);

    // Some Codex CLI runs emit a new thread id then exit non-zero before the
    // first turn completes. Retry once by resuming that fresh session.
    if (
      !shouldTerminate &&
      !activeSessionId &&
      newSessionId &&
      result.exitCode !== null &&
      result.exitCode !== 0
    ) {
      fullCommand = buildCodexCommand(
        newSessionId,
        authSource,
        resolvedOpenAiApiKey,
        "subcommand",
      );
      result = await runCodexCommandAndProcessOutput(fullCommand);
    }

    // Resume compatibility / stale-session fallback:
    // 1) Try current syntax first: codex exec resume <SESSION_ID> ...
    // 2) If that fails with usage/arg parsing (exit 2), retry legacy --resume syntax once.
    // 3) Clear session and retry without resume only when stale-session signals are detected.
    if (
      !shouldTerminate &&
      activeSessionId &&
      result.exitCode !== null &&
      result.exitCode !== 0
    ) {
      if (result.exitCode === 2) {
        fullCommand = buildCodexCommand(
          activeSessionId,
          authSource,
          resolvedOpenAiApiKey,
          "legacy_flag",
        );
        result = await runCodexCommandAndProcessOutput(fullCommand);
      }

      const shouldRetryWithoutResume =
        !shouldTerminate &&
        result.exitCode !== null &&
        result.exitCode !== 0 &&
        (invalidResumeSessionCleared ||
          result.exitCode === 2 ||
          hasStaleSessionSignal(result.error));

      if (shouldRetryWithoutResume) {
        try {
          await ctx.runMutation(
            internal.coding_agent.cli_agent.agent_thread
              .updateAgentThreadActiveSessionId,
            {
              threadId: args.threadId,
              activeSessionId: undefined,
            },
          );
        } catch (error) {
          console.error("[Codex] Failed to clear stale session ID:", error);
        }

        invalidResumeSessionCleared = true;
        fullCommand = buildCodexCommand(
          undefined,
          authSource,
          resolvedOpenAiApiKey,
          "subcommand",
        );
        result = await runCodexCommandAndProcessOutput(fullCommand);
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

    await maybeHydrateSessionIdFromLocalState();

    // If the in-process 9-min timer fired, surface that to the workflow
    // handler so it marks the message as Paused with the canonical copy.
    if (timedOut) {
      return {
        success: false,
        error: CLI_AGENT_TIMEOUT_MESSAGE,
        timedOut: true,
      };
    }

    // If we received final turn usage, terminate immediately
    if (shouldTerminate) {
      return { success: true, sessionId: newSessionId };
    }

    // Check exit code
    if (result.exitCode !== null && result.exitCode !== 0) {
      const errorTail = rawCliOutputLines.slice(-6).join(" | ");
      throw new Error(
        `Command failed with exit code ${result.exitCode}: ${result.error || "Unknown error"}${errorTail ? `. CLI output: ${errorTail}` : ""}`,
      );
    }

    return { success: true, sessionId: newSessionId };
  } catch (error) {
    if (timedOut) {
      return {
        success: false,
        error: CLI_AGENT_TIMEOUT_MESSAGE,
        timedOut: true,
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
