"use node";

import { ActionCtx } from "!/_generated/server";
import { Model } from "!/utils/registry_validators";
import { handleAgentCall } from "../agent/handle_turn";
import { compactMessagesWithThresholdsXML } from "../agent/process/compact_messages_xml";
import { getPromptPieces } from "../agent/process/prompt_pieces";
import {
  getCoreSystemPrompt,
  createOrEditFilesBlockInstructions,
  secondCreateOrEditFilesBlockInstructions,
} from "../agent/process/system_prompts";
import { hasPackageManager } from "../../../codebase-utils/codebase/Codebase";
import { pickToolSet } from "../agent/tools";
import { SharedContext } from "../context/assembly";
import { getContextLengthPreset } from "../config/contextLengthPresets";

export const expensiveModel = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
) => {
  const modelInstructions = `You have a specific role as a model that is unique to you:

<model_objectives>
You are a powerful model. Your job is to think through the task at hand, ensure the proper files, context, and information are read in and researched, and then either perform the edit or plan + create a new feature.

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

  // get prompt pieces with context length settings
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
  ${modelInstructions}
    `; // remove current page abstraction for now

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
  const contextSearchToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "executeCommandTool",
    "externalSearchesTool",
    "addIntegrationTool",
    "continueWithPlanTool",
    "searchUiPresetsTool",
  );

  const contextSearchModelOrder: Model[] = ["CLAUDE_BEDROCK", "CLAUDE_LOW_QOS"];

  // call the agent, return whether to terminate or not
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: contextSearchToolSet,
    temperature: 0,
    modelOrder: contextSearchModelOrder,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 4096 },
      },
      google: {
        // Options are nested under 'google' for Vertex provider
        thinkingConfig: {
          includeThoughts: true,
          // thinkingBudget: 2048, // Optional
          thinkingLevel: "high",
        },
      },
    },
  });

  return {
    ...sharedContext,
    keepGoing,
  };
};
