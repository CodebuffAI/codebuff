import schema from "!/schema";
import { modelValidator } from "!/utils/registry_validators";
import { typedV } from "convex-helpers/validators";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Size limits to prevent exceeding Convex 1 MiB document limit
const MAX_THINKING_SIZE = 80 * 1024; // 80 KB - users don't see full reasoning
const MAX_CONTENT_SIZE = 300 * 1024; // 300 KB
const MAX_OBJECT_SIZE = 180 * 1024; // 180 KB
const MAX_RESULT_SIZE = 180 * 1024; // 180 KB
const MAX_ERROR_CHECK_SIZE = 180 * 1024; // 180 KB
const MAX_FILE_APPLY_RESULTS_SIZE = 60 * 1024; // 60 KB
const MAX_PROVIDER_METADATA_SIZE = 20 * 1024; // 20 KB
const MAX_USAGE_OTHER_SIZE = 20 * 1024; // 20 KB
const MAX_DEBUG_PROMPT_LOG_SIZE = 320 * 1024; // 320 KB debug-only prompt capture
const MAX_FAST_RETURN_PREVIEW_SIZE = 4 * 1024; // 4 KB

/**
 * Truncates a string to maxBytes, keeping the END (recent content).
 * Uses TextEncoder for accurate byte counting.
 */
function truncateKeepEnd(
  str: string,
  maxBytes: number,
  fieldName: string,
): string {
  if (!str) return str;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  if (bytes.length <= maxBytes) {
    return str;
  }

  console.warn(
    `[Messages] Truncating ${fieldName}: ${(bytes.length / 1024).toFixed(1)} KB -> ${(maxBytes / 1024).toFixed(1)} KB`,
  );

  // Keep the end of the string
  const decoder = new TextDecoder();
  const truncated = decoder.decode(bytes.slice(-maxBytes));
  return "[...truncated...]\n\n" + truncated;
}

function truncateKeepBoth(
  str: string,
  maxBytes: number,
  fieldName: string,
): string {
  if (!str) return str;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  if (bytes.length <= maxBytes) {
    return str;
  }

  console.warn(
    `[Messages] Truncating ${fieldName}: ${(bytes.length / 1024).toFixed(1)} KB -> ${(maxBytes / 1024).toFixed(1)} KB`,
  );

  const decoder = new TextDecoder();
  const headBytes = Math.floor(maxBytes * 0.75);
  const tailBytes = Math.floor(maxBytes * 0.25);
  return [
    decoder.decode(bytes.slice(0, headBytes)),
    `\n\n[${fieldName} truncated]\n\n`,
    decoder.decode(bytes.slice(-tailBytes)),
  ].join("");
}

function truncateKeepStart(
  str: string,
  maxBytes: number,
  fieldName: string,
): string {
  if (!str) return str;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  if (bytes.length <= maxBytes) {
    return str;
  }

  console.warn(
    `[Messages] Truncating ${fieldName}: ${(bytes.length / 1024).toFixed(1)} KB -> ${(maxBytes / 1024).toFixed(1)} KB`,
  );

  const decoder = new TextDecoder();
  const marker = `\n\n[${fieldName} truncated]\n`;
  const markerBytes = encoder.encode(marker).length;
  const availableBytes = Math.max(0, maxBytes - markerBytes);

  return decoder.decode(bytes.slice(0, availableBytes)) + marker;
}

/**
 * Truncates object JSON by removing old tool calls from the beginning.
 */
function truncateObjectJson(objectStr: string, maxBytes: number): string {
  if (!objectStr) return objectStr;

  const encoder = new TextEncoder();
  if (encoder.encode(objectStr).length <= maxBytes) {
    return objectStr;
  }

  try {
    const toolCalls = JSON.parse(objectStr);
    if (!Array.isArray(toolCalls)) {
      return truncateKeepEnd(objectStr, maxBytes, "object");
    }

    // Remove old tool calls until under limit
    while (toolCalls.length > 1) {
      toolCalls.shift();
      const newStr = JSON.stringify(toolCalls);
      if (encoder.encode(newStr).length <= maxBytes) {
        console.warn(
          `[Messages] Truncated object: removed old tool calls, kept ${toolCalls.length}`,
        );
        return newStr;
      }
    }

    // If single tool call still too large, truncate as string
    return truncateKeepEnd(JSON.stringify(toolCalls), maxBytes, "object");
  } catch {
    return truncateKeepEnd(objectStr, maxBytes, "object");
  }
}

