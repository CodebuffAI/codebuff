"use node";

import { action, internalAction } from "!/_generated/server";
import { internal } from "!/_generated/api";
import { v } from "convex/values";
import { initializeCodebase } from "../../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../../codebase-utils/codebase/DaytonaCodebase";
import { executeClaudeCode } from "./executeClaudeCode";
import { executeCodex } from "./executeCodex";
import { executeFreebuff } from "./executeFreebuff";
import { executeGemini } from "./executeGemini";
import { getAuthUser } from "../../users";
import { getVerifiedAccessProject } from "../../project";
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

const GEMINI_CLI_TEMPORARILY_DISABLED = true;
const GEMINI_CLI_MAINTENANCE_MESSAGE = "gemini is currently under maintence.";

// Execute the CLI agent command in the Daytona environment
export const execute = internalAction({
  args: {
    projectId: v.id("project"),
    threadId: v.id("agent_thread"),
    messageId: v.id("agent_message"),
    agentType: v.union(
      v.literal("Claude Code"),
      v.literal("Gemini CLI"),
      v.literal("Codex"),
      v.literal("Freebuff"),
    ),
    sandboxId: v.string(), // Project sandbox_id (format: "daytona:xxx")
    activeSessionId: v.optional(v.string()), // Active session ID from thread (undefined for new threads)
    executingUserId: v.id("users"),
    userMessage: v.string(), // User message content
    images: v.optional(v.array(v.id("_storage"))), // Image storage IDs
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Extract Daytona sandbox ID from sandbox_id (format: "daytona:xxx")
    if (!args.sandboxId || !args.sandboxId.startsWith("daytona:")) {
      throw new Error("Project does not have a Daytona sandbox");
    }

    const daytonaSandboxId = args.sandboxId.slice("daytona:".length);

    // Initialize and resume Daytona codebase
    const codebase = await initializeCodebase(`daytona:${daytonaSandboxId}`);

    // Ensure codebase is DaytonaCodebase
    if (!(codebase instanceof DaytonaCodebase)) {
      throw new Error(
        "Codebase must be DaytonaCodebase for CLI agent execution",
      );
    }

    // Route to appropriate execution function based on agent type
    if (args.agentType === "Freebuff") {
      return await executeFreebuff(ctx, codebase, {
        projectId: args.projectId,
        threadId: args.threadId,
        messageId: args.messageId,
        sandboxId: args.sandboxId,
        activeSessionId: args.activeSessionId,
        executingUserId: args.executingUserId,
        userMessage: args.userMessage,
        images: args.images,
      });
    } else if (args.agentType === "Claude Code") {
      return await executeClaudeCode(ctx, codebase, {
        projectId: args.projectId,
        threadId: args.threadId,
        messageId: args.messageId,
        sandboxId: args.sandboxId,
        activeSessionId: args.activeSessionId,
        executingUserId: args.executingUserId,
        userMessage: args.userMessage,
        images: args.images,
      });
    } else if (args.agentType === "Codex") {
      return await executeCodex(ctx, codebase, {
        projectId: args.projectId,
        threadId: args.threadId,
        messageId: args.messageId,
        sandboxId: args.sandboxId,
        activeSessionId: args.activeSessionId,
        executingUserId: args.executingUserId,
        userMessage: args.userMessage,
        images: args.images,
      });
    } else if (args.agentType === "Gemini CLI") {
      if (GEMINI_CLI_TEMPORARILY_DISABLED) {
        return {
          success: false,
          error: GEMINI_CLI_MAINTENANCE_MESSAGE,
        };
      }
      return await executeGemini(ctx, codebase, {
        projectId: args.projectId,
        threadId: args.threadId,
        messageId: args.messageId,
        sandboxId: args.sandboxId,
        activeSessionId: args.activeSessionId,
        executingUserId: args.executingUserId,
        userMessage: args.userMessage,
        images: args.images,
      });
    } else {
      throw new Error(`Unknown agent type: ${args.agentType}`);
    }
  },
});

