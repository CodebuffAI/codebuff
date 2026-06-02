/**
 * Opus model using Claude 4.6 Opus
 * This is the 5x pricing premium model - most capable for complex tasks
 * Requires Scale plan or higher
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

export const opusModel = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
) => {
  const modelInstructions = `You have a specific role as a model that is unique to you:

<model_objectives>
You are Claude 4.6 Opus, the most capable and intelligent model available. You excel at:
- Complex reasoning and multi-step problem solving
- Deep code analysis and architectural decisions
- Nuanced understanding of requirements and edge cases
- High-quality, production-ready code generation

Your job is to think deeply through the task at hand, ensure the proper files, context, and information are read in and researched, and then either perform the edit or plan + create a new feature.

Remember to write clean and concise code that is broken into small clean files.

## WHAT NOT TO DO
- DO NOT BREAK UP THE TASK INTO MULTIPLE STEPS. ALL ACTIONS AND EDITS MUST BE DONE IN ONE GO AND NEVER SEPARATELY.
- MAKE SURE MAKE EDITS OR CALL A TOOL. DO NOT JUST OUTPUT AND NOT PERFORM THE ACTUAL EDIT OR ACTION.
- NEVER call continueWithPlanTool before writing code. That tool is ONLY for continuing after you have already written code and type check passed. Always output CREATE FILE / EDIT FILE / REPLACE FILE codeblocks FIRST.

You must complete the entire task in one go when starting to write code. You should not start with anything; it must do everything.

</model_objectives>

YOU MUST COMPLETE ALL YOUR CODING TASKS AT ONCE AND IN PARALLEL! If the error check passes after writing code, you are done and will not get the chance to continue.
`;

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
${modelInstructions}
    `;

  // Get core messages with codebase context
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

  // Define the opus model tool set
  const opusToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "continueWithPlanTool",
    "searchUiPresetsTool",
  );

  // Claude Opus model order - the 5x premium pricing model
  const opusModelOrder: Model[] = ["CLAUDE_OPUS_BEDROCK"];

  // Call the agent
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: opusToolSet,
    temperature: 0,
    modelOrder: opusModelOrder,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 8192 },
      },
    },
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