function truncateFileApplyResults(
  fileApplyResults:
    | {
        path: string;
        success: boolean;
        error?: string;
      }[]
    | undefined,
) {
  if (!fileApplyResults) {
    return fileApplyResults;
  }

  const sanitize = (results: typeof fileApplyResults) =>
    results.map((result) => ({
      path: truncateKeepBoth(result.path, 2 * 1024, "file_apply_path"),
      success: result.success,
      ...(result.error
        ? {
            error: truncateKeepBoth(result.error, 4 * 1024, "file_apply_error"),
          }
        : {}),
    }));

  let sanitized = sanitize(fileApplyResults);
  const encoder = new TextEncoder();

  while (
    sanitized.length > 1 &&
    encoder.encode(JSON.stringify(sanitized)).length >
      MAX_FILE_APPLY_RESULTS_SIZE
  ) {
    sanitized = sanitized.slice(Math.ceil(sanitized.length / 2));
  }

  return sanitized;
}

function serializeMessageForSummary(message: any) {
  return {
    _id: message._id,
    _creationTime: message._creationTime,
    role: message.role,
    content: message.content,
    core_message: message.core_message,
    date: message.date,
    thread_id: message.thread_id,
  };
}

export const get = internalQuery({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

export const updateMessageSummary = internalMutation({
  args: {
    messageId: v.id("messages"),
    summarization: v.string(),
    compactSummarization: v.string(),
    codeSummarization: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Update the message with the summarization
    await ctx.db.patch(args.messageId, {
      summarization: args.summarization,
      compact_summarization: args.compactSummarization,
      code_summarization: args.codeSummarization,
    });
  },
});

export const updateMessageIntegrationReference = internalMutation({
  args: {
    messageId: v.id("messages"),
    integrationId: v.id("integration"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    // Add to array if not already present
    const existingRefs = message.integration_references || [];
    if (!existingRefs.includes(args.integrationId)) {
      await ctx.db.patch(args.messageId, {
        integration_references: [...existingRefs, args.integrationId],
      });
    }
    return null;
  },
});

export const setProcessingResult = internalMutation({
  args: {
    messageId: v.id("messages"),
    typecheckResult: v.string(),
    fileApplyResults: v.optional(
      typedV(schema).doc("messages").fields["file_apply_results"],
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      error_check: truncateKeepBoth(
        args.typecheckResult,
        MAX_ERROR_CHECK_SIZE,
        "error_check",
      ),
      file_apply_results: truncateFileApplyResults(args.fileApplyResults),
    });
  },
});

export const recordTokenUsage = internalMutation({
  args: {
    messageId: v.id("messages"),
    tokenUsage: v.object({
      input_tokens: v.number(),
      output_tokens: v.number(),
      model: modelValidator,
    }),
    cachedTokens: v.optional(v.number()),
    providerMetadata: v.optional(v.string()),
    totalCostUsd: v.optional(v.number()),
    usageBreakdown: v.optional(
      v.object({
        input_tokens: v.number(),
        cached_input_tokens: v.number(),
        output_tokens: v.number(),
        reasoning_tokens: v.optional(v.number()),
        cache_write_input_tokens: v.optional(v.number()),
        other: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const priorUsage = message.usage_breakdown ?? {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 0,
      cache_write_input_tokens: 0,
      other: undefined,
    };
    const nextUsage = args.usageBreakdown ?? {
      input_tokens: args.tokenUsage.input_tokens,
      cached_input_tokens: args.cachedTokens ?? 0,
      output_tokens: args.tokenUsage.output_tokens,
      reasoning_tokens: 0,
      cache_write_input_tokens: 0,
      other: undefined,
    };

    await ctx.db.patch(args.messageId, {
      token_usage: message.token_usage
        ? [...message.token_usage, args.tokenUsage]
        : [args.tokenUsage],
      usage_breakdown: {
        input_tokens: priorUsage.input_tokens + nextUsage.input_tokens,
        cached_input_tokens:
          priorUsage.cached_input_tokens + nextUsage.cached_input_tokens,
        output_tokens: priorUsage.output_tokens + nextUsage.output_tokens,
        ...(priorUsage.reasoning_tokens !== undefined ||
        nextUsage.reasoning_tokens !== undefined
          ? {
              reasoning_tokens:
                (priorUsage.reasoning_tokens ?? 0) +
                (nextUsage.reasoning_tokens ?? 0),
            }
          : {}),
        ...(priorUsage.cache_write_input_tokens !== undefined ||
        nextUsage.cache_write_input_tokens !== undefined
          ? {
              cache_write_input_tokens:
                (priorUsage.cache_write_input_tokens ?? 0) +
                (nextUsage.cache_write_input_tokens ?? 0),
            }
          : {}),
        ...(nextUsage.other || priorUsage.other
          ? {
              other: truncateKeepBoth(
                [priorUsage.other, nextUsage.other].filter(Boolean).join("\n"),
                MAX_USAGE_OTHER_SIZE,
                "usage_other",
              ),
            }
          : {}),
      },
      ...(args.totalCostUsd !== undefined
        ? {
            total_cost_usd: (message.total_cost_usd ?? 0) + args.totalCostUsd,
          }
        : {}),
      ...(args.providerMetadata !== undefined
        ? {
            provider_metadata: truncateKeepBoth(
              args.providerMetadata,
              MAX_PROVIDER_METADATA_SIZE,
              "provider_metadata",
            ),
          }
        : {}),
    });
  },
});

export const updateCreditsDeducted = internalMutation({
  args: {
    messageId: v.id("messages"),
    creditsDeducted: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    // Accumulate credits if there are multiple model calls per message
    const existingCredits = message.credits_deducted ?? 0;
    await ctx.db.patch(args.messageId, {
      credits_deducted: existingCredits + args.creditsDeducted,
    });
  },
});

export const getForProject = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.active_thread) {
      return [];
    }

    // Take 25 messages by date first, then filter out deactivated and streamed
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", project.active_thread).eq("streaming", false),
      )
      .order("desc")
      .take(25)
      .then((msgs) => msgs.filter((msg) => msg.deactivated !== true));

    return messages;
  },
});

