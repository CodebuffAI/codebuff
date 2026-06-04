"use node";

import { internal } from "!/_generated/api";
import { ActionCtx } from "!/_generated/server";
import {
  ModelMessage,
  streamText,
  AssistantModelMessage,
  ToolModelMessage,
  ToolSet,
} from "ai";
import { Model } from "../../utils/registry_validators";
import { MODELS } from "../../utils/registry";
import { SharedContext } from "../context/assembly";
import { createTerminationQueryThrottler } from "../terminationThrottle";
import { AllToolCalls } from "./tools";
import {
  trackUsage,
  calculateUsdCostForModelUsage,
  convertUsdToCredits,
  getCustomerData,
  getTierFromCustomerData,
  applyTierMultiplier,
} from "../../../lib/autumn-api";
import type { TierName } from "../../../autumn/constants";

export type CallAgentWrapperArgs = {
  model: Model;
  coreMessages: ModelMessage[];
  toolSet: ToolSet;
  temperature?: number;
  modelCallStart: number;
  providerOptions?: any; // Custom provider options to pass to streamText
};

function isAssistantMessage(
  msg: AssistantModelMessage | ToolModelMessage,
): asserts msg is AssistantModelMessage {
  if (msg.role !== "assistant") {
    throw new Error("Agent returned a non-assistant message");
  }
}

function parseResponse(
  messages: (AssistantModelMessage | ToolModelMessage)[],
): {
  text?: string;
  toolCalls?: AllToolCalls;
} {
  if (messages.length === 0) {
    throw new Error("Agent returned no messages");
  }

  const assistantMessages = messages.filter(
    (message): message is AssistantModelMessage => message.role === "assistant",
  );

  if (assistantMessages.length === 0) {
    throw new Error(
      "Agent returned no assistant messages\n" + JSON.stringify(messages),
    );
  }

  const textParts: string[] = [];
  const toolCalls: AllToolCalls = [];

  for (const resultMessage of assistantMessages) {
    isAssistantMessage(resultMessage);
    const responseContent = resultMessage.content;

    if (Array.isArray(responseContent)) {
      for (const part of responseContent) {
        if (part.type === "text" && part.text.trim()) {
          textParts.push(part.text);
        }
        if (part.type === "tool-call") {
          toolCalls.push(part as AllToolCalls[number]);
        }
      }
      continue;
    }

    if (responseContent.trim()) {
      textParts.push(responseContent);
    }
  }

  return {
    text: textParts.length > 0 ? textParts.join("\n\n") : undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

function buildAssistantCoreMessage(args: {
  text?: string;
  toolCalls?: AllToolCalls;
}) {
  const sections: string[] = [];
  const textWithoutCode =
    args.text?.replace(/```[\s\S]*?```/g, "[code omitted after file write]") ??
    "";

  if (textWithoutCode.trim()) {
    sections.push(`Assistant response:\n${textWithoutCode.trim()}`);
  }

  if (args.toolCalls?.length) {
    sections.push(`Tool calls:\n${JSON.stringify(args.toolCalls, null, 2)}`);
  }

  return sections.filter(Boolean).join("\n\n").trim();
}

function getSemanticModelName(model: Model) {
  switch (String(model)) {
    case "GPT_5":
      return "OPENAI GPT 5";
    case "GPT_5_4":
      return "OPENAI GPT 5.4";
    case "GPT_5_4_MINI":
      return "OPENAI GPT 5.4 MINI";
    case "GPT_5_3_CODEX":
      return "OPENAI GPT 5.3 CODEX";
    case "GPT_5_4_NANO":
      return "OPENAI GPT 5.4 NANO";
    case "GPT_5_MINI":
      return "OPENAI GPT 5 MINI";
    case "GPT_5_NANO":
      return "OPENAI GPT 5 NANO";
    case "GEMINI_3_PRO":
      return "GOOGLE GEMINI 3.1 PRO";
    case "CLAUDE_BEDROCK":
      return "ANTHROPIC CLAUDE 4.6 SONNET";
    case "CLAUDE_OPUS_BEDROCK":
      return "ANTHROPIC CLAUDE 4.6 OPUS";
    case "GROK_4_FAST":
      return "XAI GROK 4 FAST";
    default:
      return String(model).replace(/_/g, " ");
  }
}

function extractUsageBreakdown(
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  },
  providerMetadata: any,
) {
  const anthropicMetadata = providerMetadata?.anthropic;
  const bedrockMetadata = providerMetadata?.bedrock;
  const cachedInputTokens =
    usage.cachedInputTokens ??
    anthropicMetadata?.usage?.cache_read_input_tokens ??
    bedrockMetadata?.usage?.cacheReadInputTokens ??
    0;
  const cacheWriteInputTokens =
    anthropicMetadata?.cacheCreationInputTokens ??
    bedrockMetadata?.usage?.cacheWriteInputTokens ??
    0;

  return {
    input_tokens: usage.inputTokens ?? 0,
    cached_input_tokens: cachedInputTokens,
    output_tokens: usage.outputTokens ?? 0,
    ...(usage.reasoningTokens !== undefined
      ? {
          reasoning_tokens: usage.reasoningTokens,
        }
      : {}),
    ...(cacheWriteInputTokens
      ? {
          cache_write_input_tokens: cacheWriteInputTokens,
        }
      : {}),
    ...(anthropicMetadata?.usage || bedrockMetadata?.usage
      ? {
          other: JSON.stringify({
            anthropic: anthropicMetadata?.usage,
            bedrock: bedrockMetadata?.usage,
          }),
        }
      : {}),
  };
}

function parseUsdCostCandidate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[$,]/g, "").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function extractUsdCostFromProviderMetadata(providerMetadata: unknown) {
  const matchedCosts: number[] = [];
  const costKeys = new Set([
    "cost",
    "costusd",
    "cost_usd",
    "totalcost",
    "totalcostusd",
    "total_cost",
    "total_cost_usd",
    "usdcost",
    "usd_cost",
  ]);

  const visit = (value: unknown, key?: string) => {
    if (key && costKeys.has(key.toLowerCase())) {
      const parsed = parseUsdCostCandidate(value);
      if (parsed !== undefined) {
        matchedCosts.push(parsed);
      }
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        visit(nestedValue, nestedKey);
      }
    }
  };

  visit(providerMetadata);

  if (matchedCosts.length === 0) {
    return undefined;
  }

  return Math.max(...matchedCosts);
}

