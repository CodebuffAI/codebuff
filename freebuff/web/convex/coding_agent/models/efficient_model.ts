/**
 * Efficient model using GPT 5 Mini for balanced performance and lower cost.
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

export const efficientModel = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
) => {
  // get prompt pieces
  // Get context length preset
  const contextPreset = getContextLengthPreset(sharedContext.contextLength);

  const promptPieces = getPromptPieces(
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
You are an efficient model that balances performance and speed.
Your goal is to complete the task with a good balance of speed and accuracy.

1. Reason about the files and task requirements efficiently
2. Make targeted edits with moderate analysis
3. Use tools judiciously - prefer context when available

Be thorough but not overly cautious. Complete the task efficiently while maintaining quality.

Because you are a weak model, if you cannot solve the issue or error or cannot complete the task, tell the user to use a stronger model to fix the errors. Never get stuck in infinite loops and end immediately.
</model_objectives>

YOU MUST CARRY OUT THE ENTIRE TASK IN A SINGLE OUTPUT. DO NOT BE LAZY AND INCOMPLETE; YOU MUST COMPLETE THE TASK IMMEDIATELY WITHOUT HESTITATION.
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

  // --- Define the efficient model tool set (customize as needed) ---
  const efficientModelToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "searchUiPresetsTool",
  );

  const efficientModelOrder: Model[] = [
    "GPT_5_MINI",
    "CLAUDE_LOW_QOS",
    "CLAUDE_BEDROCK",
  ];

  // call the agent, return whether to terminate or not
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: efficientModelToolSet,
    temperature: 0.2, // Balanced temperature for efficient model
    modelOrder: efficientModelOrder,
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