const codexPathValue = () => {
  const systemPath = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";
  return `"$HOME/.local/share/npm-global/bin:/home/daytona/.local/bin:${systemPath}"`;
};

const CODEX_AUTH_STATUS_CACHE_TTL_MS = 15 * 1000;
const codexAuthStatusCache = new Map<
  string,
  {
    cachedAt: number;
    status: CodexAuthFileStatus;
  }
>();

const getCodexAuthCacheKey = (userId: string, projectId: string) =>
  `${userId}:${projectId}`;

const resolveAuthorizedDaytonaProject = async (
  ctx: any,
  projectSemanticIdentifier: string,
) => {
  const user = await getAuthUser(ctx);
  if (!user) {
    throw new Error("Not authenticated");
  }

  const project = await getVerifiedAccessProject(
    ctx,
    user._id,
    projectSemanticIdentifier,
  );
  if (!project) {
    throw new Error("Project not found or access denied");
  }

  if (!project.sandbox_id || !project.sandbox_id.startsWith("daytona:")) {
    throw new Error("Project does not have a Daytona sandbox");
  }

  return { user, project };
};

const resolveAuthorizedDaytonaCodebase = async (
  ctx: any,
  projectSemanticIdentifier: string,
): Promise<{ codebase: DaytonaCodebase; user: any; project: any }> => {
  const { user, project } = await resolveAuthorizedDaytonaProject(
    ctx,
    projectSemanticIdentifier,
  );

  const daytonaSandboxId = project.sandbox_id.slice("daytona:".length);
  const codebase = await initializeCodebase(
    `daytona:${daytonaSandboxId}`,
    project.packageManager,
  );
  if (!(codebase instanceof DaytonaCodebase)) {
    throw new Error("Codebase must be DaytonaCodebase for Codex auth");
  }

  return { codebase, user, project };
};

const ensureCodexInstalled = async (codebase: DaytonaCodebase) => {
  try {
    const checkResult = await codebase.runCommand(
      'export PATH="$HOME/.local/share/npm-global/bin:$HOME/.local/bin:$PATH" && command -v codex >/dev/null 2>&1 && echo "EXISTS" || echo "MISSING"',
      5000,
    );
    if (checkResult.output?.trim() !== "EXISTS") {
      await codebase.runCommand(
        "mkdir -p ~/.local/share/npm-global && npm install -g --prefix ~/.local/share/npm-global @openai/codex",
        60000,
      );
    }
  } catch {
    // Continue; subsequent commands will return useful errors if codex is missing.
  }
};

const readCodexAuthFileStatus = async (
  codebase: DaytonaCodebase,
): Promise<CodexAuthFileStatus> => {
  const authFileResult = await codebase.runCommand(
    'cd /home/daytona/codebase && [ -f "/home/daytona/.codex/auth.json" ] && cat "/home/daytona/.codex/auth.json" || true',
    5000,
  );
  return parseCodexAuthFileStatus(
    authFileResult.output || "",
    getCodexAuthHashSalt(),
  );
};

const restoreCodexAuthFromStoredCredentials = async (
  ctx: any,
  codebase: DaytonaCodebase,
  userId: any,
): Promise<boolean> => {
  const encryptionSecret = getCodexAuthEncryptionSecret();
  if (!encryptionSecret) {
    return false;
  }

  const user = await ctx.runQuery(internal.users.get, { userId });
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

  const restoredStatus = await readCodexAuthFileStatus(codebase);
  return restoredStatus.isAuthenticated;
};

const resolveCodexAuthStatus = async (
  ctx: any,
  codebase: DaytonaCodebase,
  userId: any,
  options?: { skipStoredRestore?: boolean },
): Promise<CodexAuthFileStatus> => {
  let status = await readCodexAuthFileStatus(codebase);
  if (!status.isAuthenticated && !options?.skipStoredRestore) {
    const restored = await restoreCodexAuthFromStoredCredentials(
      ctx,
      codebase,
      userId,
    );
    if (restored) {
      status = await readCodexAuthFileStatus(codebase);
    }
  }
  return status;
};