function shouldUseProviderReportedCost(
  model: Model,
  providerReportedCostUsd: number | undefined,
  fallbackCostUsd: number,
) {
  if (
    providerReportedCostUsd === undefined ||
    !Number.isFinite(providerReportedCostUsd) ||
    providerReportedCostUsd <= 0
  ) {
    return false;
  }

  // Claude/Bedrock pricing is more reliable from our explicit token pricing table
  // than from arbitrary provider metadata fields that may not represent raw USD cost.
  if (String(model).includes("CLAUDE")) {
    return false;
  }

  if (fallbackCostUsd <= 0) {
    return true;
  }

  const ratio = providerReportedCostUsd / fallbackCostUsd;
  return ratio >= 0.25 && ratio <= 4;
}

function isTruthyEnvFlag(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function shouldCaptureDebugPrompt(sharedContext: SharedContext) {
  if (isTruthyEnvFlag(process.env.DEBUG)) {
    return true;
  }

  const deploymentName = process.env.CONVEX_DEPLOYMENT ?? "";
  const publicNodeEnv = process.env.NEXT_PUBLIC_NODE_ENV ?? "";
  const isDevDeployment =
    deploymentName.startsWith("dev:") || deploymentName.startsWith("local:");
  const isExplicitDevMode =
    publicNodeEnv === "dev" || publicNodeEnv === "development";
  const isNonProductionNodeEnv = process.env.NODE_ENV !== "production";

  return (
    sharedContext.executingUserIsPlatformAdmin &&
    (isDevDeployment || isExplicitDevMode || isNonProductionNodeEnv)
  );
}

function stringifyDebugPromptContent(content: ModelMessage["content"]) {
  if (typeof content === "string") {
    return content;
  }

  return JSON.stringify(content, null, 2);
}

function serializeDebugPromptCapture(coreMessages: ModelMessage[]) {
  return coreMessages
    .map((message, index) => {
      const roleLabel = String(message.role).toUpperCase();
      return `<PROMPT_MESSAGE index="${index}" role="${roleLabel}">
${stringifyDebugPromptContent(message.content)}
</PROMPT_MESSAGE>`;
    })
    .join("\n\n");
}

export const callAgentWrapper = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
  args: CallAgentWrapperArgs,
): Promise<{
  text?: string;
  toolCalls?: AllToolCalls;
  terminated?: boolean;
}> => {
  const shouldBypassCreditTracking = sharedContext.executingUserIsPlatformAdmin;
  let projectOwner: { clerk_id: string } | null = null;
  let customerId: string | undefined;

  // Get user's tier for credit multiplier
  let userTier: TierName = "free";
  if (!shouldBypassCreditTracking) {
    // Get the project owner's info for usage tracking
    // Note: Credit check is done ONCE in trigger.ts when user sends a message,
    // not on every agent turn. This wrapper only handles usage tracking.
    projectOwner = await ctx.runQuery(internal.users.get, {
      userId: sharedContext.projectOwnerId,
    });

    if (!projectOwner) {
      throw new Error("Project owner not found");
    }

    // Use organization_id for usage tracking if present, otherwise use user's clerk_id
    customerId = sharedContext.project.organization_id || projectOwner.clerk_id;

    if (!customerId) {
      throw new Error("Customer ID not found for billing");
    }

    try {
      const customerData = await getCustomerData(customerId);
      userTier = getTierFromCustomerData(customerData);
      console.log(`🎯 User tier detected: ${userTier}`);
    } catch (tierError) {
      console.warn("Failed to get user tier, defaulting to free:", tierError);
      userTier = "free";
    }
  }

  await sharedContext.consoleLog(
    `[Wrapper] Starting agent call with model: ${args.model}${shouldBypassCreditTracking ? " (billing bypass: platform admin)" : ` (Tier: ${userTier})`}`,
    "agent",
    {
      modelName: args.model,
      messageCount: args.coreMessages.length,
      temperature: args.temperature,
      billingBypass: shouldBypassCreditTracking,
      ...(shouldBypassCreditTracking ? {} : { userTier }),
    },
  );

  // Set the semantic model name on the assistant message before streaming starts
  try {
    const internalName = String(args.model);
    if (internalName !== "GEMINI_2_5_FLASH_LITE") {
      await ctx.runMutation(internal.messages.updateModelSemanticName, {
        messageId: sharedContext.assistantMessageId,
        modelSemanticName: getSemanticModelName(args.model),
      });
    }
  } catch {
    // non-fatal; continue
  }

  const checkTerminatedThrottled = createTerminationQueryThrottler(
    sharedContext.project._id,
  );
  const checkTerminated = async () => {
    const terminated = await checkTerminatedThrottled(ctx);
    if (terminated) {
      await sharedContext.consoleLog(
        "[Wrapper] Project terminated, stopping agent",
        "agent",
      );
      return true;
    }
    return false;
  };

  await sharedContext.consoleLog(
    "[Agent] Core messages assembled, starting stream",
  );

  const resolvedProviderOptions = args.providerOptions ?? {
    openai: {
      reasoningEffort: "low",
      reasoningSummary: "detailed",
    },
    // google: {
    //   thinkingConfig: {
    //     thinkingBudget: 2048,
    //     includeThoughts: true,
    //   },
    // },
  };

  if (shouldCaptureDebugPrompt(sharedContext)) {
    await ctx.runMutation(internal.messages.appendDebugPromptLog, {
      messageId: sharedContext.assistantMessageId,
      log: serializeDebugPromptCapture(args.coreMessages),
    });
  }

  const stream = streamText({
    model: MODELS.PRIMARY_MODELS[args.model],
    messages: args.coreMessages,
    tools: args.toolSet,
    temperature: args.temperature ?? 0,
    maxOutputTokens: 30000,
    // Add structured outputs configuration for GPT-5 reasoning models
    // ...(args.model === "GPT_5" || args.model === "O3"
    //   ? {
    //       experimental_toolCallMode: "auto",
    //       experimental_providerMetadata: {
    //         openai: {
    //           reasoningEffort: "medium",
    //           //textVerbosity: "low",
    //         },
    //       },
    //     }
    //   : {}),
    providerOptions: resolvedProviderOptions,
  });

  let chunkCount = 1;
  let reasoningChunkCount = 0;
  let textDeltaBuffer = "";
  let firstChunk = true;
  let reasoningBuffer = "";
  let isInCodeblock = false;
  let codeblockStartIndex = -1;
  let lastSearchIndex = 0;
  let lastContentUpdate = 0; // For time-based debouncing
  let hasShownCodeblockPlaceholder = false;
  const toolCallsArray: any[] = [];
  const CONTENT_UPDATE_INTERVAL_MS = 250;

  // Use a longer update interval for efficient and cheap models to reduce concurrency issues
  // Reserved for future use - check if the model format is a "lite" or "fast" variant
  // const modelName = String(args.model);
  // const isEfficientOrCheapModel =
  //   modelName.includes("FLASH_LITE") ||
  //   modelName.includes("LITE") ||
  //   modelName.includes("FAST") ||
  //   modelName.includes("HAIKU") ||
  //   modelName.includes("NANO") ||
  //   modelName.includes("MINI") ||
  //   modelName === "GLM_4_6" ||
  //   modelName === "KIMI_K2";
  // const updateInterval = isEfficientOrCheapModel ? 15 : 5;

  for await (const chunk of stream.fullStream) {
    if (firstChunk) {
      // Update message state to streaming
      await ctx.runMutation(internal.messages.updateMessageState, {
        messageId: sharedContext.assistantMessageId,
        status: "streaming",
        message: "Generating response",
      });

      await sharedContext.consoleLog(
        "[Agent] First chunk received: " + chunk.type,
      );
      firstChunk = false;
    }
    if (chunk.type === "reasoning-delta") {
      // Accumulate reasoning tokens and stream the full buffer to thinking field
      reasoningChunkCount++;
      const isFirstReasoningChunk = reasoningBuffer === "";
      reasoningBuffer += chunk.text;

      // Update thinking content only every 5 chunks (or on first chunk)
      // OPTIMIZATION: Use combined mutation when updating both state and content
      if (
        isFirstReasoningChunk ||
        reasoningChunkCount < 3 ||
        reasoningChunkCount % 20 === 0
      ) {
        if (isFirstReasoningChunk) {
          // First reasoning chunk - set both status and content
          await ctx.runMutation(
            internal.messages.updateMessageContentAndState,
            {
              messageId: sharedContext.assistantMessageId,
              thinking: reasoningBuffer,
              status: "thinking",
              statusMessage: "Analyzing and reasoning",
            },
          );
        } else {
          // Subsequent updates - just update content
          await ctx.runMutation(internal.messages.updateMessageContent, {
            messageId: sharedContext.assistantMessageId,
            thinking: reasoningBuffer,
          });
        }
      }
    }
    if (chunk.type === "tool-input-start") {
      const toolCallObject = {
        type: "tool-call",
        toolName: chunk.toolName,
        toolCallId: chunk.id,
        input: {},
      };
      await ctx.runMutation(internal.messages.updateMessageContent, {
        messageId: sharedContext.assistantMessageId,
        object: JSON.stringify([...toolCallsArray, toolCallObject]),
        streaming: false,
      });
    }

    if (chunk.type === "tool-call") {
      // Create the tool call object
      const toolCallObject = {
        type: "tool-call",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        input: chunk.input,
      };

      // Append the new tool call to the local array
      toolCallsArray.push(toolCallObject);

      await ctx.runMutation(internal.messages.updateMessageContent, {
        messageId: sharedContext.assistantMessageId,
        object: JSON.stringify(toolCallsArray),
        streaming: false,
      });
    }

    if (chunk.type === "error") {
      console.error(chunk.error);

      const errorMessage = JSON.stringify(chunk.error, null, 2);
      const isRateLimit = errorMessage.toLowerCase().includes("rate limit");
      const displayMessage = isRateLimit
        ? "Rate limit encountered. Please try again in a minute or contact support."
        : `Error occurred: ${chunk.error}`;

      // Update message state to error with descriptive message
      await ctx.runMutation(internal.messages.updateMessageState, {
        messageId: sharedContext.assistantMessageId,
        status: "error",
        message: displayMessage,
      });

      // Don't update message content with error messages - only update state

      await sharedContext.consoleLog(
        "[Agent] Error received:\n" + errorMessage,
      );

      console.log(`[Cycle] Rate Limit or Error: ${errorMessage}`, {
        error: errorMessage,
      });
      console.error("Rate limit or error occured during the cycle");
      console.error(errorMessage);

      if (isRateLimit) {
        throw new Error(`Rate Limit hit: (${errorMessage})`);
      }
      throw new Error(`Agent Error hit: (${errorMessage})`);
    }

    if (chunk.type === "text-delta") {
      chunkCount++;
      textDeltaBuffer += chunk.text;

      // Check if we're entering a codeblock (search from last known position)
      if (!isInCodeblock) {
        const searchText = textDeltaBuffer.substring(lastSearchIndex);
        const fileOperationMatch = searchText.match(
          /(EDIT FILE|CREATE FILE|REPLACE FILE)\n```(?:[^\n]*\n|$)/,
        );
        if (fileOperationMatch) {
          isInCodeblock = true;
          codeblockStartIndex =
            lastSearchIndex +
            fileOperationMatch.index! +
            fileOperationMatch[0].length;
        }
      }

      // Check if we're exiting a codeblock
      if (isInCodeblock) {
        const contentAfterStart =
          textDeltaBuffer.substring(codeblockStartIndex);
        if (contentAfterStart.includes("```")) {
          isInCodeblock = false;
          lastSearchIndex =
            codeblockStartIndex + contentAfterStart.indexOf("```") + 3;
          codeblockStartIndex = -1;
        }
      }

      // OPTIMIZATION: Time-based debouncing (100ms) instead of chunk-based
      // Reduces updateMessageContent calls from ~153k/day to ~40k/day (~$2.23/day savings)
      const now = Date.now();
      const timeSinceLastUpdate = now - (lastContentUpdate || 0);
      const shouldUpdate =
        chunkCount < 2 || timeSinceLastUpdate >= CONTENT_UPDATE_INTERVAL_MS;

      if (shouldUpdate) {
        if (isInCodeblock) {
          if (!hasShownCodeblockPlaceholder) {
            const beforeCodeblock = textDeltaBuffer.substring(
              0,
              codeblockStartIndex,
            );
            await ctx.runMutation(internal.messages.updateMessageContent, {
              messageId: sharedContext.assistantMessageId,
              content: beforeCodeblock + "\n\nWriting files...",
            });
            lastContentUpdate = now;
            hasShownCodeblockPlaceholder = true;
          }
        } else {
          hasShownCodeblockPlaceholder = false;

          await ctx.runMutation(internal.messages.updateMessageContent, {
            messageId: sharedContext.assistantMessageId,
            content: textDeltaBuffer,
          });
          lastContentUpdate = now;
        }
      }
      if (chunkCount % 10 === 0) {
        if (await checkTerminated()) {
          return {
            terminated: true,
          };
        }
      }
    }
  }
  if (await checkTerminated()) {
    return {
      terminated: true,
    };
  }

  await sharedContext.consoleLog(
    "[Agent] Stream complete, processing final response",
  );

  // process the final response
  const finalResponse = await stream.response;

  const parsedResponse = parseResponse(finalResponse.messages);
  const totalUsage = await stream.totalUsage;
  const providerMetadata = await stream.providerMetadata;
  const usageBreakdown = extractUsageBreakdown(totalUsage, providerMetadata);
  const providerReportedCostUsd =
    extractUsdCostFromProviderMetadata(providerMetadata);
  const fallbackCostUsd = calculateUsdCostForModelUsage({
    model: args.model,
    inputTokens: totalUsage.inputTokens ?? 0,
    outputTokens: totalUsage.outputTokens ?? 0,
    cachedInputTokens: usageBreakdown.cached_input_tokens,
    cacheWriteInputTokens: usageBreakdown.cache_write_input_tokens,
  });
  const totalCostUsd = shouldUseProviderReportedCost(
    args.model,
    providerReportedCostUsd,
    fallbackCostUsd,
  )
    ? providerReportedCostUsd!
    : fallbackCostUsd;

  if (
    providerReportedCostUsd !== undefined &&
    totalCostUsd !== providerReportedCostUsd
  ) {
    console.warn("[CostTracking] Ignoring provider-reported USD cost", {
      model: args.model,
      providerReportedCostUsd,
      fallbackCostUsd,
      usageBreakdown,
    });
  }

  await sharedContext.consoleLog(
    "[Agent] Final response parsed, processing results",
  );

  // save to db
  await ctx.runMutation(internal.messages.updateMessageContent, {
    messageId: sharedContext.assistantMessageId,
    content: parsedResponse.text ?? "",
    coreMessage: buildAssistantCoreMessage({
      text: parsedResponse.text,
      toolCalls: parsedResponse.toolCalls,
    }),
    object: JSON.stringify(parsedResponse.toolCalls),
    streaming: false,
  });

  console.log("Provider", providerMetadata);

  await ctx.runMutation(internal.messages.recordTokenUsage, {
    messageId: sharedContext.assistantMessageId,
    tokenUsage: {
      input_tokens: totalUsage.inputTokens ?? 0,
      output_tokens: totalUsage.outputTokens ?? 0,
      model: args.model,
    },
    providerMetadata: JSON.stringify(providerMetadata ?? null),
    cachedTokens: usageBreakdown.cached_input_tokens,
    totalCostUsd,
    usageBreakdown,
  });

  const baseCredits = convertUsdToCredits(totalCostUsd);

  if (shouldBypassCreditTracking) {
    console.log(
      `[CreditTracking] Skipping credit deduction for admin-executed project message`,
      {
        projectId: sharedContext.project._id,
        assistantMessageId: sharedContext.assistantMessageId,
        model: args.model,
        baseCredits,
      },
    );
  } else {
    // Apply tier-based multiplier (lower tiers pay more)
    const adjustedCredits = applyTierMultiplier(baseCredits, userTier);

    // Log detailed credit breakdown for monitoring
    console.log(
      `💰 Credit calculation breakdown:`,
      `\n  Model: ${args.model}`,
      `\n  Input tokens: ${totalUsage.inputTokens ?? 0}`,
      `\n  Cached input tokens: ${usageBreakdown.cached_input_tokens ?? 0}`,
      `\n  Output tokens: ${totalUsage.outputTokens ?? 0}`,
      `\n  USD cost: ${totalCostUsd}`,
      `\n  Base credits: ${baseCredits}`,
      `\n  User tier: ${userTier}`,
      `\n  Adjusted credits (after multiplier): ${adjustedCredits}`,
    );

    // Track usage with model metadata
    const trackResult = await trackUsage(
      customerId!,
      adjustedCredits,
      undefined, // use default feature_id
      {
        model: args.model,
        inputTokens: totalUsage.inputTokens ?? 0,
        cachedInputTokens: usageBreakdown.cached_input_tokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
        reasoningTokens: totalUsage.reasoningTokens ?? 0,
        cacheWriteInputTokens: usageBreakdown.cache_write_input_tokens ?? 0,
        totalCostUsd,
        baseCreditsFromUsd: baseCredits,
        tierMultiplier: userTier,
        creditsCharged: adjustedCredits,
        projectId: sharedContext.project._id,
      },
    );

    if (trackResult.success) {
      console.log(
        "✅ Successfully tracked",
        adjustedCredits,
        `credits (base: ${baseCredits}, tier: ${userTier}) for`,
        sharedContext.project.organization_id
          ? `organization ${sharedContext.project.organization_id}`
          : `user ${projectOwner!.clerk_id}`,
      );

      // Store the actual credits deducted on the message for display
      await ctx.runMutation(internal.messages.updateCreditsDeducted, {
        messageId: sharedContext.assistantMessageId,
        creditsDeducted: adjustedCredits,
      });
    } else {
      console.error("Failed to track credit usage:", trackResult.error);
      // Don't fail the whole operation if tracking fails
    }
  }

  await sharedContext.consoleLog(
    `[Wrapper] Agent call completed successfully`,
    "agent",
    {
      hasText: !!parsedResponse.text,
      hasToolCalls: !!parsedResponse.toolCalls?.length,
      toolCallCount: parsedResponse.toolCalls?.length || 0,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      cachedInputTokens: usageBreakdown.cached_input_tokens,
      totalCostUsd,
    },
  );

  return { ...parsedResponse };
};