export const getAllForProject = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.active_thread) {
      return [];
    }

    // Get ALL messages including deactivated ones - needed for operations like undo
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", project.active_thread).eq("streaming", false),
      )
      .order("desc")
      .take(50); // Take more messages since we need complete history for operations

    return messages;
  },
});

// NOT USED: for testing purposes
export const getRelevantMessages = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.active_thread) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", project.active_thread).eq("streaming", false),
      )
      .order("desc")
      .filter((q) => q.neq(q.field("deactivated"), true))
      .filter((q) => q.neq(q.field("isFastReturn"), true))
      .take(40);
    return messages;
  },
});

export const insertEmptyAssistantMessage = internalMutation({
  args: {
    projectId: v.id("project"),
    fastReturn: v.optional(v.boolean()),
    modelSemanticName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    console.log(Date.now());
    const assistantMessageId = await ctx.db.insert("messages", {
      project_id: args.projectId,
      role: "assistant",
      content: "",
      date: Date.now() + 1, // Add 1ms to ensure correct ordering
      ...(project?.active_thread && { thread_id: project.active_thread }),
      streaming: true,
      deactivated: false,
      ...(args.fastReturn && { isFastReturn: args.fastReturn }),
      ...(args.modelSemanticName && {
        model_semantic_name: args.modelSemanticName,
      }),
    });

    return assistantMessageId;
  },
});

export const updateMessageToolResult = internalMutation({
  args: {
    messageId: v.id("messages"),
    toolResult: v.string(),
    errorCheck: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      result: truncateKeepBoth(args.toolResult, MAX_RESULT_SIZE, "result"),
      ...(args.errorCheck && {
        error_check: truncateKeepBoth(
          args.errorCheck,
          MAX_ERROR_CHECK_SIZE,
          "error_check",
        ),
      }),
    });
  },
});