const syncCodexAuthState = async (
  ctx: any,
  user: any,
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

  if (
    user.codex_auth_fingerprint === status.authFingerprint &&
    user.codex_auth_encrypted_payload === encryptedPayload?.encryptedPayload &&
    user.codex_auth_encryption_version ===
      encryptedPayload?.encryptionVersion &&
    user.codex_auth_mode === status.authMode &&
    user.codex_auth_last_refresh === status.lastRefresh
  ) {
    return;
  }

  await ctx.runMutation(internal.users.upsertCodexAuthFingerprintInternal, {
    userId: user._id,
    codexAuthFingerprint: status.authFingerprint,
    codexAuthEncryptedPayload: encryptedPayload?.encryptedPayload,
    codexAuthEncryptionVersion: encryptedPayload?.encryptionVersion,
    codexAuthMode: status.authMode,
    codexAuthLastRefresh: status.lastRefresh,
    codexAuthUpdatedAt: Date.now(),
  });
};

const buildCodexAuthStatusResponse = (status: CodexAuthFileStatus) => ({
  hasAuthFile: status.hasAuthFile,
  isAuthenticated: status.isAuthenticated,
  authMode: status.authMode,
  lastRefresh: status.lastRefresh,
  message: status.isAuthenticated
    ? "Codex auth token is present"
    : status.hasAuthFile
      ? "Auth file exists but token set is invalid"
      : "No Codex auth token file found",
});

