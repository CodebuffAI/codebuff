"use node";

import { ActionCtx } from "!/_generated/server";
import { internal } from "../../../_generated/api";
import { SharedContext } from "../../context/assembly";
import { compactMessagesWithThresholdsXML } from "../../agent/process/compact_messages_xml";
import { getPromptPieces } from "../../agent/process/prompt_pieces";
import { pickToolSet } from "../../agent/tools";
import { Model } from "!/utils/registry_validators";
import { handleAgentCall } from "../../agent/handle_turn";
import { reducedSystemPrompt } from "../../agent/process/system_prompts";

export const summarizerModel = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
) => {
  const modelInstructions = `You have a specific role as a model that is unique to you:

<model_objectives>
You're a summarizer agent. Your goal is to provide a brief, user-friendly summary of what changes were made and what was accomplished. Focus on the key changes and their impact. Do not write any code or make any further modifications.
ONLY SUMMARIZE THE CHANGES FROM THE PREVIOUS USER MESSAGE and following assistant message chain. Do not summarize beyond the previous user message.

After your summary, you must analyze and review the code that was written. Determine if there are any issues that need to be analyzed or fixed, potential issues, unimplemented features that still need to be implemented, new features, or next steps.

Finally, choose maximum of 3 suggestions for the coding agent to perform and put them into a list at the very end of your response.

Avoid generic or non-actionable suggestions like "Deploy to production", "Test the application", "Improve performance", etc.

Stick to potential bugs, fixes, next features, holes, etc. Keep them short and concise (maximum 5 words per suggestion).
</model_objectives>`;

  // get prompt pieces
  const promptPieces = await getPromptPieces(sharedContext, 10000);

  const systemPrompt = `${reducedSystemPrompt}
${promptPieces.userInformation}
${modelInstructions}
    `;

  // get core messages which also takes in the codebase context
  const coreMessages = await compactMessagesWithThresholdsXML(
    sharedContext.messages,
    ctx,
    systemPrompt,
    promptPieces.filesInCodebase + promptPieces.codebaseFilesPrompt,
    sharedContext,
    10000,
    11000,
    12000,
    "Summarize the changes that were made and what was accomplished. Keep it brief and user-friendly. Do not write any code or make any further changes. Only output the summarized changes since the last user message in a well-structured markdown format. At the end of your response, analyze issues, fixes, holes, and next features, and choose maximum of 3 suggestions for the user's next steps, listing them out.",
  );

  // --- Define the fast model tool set (customize as needed) ---
  const contextSearchToolSet = pickToolSet();

  const contextSearchModelOrder: Model[] = ["GPT_5_MINI", "CLAUDE_LOW_QOS"];

  // call the agent, return whether to terminate or not
  const keepGoing = await handleAgentCall(ctx, sharedContext, {
    coreMessages,
    toolSet: contextSearchToolSet,
    temperature: 1,
    modelOrder: contextSearchModelOrder,
    allowModelFallback: true,
  });

  // Parse suggestions from the summarizer output
  await ctx.scheduler.runAfter(
    0,
    internal.coding_agent.helpers.suggestions.parseSuggestionsFromSummarizer,
    {
      messageId: sharedContext.assistantMessageId,
    },
  );

  return {
    ...sharedContext,
    keepGoing,
  };
};