export const updateMessageContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.optional(v.string()),
    coreMessage: v.optional(v.string()),
    object: v.optional(v.string()),
    result: v.optional(v.string()),
    errorCheck: v.optional(v.string()),
    fileApplyResults: v.optional(
      typedV(schema).doc("messages").fields["file_apply_results"],
    ),
    toolCallName: v.optional(v.string()),
    streaming: v.optional(v.boolean()),
    fastReturn: v.optional(v.boolean()),
    thinking: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      ...(args.content !== undefined && {
        content: truncateKeepEnd(args.content, MAX_CONTENT_SIZE, "content"),
      }),
      ...(args.coreMessage !== undefined && {
        core_message: truncateKeepEnd(
          args.coreMessage,
          MAX_CONTENT_SIZE,
          "core_message",
        ),
      }),
      ...(args.object !== undefined && {
        object: truncateObjectJson(args.object, MAX_OBJECT_SIZE),
      }),
      ...(args.result !== undefined && {
        result: truncateKeepBoth(args.result, MAX_RESULT_SIZE, "result"),
      }),
      ...(args.errorCheck !== undefined && {
        error_check: truncateKeepBoth(
          args.errorCheck,
          MAX_ERROR_CHECK_SIZE,
          "error_check",
        ),
      }),
      ...(args.fileApplyResults !== undefined && {
        file_apply_results: truncateFileApplyResults(args.fileApplyResults),
      }),
      ...(args.toolCallName !== undefined && { tool_call: args.toolCallName }),
      ...(args.streaming !== undefined && { streaming: args.streaming }),
      ...(args.fastReturn !== undefined && { isFastReturn: args.fastReturn }),
      ...(args.thinking !== undefined && {
        thinking: truncateKeepEnd(args.thinking, MAX_THINKING_SIZE, "thinking"),
      }),
    });
  },
});

// OPTIMIZATION: Combine content + state updates to reduce mutations from 196k/day to ~60k/day
export const updateMessageContentAndState = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.optional(v.string()),
    coreMessage: v.optional(v.string()),
    object: v.optional(v.string()),
    result: v.optional(v.string()),
    errorCheck: v.optional(v.string()),
    fileApplyResults: v.optional(
      typedV(schema).doc("messages").fields["file_apply_results"],
    ),
    toolCallName: v.optional(v.string()),
    streaming: v.optional(v.boolean()),
    fastReturn: v.optional(v.boolean()),
    thinking: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("complete"),
        v.literal("error"),
        v.literal("type_errors"),
        v.literal("checking_errors"),
        v.literal("processing_tools"),
        v.literal("streaming"),
        v.literal("thinking"),
      ),
    ),
    statusMessage: v.optional(v.string()),
    statusColor: v.optional(
      v.union(
        v.literal("green"),
        v.literal("red"),
        v.literal("yellow"),
        v.literal("blue"),
        v.literal("gray"),
        v.literal("orange"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const updateData: any = {};

    // Content updates with truncation
    if (args.content !== undefined)
      updateData.content = truncateKeepEnd(
        args.content,
        MAX_CONTENT_SIZE,
        "content",
      );
    if (args.coreMessage !== undefined)
      updateData.core_message = truncateKeepEnd(
        args.coreMessage,
        MAX_CONTENT_SIZE,
        "core_message",
      );
    if (args.object !== undefined)
      updateData.object = truncateObjectJson(args.object, MAX_OBJECT_SIZE);
    if (args.result !== undefined)
      updateData.result = truncateKeepBoth(
        args.result,
        MAX_RESULT_SIZE,
        "result",
      );
    if (args.errorCheck !== undefined)
      updateData.error_check = truncateKeepBoth(
        args.errorCheck,
        MAX_ERROR_CHECK_SIZE,
        "error_check",
      );
    if (args.fileApplyResults !== undefined)
      updateData.file_apply_results = truncateFileApplyResults(
        args.fileApplyResults,
      );
    if (args.toolCallName !== undefined)
      updateData.tool_call = args.toolCallName;
    if (args.streaming !== undefined) updateData.streaming = args.streaming;
    if (args.fastReturn !== undefined)
      updateData.isFastReturn = args.fastReturn;
    if (args.thinking !== undefined)
      updateData.thinking = truncateKeepEnd(
        args.thinking,
        MAX_THINKING_SIZE,
        "thinking",
      );

    // State updates
    if (args.status !== undefined) {
      const stateData: any = {
        status: args.status,
        timestamp: Date.now(),
      };

      if (args.statusMessage !== undefined) {
        stateData.message = args.statusMessage.substring(0, 250);
      }

      if (args.statusColor !== undefined) {
        stateData.color = args.statusColor;
      } else {
        // Auto-assign color based on status
        switch (args.status) {
          case "complete":
            stateData.color = "green";
            break;
          case "error":
            stateData.color = "red";
            break;
          case "type_errors":
            stateData.color = "orange";
            break;
          case "checking_errors":
          case "processing_tools":
            stateData.color = "yellow";
            break;
          case "streaming":
            stateData.color = "blue";
            break;
          case "thinking":
            stateData.color = "gray";
            break;
        }
      }

      updateData.message_state = stateData;
    }

    await ctx.db.patch(args.messageId, updateData);
  },
});

