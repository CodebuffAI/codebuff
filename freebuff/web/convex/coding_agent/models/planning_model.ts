/**
 * Planning model using GPT-5.1-codex for read-only planning tasks
 * This agent can read and search files but cannot edit them
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
import { reducedSystemPrompt } from "../agent/process/system_prompts";

export const planningModel = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
) => {
  const modelInstructions = `You have a specific role as a planning agent:

<model_objectives>
You are a planning agent. Your goal is to analyze the codebase, understand the user's requirements, and create a detailed plan for implementation.

IMPORTANT RESTRICTIONS:
- You CAN read files and search the codebase to understand the structure
- You CANNOT edit, create, or modify any files
- You CANNOT execute commands that would modify the codebase
- You MUST only provide a detailed plan in your response

Your responsibilities:
1. Read and analyze relevant files to understand the current codebase structure
2. Search for related code and patterns
3. Understand the user's requirements thoroughly
4. Create a comprehensive, step-by-step plan for implementation
5. Identify which files need to be modified or created
6. Outline the approach and any potential challenges
7. Provide clear, actionable steps that another agent can follow

Your output should be a well-structured plan in markdown format that includes:
- Overview of the task
- Analysis of the current codebase
- Step-by-step implementation plan
- Files that need to be modified/created
- Any dependencies or considerations
- Potential challenges and solutions

Do NOT write any code blocks or attempt to edit files. Only provide the plan.
</model_objectives>`;

  // get prompt pieces
  // Get context length preset - planning model uses larger context by default
  const contextPreset = getContextLengthPreset(sharedContext.contextLength);
  // Planning model gets 40% more file context than the preset
  const planningFileTokens = Math.round(
    contextPreset.fileTokensInContext * 1.4,
  );

  const promptPieces = await getPromptPieces(sharedContext, planningFileTokens);

  const systemPrompt = `${reducedSystemPrompt}
${promptPieces.userInformation}
${promptPieces.projectSpecification}
${modelInstructions}
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

  // --- Define the planning model tool set (read-only tools only) ---
  // Only include tools that allow reading and searching, NOT editing
  const planningModelToolSet = pickToolSet(
    "readFilesToContextTool",
    "semanticFileSearchTool",
    "scrapeLinksTool",
    "externalSearchesTool",
    "searchUiPresetsTool",
  );

  const planningModelOrder: Model[] = ["GPT_5_1_CODEX", "GPT_CODEX"];

  // call the agent, return whether to terminate or not
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: planningModelToolSet,
    temperature: 0.2, // Low temperature for structured planning
    modelOrder: planningModelOrder,
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
