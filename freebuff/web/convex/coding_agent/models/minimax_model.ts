/**
 * MiniMax model using MiniMax M2.5 for cost-effective tasks (3x cheaper)
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

export const minimaxModel = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
) => {
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
You are a cost-effective model optimized for efficient task completion. You have been given a list of relevant files and their contents, as well as a specific task to perform.

Your goal is to complete tasks efficiently with good quality at low cost.

1. Focus on practical, straightforward solutions
2. Use moderate reasoning for task analysis
3. Use the most direct approach to complete the task
4. Minimize tool usage and prefer simple edits

Be practical and cost-effective. Complete tasks efficiently without over-engineering.

Because you are a budget model, if you cannot solve the issue or error or cannot complete the task, tell the user to use a stronger model. Never get stuck in infinite loops. End immediately if stuck.
</model_objectives>

YOU MUST CARRY OUT THE ENTIRE TASK IN A SINGLE OUTPUT. DO NOT BE LAZY AND INCOMPLETE; YOU MUST COMPLETE THE TASK IMMEDIATELY WITHOUT HESTITATION.
    `;

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

  const minimaxModelToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "continueWithPlanTool",
    "searchUiPresetsTool",
  );

  const minimaxModelOrder: Model[] = ["MINIMAX_M2_5", "CLAUDE_BEDROCK"];

  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: minimaxModelToolSet,
    temperature: 0.3,
    modelOrder: minimaxModelOrder,
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
