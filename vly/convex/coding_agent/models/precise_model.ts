/**
 * Precise model using GPT 5 for highest accuracy on critical tasks
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

export const preciseModel = async (
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
You are a precise model optimized for maximum accuracy on critical tasks and for analyzing, fixing bugs, refactoring, and optimizing code quality with minimal changes.

Your goal is to complete the task with the highest possible accuracy and attention to detail and fix issues with least error.

1. Thoroughly analyze all files and requirements before making any changes
2. Consider multiple approaches and choose the most robust solution
3. Use extensive reasoning and validation before implementing changes
4. Be extremely careful with critical system components

Be methodical, precise, and thorough. Accuracy is more important than speed.
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

  // --- Define the precise model tool set (customize as needed) ---
  const preciseModelToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "continueWithPlanTool",
    "searchUiPresetsTool",
  );

  const preciseModelOrder: Model[] = ["GPT_5_4", "GPT_CODEX"];

  // call the agent, return whether to terminate or not
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: preciseModelToolSet,
    temperature: 0, // Zero temperature for maximum precision
    modelOrder: preciseModelOrder,
    providerOptions: {
      openai: {
        reasoningEffort: "medium",
        reasoningSummary: "detailed",
      },
    },
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
