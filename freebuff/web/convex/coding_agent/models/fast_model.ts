/**
 * Fast model using Claude Haiku for quick responses
 */

"use node";

import { ActionCtx } from "!/_generated/server";
import { SharedContext } from "../context/assembly";
import { compactMessagesWithThresholdsXML } from "../agent/process/compact_messages_xml";
import { getPromptPieces } from "../agent/process/prompt_pieces";
import { getContextLengthPreset } from "../config/contextLengthPresets";
import { pickToolSet } from "../agent/tools";
import { Model } from "!/utils/registry_validators";
import { handleAgentCall } from "../agent/handle_turn";
import {
  getCoreSystemPrompt,
  createOrEditFilesBlockInstructions,
  secondCreateOrEditFilesBlockInstructions,
} from "../agent/process/system_prompts";
import { hasPackageManager } from "../../../codebase-utils/codebase/Codebase";

export const fastModel = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
) => {
  // get prompt pieces
  // Get context length preset
  const contextPreset = getContextLengthPreset(sharedContext.contextLength);

  const promptPieces = await getPromptPieces(
    sharedContext,
    contextPreset.fileTokensInContext,
  );

  const packageManagerName = hasPackageManager(sharedContext.codebase)
    ? sharedContext.codebase.getPackageManagerName()
    : "pnpm";
  const systemPrompt = `${getCoreSystemPrompt(packageManagerName)}
${createOrEditFilesBlockInstructions}
${promptPieces.knowledgeSets}
${promptPieces.assetsContext}
${promptPieces.projectIntegrationsPrompt}
${promptPieces.userInformation}
${promptPieces.projectSpecification}
${secondCreateOrEditFilesBlockInstructions}


<model_objectives>
You are a fast model optimized for quick responses and simple tasks. You have been given a list of relevant files and their contents, as well as a specific and detailed task to perform.

Your goal is to complete the task quickly with minimal reasoning overhead.

1. Focus on the most straightforward approach to complete the task
2. Make quick, targeted edits without extensive analysis
3. Avoid calling unnecessary tools - use the context provided

Be efficient and complete the task as quickly as possible while maintaining accuracy.

Because you are a weak model, if you cannot solve the issue or error or cannot complete the task, tell the user to use a stronger model to fix the errors. Never get stuck in infinite loops. Never get stuck in infinite loops and end immediately.

</model_objectives>
    `;

  // get core messages which also takes in the codebase context
  const coreMessages = await compactMessagesWithThresholdsXML(
    sharedContext.messages,
    ctx,
    systemPrompt,
    promptPieces.filesInCodebase + promptPieces.codebaseFilesPrompt,
    sharedContext,
    contextPreset.chatThresholds.firstThreshold,
    contextPreset.chatThresholds.secondThreshold,
    contextPreset.chatThresholds.thirdThreshold,
  );

  // --- Define the fast model tool set (customize as needed) ---
  const fastModelToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "searchUiPresetsTool",
  );

  const fastModelOrder: Model[] = ["CLAUDE_BEDROCK", "CLAUDE_LOW_QOS"];

  // call the agent, return whether to terminate or not
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: fastModelToolSet,
    temperature: 0,
    modelOrder: fastModelOrder,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 4096 },
      },
    },
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
