"use node";

import { internal } from "!/_generated/api";
import { z } from "zod";
import { Codebase } from "../../../codebase-utils/codebase/Codebase";
import { initializeCodebase } from "../../../codebase-utils/codebase/initializeCodebase";
import { getProjectPackageManager } from "../../../codebase-utils/packageManager";
import { ActionCtx } from "../../_generated/server";
import { Doc, Id } from "!/_generated/dataModel";
import { AgentMode } from "../../utils/registry_validators";
import {
  ContextLength,
  DEFAULT_CONTEXT_LENGTH,
  getContextLengthPreset,
} from "../config/contextLengthPresets";
import {
  ContextMember,
  ContextMessage,
  ContextProjectIntegration,
} from "./types";

const MAX_CODEBASE_STRUCTURE_BYTES = 120 * 1024;

export type SharedContext = {
  project: Doc<"project">;
  thread: Doc<"thread">;
  members: ContextMember[];
  projectOwnerId: Id<"users">; // Project owner for credit tracking
  executingUserIsPlatformAdmin: boolean;
  availableFilePaths: string[];
  loadedFiles: Record<string, string>;
  readFileCached: (filePath: string) => Promise<string>;
  codebaseStructure: string;
  filesInContext: {
    file_path: string;
    importance: number;
  }[];
  messages: ContextMessage[];
  entryPoints: Doc<"entry_point">[];
  codebase: Codebase;

  projectIntegrations: ContextProjectIntegration[];

  assets: {
    name: string;
    description: string;
    fileName: string;
    filePath: string;
    fileType: string;
    size: number;
    uploadedAt: string;
    tags: string[];
  }[];

  assistantMessageId: Id<"messages">;

  // Context for tool execution
  ctx: ActionCtx;
  projectId: Id<"project">;
  threadId: Id<"thread">;

  consoleLog: (
    log: string,
    type?: string,
    meta?: Record<string, any>,
  ) => Promise<void>;

  model: AgentMode; // The selected agent operation mode (may be overwritten to SUMMARIZER mid-run)
  contextLength: ContextLength; // Context length preset (small, medium, long)
  keepGoing: boolean;
  commitMessage: string;
  needsErrorCheck: boolean;
  changedFiles: string[]; // Track files changed during this turn
  hasSuccessfulWrites: boolean; // Track if any files were successfully written
  codeblocksForLogging: string[]; // Track codeblocks for logging
  // When true, skip switching to summarizer model after a passing type-check for this turn
  skipSummarizerOnPass: boolean;
  // Feature flags cached for performance (fetched once per agent run)
  vlyIntegrationsEnabled: boolean;
  currentTurnMessages: string[];
  /** When set by the agent cycle, throttles DB reads for termination checks */
  checkTerminatedThrottled?: (ctx: ActionCtx) => Promise<boolean>;
};

const AssetsCollectionSchema = z.object({
  assets: z.array(
    z.object({
      id: z.string(),
      fileName: z.string(),
      originalName: z.string(),
      description: z.string().optional(),
      fileType: z.string(),
      fileSize: z.number(),
      uploadedAt: z.string(),
      filePath: z.string(),
    }),
  ),
  lastUpdated: z.string(),
});

function truncateContextText(
  value: string,
  maxBytes: number,
  label: string,
): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  if (bytes.length <= maxBytes) {
    return value;
  }

  console.warn(
    `[Context] Truncating ${label}: ${(bytes.length / 1024).toFixed(1)} KB -> ${(maxBytes / 1024).toFixed(1)} KB`,
  );

  const decoder = new TextDecoder();
  const headBytes = Math.floor(maxBytes * 0.8);
  const tailBytes = Math.floor(maxBytes * 0.2);
  return [
    decoder.decode(bytes.slice(0, headBytes)),
    `\n\n[${label} truncated]\n\n`,
    decoder.decode(bytes.slice(-tailBytes)),
  ].join("");
}

