/**
 * Ultra Cheap model using GLM 4.7 Flash X for extremely cost-effective basic tasks
 * Backup: Claude Sonnet
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

export const ultraCheapModel = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
) => {
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
You are an ultra cost-effective model optimized for simple tasks. You have been given a list of relevant files and their contents, as well as a specific task to perform.

Your goal is to complete simple tasks with minimal cost.

1. Focus on straightforward solutions for simple tasks
2. Avoid complex reasoning or extensive analysis
3. Use the most direct approach to complete the task
4. Minimize tool usage and prefer simple edits
5. If the task is too complex, recommend the user switch to a stronger model

Be practical and extremely cost-effective. Complete basic tasks efficiently without over-engineering.

Because you are an ultra-cheap model, if you cannot solve the issue or error or cannot complete the task, tell the user to use a stronger model. Never get stuck in infinite loops. End immediately if stuck.
</model_objectives>
    `;

  // Get core messages which also takes in the codebase context
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

  // Define the ultra cheap model tool set (minimal tools for cost efficiency)
  const ultraCheapModelToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "continueWithPlanTool",
    "searchUiPresetsTool",
  );

  // Model order: GLM 4.7 Flash X primary, Claude Sonnet as backup
  const ultraCheapModelOrder: Model[] = ["GLM_4_7_FLASHX", "CLAUDE_BEDROCK"];

  // Call the agent, return whether to terminate or not
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: ultraCheapModelToolSet,
    temperature: 0.3,
    modelOrder: ultraCheapModelOrder,
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
