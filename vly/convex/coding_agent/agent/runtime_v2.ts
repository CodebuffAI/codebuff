"use node";

import { internal } from "!/_generated/api";
import { ActionCtx } from "!/_generated/server";
import { Model } from "!/utils/registry_validators";
import { pickToolSet } from "./tools";
import { SharedContext } from "../context/assembly";
import { getContextLengthPreset } from "../config/contextLengthPresets";
import { getPromptPieces } from "./process/prompt_pieces";
import {
  createOrEditFilesBlockInstructions,
  getCoreSystemPrompt,
  secondCreateOrEditFilesBlockInstructions,
} from "./process/system_prompts";
import { hasPackageManager } from "../../../codebase-utils/codebase/Codebase";
import {
  buildPromptMessages,
  getPromptCacheKey,
} from "./process/prompt_assembly_v2";
import { callAgentWrapper, type CallAgentWrapperArgs } from "./wrapper";
import { ToolSet } from "ai";

type RuntimeConfig = {
  modelOrder: Model[];
  temperature: number;
  objectives: string;
  providerOptions?: CallAgentWrapperArgs["providerOptions"];
  toolSet: ToolSet;
};

const CODING_TOOL_SET = pickToolSet(
  "readFilesToContextTool",
  "semanticFileSearchTool",
  "scrapeLinksTool",
  "executeCommandTool",
  "externalSearchesTool",
  "addIntegrationTool",
  "searchUiPresetsTool",
);

const PLANNING_TOOL_SET = pickToolSet(
  "readFilesToContextTool",
  "semanticFileSearchTool",
  "scrapeLinksTool",
  "executeCommandTool",
  "externalSearchesTool",
  "searchUiPresetsTool",
);

const MODE_CONFIGS: Record<string, RuntimeConfig> = {
  POWERFUL: {
    modelOrder: ["CLAUDE_BEDROCK"],
    temperature: 0,
    toolSet: CODING_TOOL_SET,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 4096 },
      },
    },
    objectives: `You are the strongest coding mode.
- Work in a simple tool loop: inspect, then edit, then finish.
- Prefer one clean implementation pass over repeated partial edits.
- When you already have enough context, write the code and stop.`,
  },
  PRECISE: {
    modelOrder: ["GPT_5_4", "GPT_5_3_CODEX"],
    temperature: 0,
    toolSet: CODING_TOOL_SET,
    objectives: `You are the precision mode focused on correctness.
- Be strict about matching existing code patterns.
- Prefer smaller, more exact edits and use precise replacements when helpful.
- If a type check fails, fix the real cause instead of patching around it.`,
  },
  EFFICIENT: {
    modelOrder: ["GPT_5_4_MINI"],
    temperature: 0.2,
    toolSet: CODING_TOOL_SET,
    objectives: `You are the balanced speed and quality mode.
- Keep the path simple and direct.
- Avoid unnecessary exploration once the relevant files are known.
- Finish the task with the minimum number of tool rounds.`,
  },
  CHEAP: {
    modelOrder: ["GPT_5_4_NANO"],
    temperature: 0.3,
    toolSet: CODING_TOOL_SET,
    objectives: `You are the low-cost mode.
- Keep the solution practical and avoid over-engineering.
- Use tools sparingly but read the exact files you need before editing.
- If the problem is too complex, gather the right context and make the best direct fix you can.`,
  },
  STANDARD: {
    modelOrder: ["GLM_5"],
    temperature: 0.2,
    toolSet: CODING_TOOL_SET,
    objectives: `You are the standard mode.
- Reason carefully enough to avoid regressions.
- Use the codebase structure first, then read exact files, then edit.
- Keep changes scoped and production-minded.`,
  },
  OPUS: {
    modelOrder: ["CLAUDE_OPUS_BEDROCK"],
    temperature: 0,
    toolSet: CODING_TOOL_SET,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 8192 },
      },
    },
    objectives: `You are the deepest reasoning mode.
- Use extra analysis only when it materially improves the result.
- Favor correctness and architecture over speed.
- Still follow the simple inspect -> edit -> finish loop.`,
  },
  PLANNING: {
    modelOrder: ["GPT_5_1_CODEX", "GPT_CODEX"],
    temperature: 0.1,
    toolSet: PLANNING_TOOL_SET,
    objectives: `You are the planning-only mode.
- You may read files and search the codebase, but do not write code.
- Produce concrete implementation guidance based on the files you inspected.
- Finish once the plan is complete; do not loop.`,
  },
};