export const updateModelSemanticName = internalMutation({
  args: {
    messageId: v.id("messages"),
    modelSemanticName: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      model_semantic_name: args.modelSemanticName,
    });
  },
});

export const appendDebugPromptLog = internalMutation({
  args: {
    messageId: v.id("messages"),
    log: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    await ctx.db.patch(args.messageId, {
      debug_prompt_log: truncateKeepStart(
        args.log,
        MAX_DEBUG_PROMPT_LOG_SIZE,
        "debug_prompt_log",
      ),
    });
  },
});

export const updateCoreMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    coreMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      core_message: args.coreMessage,
    });
  },
});

export const updateMessageSuggestions = internalMutation({
  args: {
    messageId: v.id("messages"),
    suggestions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      suggestions: args.suggestions,
    });
  },
});

export const setFastReturnPreview = internalMutation({
  args: {
    messageId: v.id("messages"),
    preview: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      fast_return_preview: truncateKeepEnd(
        args.preview,
        MAX_FAST_RETURN_PREVIEW_SIZE,
        "fast_return_preview",
      ),
    });
  },
});

export const clearSuggestionsFromThread = internalMutation({
  args: {
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    // OPTIMIZATION: Only clear suggestions from recent messages (last 50) to reduce data reads
    // This reduces data read from ~500KB to ~100KB
    // Suggestions are typically only on the most recent messages anyway
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", args.threadId).eq("streaming", false),
      )
      .order("desc")
      .filter((q) => q.neq(q.field("deactivated"), true))
      .filter((q) => q.eq(q.field("role"), "assistant"))
      .take(50);

    // Only patch messages that actually have suggestions
    for (const message of messages) {
      if (message.suggestions) {
        await ctx.db.patch(message._id, {
          suggestions: undefined,
        });
      }
    }
  },
});

export const updateMessageState = internalMutation({
  args: {
    messageId: v.id("messages"),
    status: v.union(
      v.literal("complete"),
      v.literal("error"),
      v.literal("type_errors"),
      v.literal("checking_errors"),
      v.literal("processing_tools"),
      v.literal("streaming"),
      v.literal("thinking"),
      v.literal("insufficient_credits"),
    ),
    message: v.optional(v.string()),
    color: v.optional(
      v.union(
        v.literal("green"),
        v.literal("red"),
        v.literal("yellow"),
        v.literal("blue"),
        v.literal("gray"),
        v.literal("orange"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const stateData: any = {
      status: args.status,
      timestamp: Date.now(),
    };

    if (args.message !== undefined) {
      stateData.message = args.message.substring(0, 250);
    }

    if (args.color !== undefined) {
      stateData.color = args.color;
    } else {
      // Auto-assign color based on status
      switch (args.status) {
        case "complete":
          stateData.color = "green";
          break;
        case "error":
          stateData.color = "red";
          break;
        case "type_errors":
          stateData.color = "orange";
          break;
        case "checking_errors":
        case "processing_tools":
          stateData.color = "yellow";
          break;
        case "streaming":
          stateData.color = "blue";
          break;
        case "thinking":
          stateData.color = "gray";
          break;
        case "insufficient_credits":
          stateData.color = "yellow";
          break;
      }
    }

    await ctx.db.patch(args.messageId, {
      message_state: stateData,
    });
  },
});

export const setCheckingErrorsAndInvalidate = internalMutation({
  args: {
    messageId: v.id("messages"),
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      message_state: {
        status: "checking_errors",
        message: "Running type check",
        color: "yellow",
        timestamp: Date.now(),
      },
    });

    const unresolvedRuntime = await ctx.db
      .query("runtime_error")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "unresolved"),
          q.and(
            q.eq(q.field("status"), undefined),
            q.eq(q.field("resolved"), undefined),
          ),
        ),
      )
      .collect();
    for (const error of unresolvedRuntime) {
      await ctx.db.patch(error._id, { resolved: true, status: "invalidated" });
    }

    const unresolvedBuild = await ctx.db
      .query("build_error")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "unresolved"),
          q.and(
            q.eq(q.field("status"), undefined),
            q.eq(q.field("resolved"), undefined),
          ),
        ),
      )
      .collect();
    for (const error of unresolvedBuild) {
      await ctx.db.patch(error._id, { resolved: true, status: "invalidated" });
    }
  },
});