export const startCodexDeviceAuth = action({
  args: {
    projectSemanticIdentifier: v.string(),
    forceReauth: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    alreadyAuthenticated: v.boolean(),
    hasAuthFile: v.boolean(),
    isAuthenticated: v.boolean(),
    authMode: v.optional(v.string()),
    lastRefresh: v.optional(v.string()),
    authUrl: v.optional(v.string()),
    oneTimeCode: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      const { codebase, user, project } =
        await resolveAuthorizedDaytonaCodebase(
          ctx,
          args.projectSemanticIdentifier,
        );
      const cacheKey = getCodexAuthCacheKey(
        user._id.toString(),
        project._id.toString(),
      );
      await ensureCodexInstalled(codebase);
      const pathValue = codexPathValue();

      if (args.forceReauth) {
        codexAuthStatusCache.delete(cacheKey);
        await codebase.runCommand(
          `cd /home/daytona/codebase && export PATH=${pathValue} && (codex logout || true) && (pkill -f "codex login --device-auth" || true) && rm -f "/home/daytona/.codex/auth.json" "/home/daytona/.codex/vly-device-auth.log" "/home/daytona/.codex/vly-device-auth.pid"`,
          10000,
        );
      }

      const authStatus = await resolveCodexAuthStatus(ctx, codebase, user._id, {
        skipStoredRestore: !!args.forceReauth,
      });
      await syncCodexAuthState(ctx, user, authStatus);
      codexAuthStatusCache.set(cacheKey, {
        cachedAt: Date.now(),
        status: authStatus,
      });
      if (authStatus.isAuthenticated && !args.forceReauth) {
        return {
          success: true,
          alreadyAuthenticated: true,
          hasAuthFile: authStatus.hasAuthFile,
          isAuthenticated: authStatus.isAuthenticated,
          authMode: authStatus.authMode,
          lastRefresh: authStatus.lastRefresh,
          authUrl: undefined,
          oneTimeCode: undefined,
          message: "Codex auth token already exists on this machine",
        };
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
      const oneTimeCode = deviceAuthInfo.userCode;

      const latestStatus = await resolveCodexAuthStatus(
        ctx,
        codebase,
        user._id,
        {
          skipStoredRestore: true,
        },
      );
      await syncCodexAuthState(ctx, user, latestStatus);
      codexAuthStatusCache.set(cacheKey, {
        cachedAt: Date.now(),
        status: latestStatus,
      });

      return {
        success: !!(authUrl || oneTimeCode),
        alreadyAuthenticated: false,
        hasAuthFile: latestStatus.hasAuthFile,
        isAuthenticated: latestStatus.isAuthenticated,
        authMode: latestStatus.authMode,
        lastRefresh: latestStatus.lastRefresh,
        authUrl,
        oneTimeCode,
        message:
          authUrl || oneTimeCode
            ? "Device auth started"
            : "Device auth started, but URL/code are not available yet. Retry in a few seconds.",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start Codex auth";
      return {
        success: false,
        alreadyAuthenticated: false,
        hasAuthFile: false,
        isAuthenticated: false,
        authMode: undefined,
        lastRefresh: undefined,
        authUrl: undefined,
        oneTimeCode: undefined,
        message,
      };
    }
  },
});

export const getCodexDeviceAuthStatus = action({
  args: {
    projectSemanticIdentifier: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    hasAuthFile: v.boolean(),
    isAuthenticated: v.boolean(),
    authMode: v.optional(v.string()),
    lastRefresh: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      const { user, project } = await resolveAuthorizedDaytonaProject(
        ctx,
        args.projectSemanticIdentifier,
      );
      const cacheKey = getCodexAuthCacheKey(
        user._id.toString(),
        project._id.toString(),
      );
      const cachedStatus = codexAuthStatusCache.get(cacheKey);
      if (
        cachedStatus &&
        Date.now() - cachedStatus.cachedAt < CODEX_AUTH_STATUS_CACHE_TTL_MS
      ) {
        return {
          success: true,
          ...buildCodexAuthStatusResponse(cachedStatus.status),
        };
      }

      const { codebase } = await resolveAuthorizedDaytonaCodebase(
        ctx,
        args.projectSemanticIdentifier,
      );
      const status = await resolveCodexAuthStatus(ctx, codebase, user._id);
      await syncCodexAuthState(ctx, user, status);
      codexAuthStatusCache.set(cacheKey, {
        cachedAt: Date.now(),
        status,
      });

      return {
        success: true,
        ...buildCodexAuthStatusResponse(status),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read auth status";
      return {
        success: false,
        hasAuthFile: false,
        isAuthenticated: false,
        authMode: undefined,
        lastRefresh: undefined,
        message,
      };
    }
  },
});

export const resetCodexDeviceAuth = action({
  args: {
    projectSemanticIdentifier: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    hasAuthFile: v.boolean(),
    isAuthenticated: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      const { codebase, user, project } =
        await resolveAuthorizedDaytonaCodebase(
          ctx,
          args.projectSemanticIdentifier,
        );
      const cacheKey = getCodexAuthCacheKey(
        user._id.toString(),
        project._id.toString(),
      );
      codexAuthStatusCache.delete(cacheKey);
      const pathValue = codexPathValue();
      await codebase.runCommand(
        `cd /home/daytona/codebase && export PATH=${pathValue} && (codex logout || true) && (pkill -f "codex login --device-auth" || true) && rm -f "/home/daytona/.codex/auth.json" "/home/daytona/.codex/vly-device-auth.log" "/home/daytona/.codex/vly-device-auth.pid"`,
        10000,
      );

      const status = await resolveCodexAuthStatus(ctx, codebase, user._id, {
        skipStoredRestore: true,
      });
      await syncCodexAuthState(ctx, user, status);
      codexAuthStatusCache.set(cacheKey, {
        cachedAt: Date.now(),
        status,
      });

      return {
        success: true,
        hasAuthFile: status.hasAuthFile,
        isAuthenticated: status.isAuthenticated,
        message: "Codex auth reset complete",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset Codex auth";
      return {
        success: false,
        hasAuthFile: false,
        isAuthenticated: false,
        message,
      };
    }
  },
});
