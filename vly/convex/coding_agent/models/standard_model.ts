/**
 * Standard model using GLM 5 for baseline-priced tasks (1x pricing)
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

export const standardModel = async (
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
You are a capable model that provides solid performance at standard pricing. You have been given a list of relevant files and their contents, as well as a specific task to perform.

Your goal is to complete tasks with good quality and thoroughness.

1. Reason carefully about the files and task requirements
2. Make targeted, well-considered edits
3. Use tools judiciously - prefer context when available
4. Provide thorough solutions without excessive overhead

Be thorough and reliable. Complete the task efficiently while maintaining quality.

If you cannot solve the issue or error or cannot complete the task, tell the user to use a stronger model. Never get stuck in infinite loops. End immediately if stuck.
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

  const standardModelToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "continueWithPlanTool",
    "searchUiPresetsTool",
  );

  const standardModelOrder: Model[] = ["GLM_5", "CLAUDE_BEDROCK"];

  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: standardModelToolSet,
    temperature: 0.2,
    modelOrder: standardModelOrder,
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