export const insertAssistantMessage = internalMutation({
  args: {
    projectId: v.id("project"),
    content: v.optional(v.string()),
    object: v.optional(v.string()),
    toolCallName: v.optional(v.string()),
    result: v.optional(v.string()),
    coreMessage: v.optional(v.string()),
    streaming: v.optional(v.boolean()),
    modelSemanticName: v.optional(v.string()),
    excludeFromAgentHistory: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const messageId = await ctx.db.insert("messages", {
      project_id: args.projectId,
      role: "assistant",
      content: truncateKeepEnd(args.content ?? "", MAX_CONTENT_SIZE, "content"),
      object:
        args.object !== undefined
          ? truncateObjectJson(args.object, MAX_OBJECT_SIZE)
          : undefined,
      tool_call: args.toolCallName,
      result:
        args.result !== undefined
          ? truncateKeepBoth(args.result, MAX_RESULT_SIZE, "result")
          : undefined,
      core_message:
        args.coreMessage !== undefined
          ? truncateKeepEnd(args.coreMessage, MAX_CONTENT_SIZE, "core_message")
          : undefined,
      date: Date.now(),
      streaming: args.streaming ?? false,
      deactivated: false,
      ...(project?.active_thread && { thread_id: project.active_thread }),
      ...(args.excludeFromAgentHistory !== undefined && {
        exclude_from_agent_history: args.excludeFromAgentHistory,
      }),
      ...(args.modelSemanticName && {
        model_semantic_name: args.modelSemanticName,
      }),
    });
    return messageId;
  },
});

export const insertUserMessage = internalMutation({
  args: {
    projectId: v.id("project"),
    content: v.string(),
    images: v.optional(v.array(v.id("_storage"))),
    threadId: v.optional(v.id("thread")),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      project_id: args.projectId,
      streaming: false,
      role: "user",
      content: truncateKeepEnd(args.content, MAX_CONTENT_SIZE, "content"),
      date: Date.now(),
      selected_entry_point_ids: [],
      deactivated: false,
      ...(args.images && { images: args.images }),
      ...(args.threadId && { thread_id: args.threadId }),
    });
    return messageId;
  },
});

export const updateCommitHash = internalMutation({
  args: {
    messageId: v.id("messages"),
    commitHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      commit_hash: args.commitHash,
    });
  },
});

/**
 * a mutation used to mark messages as deactivated when code is reverted
 * given a thread ID and a commit hash, this will mark all messages after
 * that commit hash as deactivated
 *
 * Uses a new index to quickly find the commit, then schedules batch processing
 * to avoid memory limits (messages can be several MB each)
 */
export const deactivateMessagesAfterCommit = internalMutation({
  args: {
    threadId: v.id("thread"),
    commitHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get the thread to validate it exists
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    // Use the new index to directly find the message with this commit hash
    const commitMessage = await ctx.db
      .query("messages")
      .withIndex("by_thread_and_commit", (q) =>
        q
          .eq("thread_id", args.threadId)
          .eq("commit_hash", args.commitHash)
          .eq("streaming", false),
      )
      .first();

    if (!commitMessage) {
      throw new Error("Commit hash not found in thread messages");
    }

    // Schedule the deactivation process to run in small batches
    await ctx.scheduler.runAfter(0, internal.messages.deactivateMessagesBatch, {
      threadId: args.threadId,
      commitMessageTime: commitMessage._creationTime,
      // Start directly at the rollback boundary so we only touch messages that
      // can actually be deactivated.
      lastCreationTime: commitMessage._creationTime - 1,
    });

    return null;
  },
});

