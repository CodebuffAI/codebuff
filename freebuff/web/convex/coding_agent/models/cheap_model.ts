/**
 * Cheap model using Grok 4 Fast for cost-effective basic tasks
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

export const cheapModel = async (
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
You are a cost-effective model optimized for basic tasks. You have been given a list of relevant files and their contents, as well as a specific and detailed task to perform.

Your goal is to complete basic tasks efficiently with minimal cost.

1. Focus on straightforward solutions for simple tasks
2. Avoid complex reasoning or extensive analysis
3. Use the most direct approach to complete the task
4. Minimize tool usage and prefer simple edits

Be practical and cost-effective. Complete basic tasks efficiently without over-engineering.

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

  // --- Define the cheap model tool set (customize as needed) ---
  const cheapModelToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "continueWithPlanTool",
    "searchUiPresetsTool",
  );

  const cheapModelOrder: Model[] = [
    "GLM_4_7",
    "CLAUDE_BEDROCK",
    "GLM_4_6",
    "GROK_4_1_FAST",
  ];

  // call the agent, return whether to terminate or not
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: cheapModelToolSet,
    temperature: 0.3, // Slightly higher temperature for cheaper model
    modelOrder: cheapModelOrder,
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