export async function handler_getSharedContext(
  ctx: ActionCtx,
  project: Doc<"project">,
  assistantMessageId: Id<"messages">,
  agentMode?: AgentMode,
  options?: {
    executingUserIsPlatformAdmin?: boolean;
    contextLength?: ContextLength;
  },
): Promise<SharedContext> {
  console.log("[Context] Starting context assembly for project:", project._id);

  try {
    // initialize the codebase
    const codesandboxId = project.sandbox_id;
    console.log("[Context] Initializing codebase for sandbox:", codesandboxId);

    // Get package manager (uses saved value or detects for legacy projects)
    const packageManager = await getProjectPackageManager(ctx, project);

    const codebase = await initializeCodebase(codesandboxId, packageManager);

    // Get context data from database
    console.log("[Context] Fetching context data from database");
    const preset = getContextLengthPreset(
      options?.contextLength ?? DEFAULT_CONTEXT_LENGTH,
    );
    const contextData = await ctx.runQuery(
      internal.coding_agent.context.queries.getContextData,
      {
        projectId: project._id,
        maxMessages: preset.maxContextMessages,
      },
    );

    console.log("[Context] Reading file paths from codebase");
    const availableFilePaths = await codebase.getAllFilePaths();
    console.log(
      `[Context] Loaded ${availableFilePaths.length} file paths from codebase`,
    );

    const {
      members,
      projectOwnerId,
      thread,
      messages,
      entryPoints,
      projectIntegrations,
    } = contextData;

    const filesInContext = thread.files_in_context ?? [];

    // Get asset metadata
    let assets: SharedContext["assets"] = [];
    try {
      const assetsMetadata = await codebase.readFile("../assets.json");
      const parsedData = JSON.parse(assetsMetadata);
      const validatedAssets = AssetsCollectionSchema.parse(parsedData);

      assets = validatedAssets.assets.map((asset) => ({
        name: asset.fileName,
        description: asset.description || "",
        fileName: asset.fileName,
        filePath: asset.filePath,
        fileType: asset.fileType,
        size: asset.fileSize,
        uploadedAt: asset.uploadedAt,
        tags: [],
      }));
    } catch {
      assets = [];
    }

    const consoleLog = async (
      log: string,
      type?: string,
      meta?: Record<string, any>,
    ) => {
      const timestamp = Date.now();
      console.log(
        `[${new Date(timestamp).toISOString()}] [${type || "INFO"}] ${log}`,
        meta ? { meta } : "",
      );
    };

    // VLY integrations are always enabled - no filtering needed
    const vlyIntegrationsEnabled = true;
    const filteredFilesInContext = filesInContext;
    const loadedFiles: Record<string, string> = {};
    const readFileCached = async (filePath: string) => {
      if (loadedFiles[filePath] !== undefined) {
        return loadedFiles[filePath];
      }

      const content = await codebase.readFile(filePath);
      loadedFiles[filePath] = content;
      if (!availableFilePaths.includes(filePath)) {
        availableFilePaths.push(filePath);
      }
      return content;
    };

    // Read codebase structure from file (generated by background task)
    let codebaseStructure: string;
    try {
      codebaseStructure = truncateContextText(
        await codebase.readFile("../CODEBASE_STRUCTURE.md"),
        MAX_CODEBASE_STRUCTURE_BYTES,
        "codebase_structure",
      );
      console.log("[Context] Loaded codebase structure from file");
    } catch {
      // File doesn't exist - use fallback with file list, schedule background generation
      const fileList = availableFilePaths.join("\n");
      codebaseStructure = truncateContextText(
        `# Codebase Structure\n<!-- File not yet generated - using file list fallback -->\n\n${fileList}`,
        MAX_CODEBASE_STRUCTURE_BYTES,
        "codebase_structure",
      );

      // Schedule background generation (don't block)
      ctx.scheduler.runAfter(
        0,
        internal.codebaseStructure.generateFullStructure,
        {
          sandboxId: project.sandbox_id,
          packageManager: packageManager,
        },
      );
      console.log(
        "[Context] Structure file missing, scheduled background generation",
      );
    }

    console.log(
      `[Context] Context assembly completed - ${availableFilePaths.length} file paths loaded`,
    );

    const normalizedAgentMode: AgentMode =
      agentMode === "EXPENSIVE"
        ? "POWERFUL"
        : agentMode === "ULTRA_CHEAP"
          ? "CHEAP"
          : agentMode === "MINIMAX"
            ? "STANDARD"
            : (agentMode ?? "POWERFUL");

    return {
      project,
      thread,
      members,
      projectOwnerId,
      executingUserIsPlatformAdmin:
        options?.executingUserIsPlatformAdmin === true,
      availableFilePaths,
      loadedFiles,
      readFileCached,
      codebaseStructure,
      filesInContext: filteredFilesInContext,
      codebase,
      entryPoints,
      messages,
      projectIntegrations,
      assets,
      assistantMessageId,
      ctx,
      projectId: project._id,
      threadId: project.active_thread!,
      consoleLog,
      model: normalizedAgentMode,
      contextLength: DEFAULT_CONTEXT_LENGTH, // Default, may be overwritten by cycle
      keepGoing: true,
      commitMessage: "",
      needsErrorCheck: false,
      changedFiles: [],
      hasSuccessfulWrites: false,
      codeblocksForLogging: [],
      skipSummarizerOnPass: false,
      vlyIntegrationsEnabled,
      currentTurnMessages: [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Context] Context assembly failed:", errorMessage);

    // Set project to done state to prevent stuck loading
    try {
      await ctx.runMutation(internal.project.setStateDone, {
        projectId: project._id,
      });
    } catch (stateError) {
      console.error("[Context] Failed to set project state:", stateError);
    }
    if (errorMessage.includes("State change in progress")) {
      throw new Error(
        `Context assembly failed: The development environment is currently starting up or changing states. This is usually temporary - please wait a moment and try again.`,
      );
    }

    throw new Error(`Context assembly failed: ${errorMessage}`);
  }
}