/**
 * Internal helper that deactivates messages in tiny batches
 * Schedules itself recursively to process all messages without hitting memory limits
 * Each message can be several MB (code content, reasoning, etc.), so we process 2-3 at a time
 *
 * OPTIMIZATION: Uses indexed range query on _creationTime (automatically appended to every
 * Convex index) to efficiently skip already-processed messages. This reduces document reads
 * from ~145k (table scan with .filter()) to ~100 (only messages actually processed).
 */
export const deactivateMessagesBatch = internalMutation({
  args: {
    threadId: v.id("thread"),
    commitMessageTime: v.number(),
    lastCreationTime: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Process only 2 messages per batch to stay well under the 16MB limit
    // Even with massive code content, 2 messages should fit
    // OPTIMIZATION: Use range query on _creationTime (auto-appended to every index)
    // instead of .filter() to avoid table scans. We start from the rollback
    // boundary, so we only read the tail of the thread that needs patching.
    const batch = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q
          .eq("thread_id", args.threadId)
          .eq("streaming", false)
          .gt("_creationTime", args.lastCreationTime),
      )
      .order("asc")
      .take(2);

    if (batch.length === 0) {
      // Done processing all messages
      return null;
    }

    // Every message in this batch is already at or after the rollback point.
    for (const message of batch) {
      await ctx.db.patch(message._id, {
        deactivated: true,
      });
    }

    // Schedule the next batch immediately
    await ctx.scheduler.runAfter(0, internal.messages.deactivateMessagesBatch, {
      threadId: args.threadId,
      commitMessageTime: args.commitMessageTime,
      lastCreationTime: batch[batch.length - 1]._creationTime,
    });

    return null;
  },
});

/**
 * Deactivates a specific message and all messages after it in the thread
 * Used when user wants to undo a message that doesn't have a checkpoint yet
 */
export const deactivateMessageAndAfter = mutation({
  args: {
    messageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    // Terminate any active processing on the project
    await ctx.db.patch(message.project_id, {
      terminated: true,
      state: "active",
    });

    // Use the message's creation time to deactivate all messages from this point onwards
    const targetCreationTime = message._creationTime;

    // Deactivate this message and all messages after it using Convex pagination
    let continueCursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const result = await ctx.db
        .query("messages")
        .withIndex("by_project_and_date", (q) =>
          q.eq("project_id", message.project_id),
        )
        .order("asc")
        .paginate({ numItems: 100, cursor: continueCursor });

      for (const msg of result.page) {
        if (msg._creationTime >= targetCreationTime) {
          await ctx.db.patch(msg._id, {
            deactivated: true,
          });
        }
      }

      isDone = result.isDone;
      continueCursor = result.continueCursor;
    }

    return null;
  },
});

// File upload functions for images
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const deleteImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
  },
});

export const getMessages = internalQuery({
  args: {
    threadId: v.optional(v.id("thread")),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", args.threadId).eq("streaming", false),
      )
      .order("desc")
      .filter((q) => q.neq(q.field("deactivated"), true))
      .filter((q) => q.neq(q.field("isFastReturn"), true))
      .filter((q) => q.neq(q.field("exclude_from_agent_history"), true))
      .take(40);

    return messages.map(serializeMessageForSummary);
  },
});

export const getLatestFastReturnMessage = internalQuery({
  args: {
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    const fastReturnMessage = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", args.threadId).eq("streaming", false),
      )
      .order("desc")
      .filter((q) => q.eq(q.field("isFastReturn"), true))
      .filter((q) => q.neq(q.field("deactivated"), true))
      .first();

    return fastReturnMessage;
  },
});

export const getMostRecentAssistantMessage = internalQuery({
  args: {
    threadId: v.id("thread"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) =>
        q.eq("thread_id", args.threadId).eq("streaming", false),
      )
      .order("desc")
      .filter((q) => q.eq(q.field("role"), "assistant"))
      .filter((q) => q.neq(q.field("deactivated"), true))
      .filter((q) => q.neq(q.field("exclude_from_agent_history"), true))
      .first();

    return message;
  },
});