export const PROMPT_BASE_STRUCTURE = `Prompt assembly order:
1. system prompt
2. deterministic serialized prompt sections in order
   - static context
     - knowledge sets
     - assets context
     - project integrations
     - user information
     - project specification
     - codebase structure / static code references
   - compacted chat history summary of older messages, if present
   - raw chat history chunks in chronological order, including the newest persisted user message
   - in-action continuation messages
     - assistant step output
     - environment feedback (tool results / file apply results / type check)

Follow preserved user instructions, preferences, and constraints even when older history has been summarized.`;

const STATIC_CONTEXT_SECTION_BUILDERS = [
  "knowledgeSets",
  "assetsContext",
  "projectIntegrationsPrompt",
  "userInformation",
  "projectSpecification",
  "filesInCodebase",
] as const;

function buildStaticContext(promptPieces: ReturnType<typeof getPromptPieces>) {
  return STATIC_CONTEXT_SECTION_BUILDERS.map(
    (sectionName) => promptPieces[sectionName],
  )
    .filter(Boolean)
    .join("\n\n");
}

export async function runAgentIteration(
  ctx: ActionCtx,
  sharedContext: SharedContext,
) {
  const contextPreset = getContextLengthPreset(sharedContext.contextLength);
  const promptPieces = getPromptPieces(
    sharedContext,
    contextPreset.fileTokensInContext,
  );
  const packageManagerName = hasPackageManager(sharedContext.codebase)
    ? sharedContext.codebase.getPackageManagerName()
    : "pnpm";
  const runtimeConfig =
    MODE_CONFIGS[sharedContext.model] ?? MODE_CONFIGS.POWERFUL;

  const systemPrompt = `${getCoreSystemPrompt(packageManagerName)}
${createOrEditFilesBlockInstructions}
${secondCreateOrEditFilesBlockInstructions}

<prompt_structure>
${PROMPT_BASE_STRUCTURE}
</prompt_structure>

<model_objectives>
${runtimeConfig.objectives}
</model_objectives>`;

  const promptMessages = await buildPromptMessages({
    ctx,
    sharedContext,
    systemPrompt,
    staticContext: buildStaticContext(promptPieces),
  });

  const providerOptions = {
    ...(runtimeConfig.providerOptions ?? {}),
    openai: {
      reasoningEffort: "low",
      reasoningSummary: "detailed",
      promptCacheKey: getPromptCacheKey(sharedContext),
      promptCacheRetention: "24h" as const,
      store: false,
    },
  };

  let lastError: Error | null = null;

  for (const [index, model] of runtimeConfig.modelOrder.entries()) {
    try {
      return await callAgentWrapper(ctx, sharedContext, {
        model,
        coreMessages: promptMessages,
        toolSet: runtimeConfig.toolSet,
        temperature: runtimeConfig.temperature,
        modelCallStart: Date.now(),
        providerOptions,
      });
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(String(error ?? "Unknown error"));

      await sharedContext.consoleLog(
        `[RuntimeV2] Model ${model} failed`,
        "agent",
        {
          error: lastError.message,
          fallbackIndex: index,
        },
      );

      const isInsufficientCredits = lastError.message
        .toLowerCase()
        .includes("insufficient credits");
      const isLastModel = index === runtimeConfig.modelOrder.length - 1;

      if (isInsufficientCredits) {
        await ctx.runMutation(internal.messages.updateMessageState, {
          messageId: sharedContext.assistantMessageId,
          status: "error",
          message:
            "You've run out of credits. Please add more credits to continue.",
        });
        throw lastError;
      }

      if (!isLastModel) {
        await ctx.runMutation(internal.messages.updateMessageState, {
          messageId: sharedContext.assistantMessageId,
          status: "thinking",
          message: `Model ${model} failed. Trying fallback model ${runtimeConfig.modelOrder[index + 1]}.`,
        });
      }
    }
  }

  throw lastError ?? new Error("All candidate models failed");
}
