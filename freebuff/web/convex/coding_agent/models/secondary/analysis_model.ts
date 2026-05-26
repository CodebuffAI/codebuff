"use node";

import { internalAction } from "!/_generated/server";
import { compactMessagesWithThresholdsXML } from "../../agent/process/compact_messages_xml";
import { getPromptPieces } from "../../agent/process/prompt_pieces";

import { generateText } from "ai";
import { MODELS } from "../../../utils/registry";
import { internal } from "!/_generated/api";
import { v } from "convex/values";
import { handler_getSharedContext } from "../../context/assembly";
import { DEFAULT_CONTEXT_LENGTH } from "../../config/contextLengthPresets";
import { reducedSystemPrompt } from "../../agent/process/system_prompts";

// Background action to refresh and store the project spec (PRD) on the project record
export const updateProjectSpec = internalAction({
  args: {
    projectId: v.id("project"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    // Load project doc
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });
    if (!project) return null;

    // Assemble a minimal shared context (fast) for spec generation
    const sharedContext = await handler_getSharedContext(
      ctx,
      project,
      args.assistantMessageId,
      undefined,
      { contextLength: DEFAULT_CONTEXT_LENGTH },
    );

    const promptPieces = await getPromptPieces(sharedContext);

    // Check if the specification is too long
    const specLength = project.spec?.length || 0;
    const lengthWarning =
      specLength > 3000
        ? `\n\n⚠️ WARNING: The current specification is ${specLength} characters, which exceeds the 4500 character limit. You MUST significantly reduce it by cutting down on less relevant words and details. Focus only on the most critical project information and logic and the most recent items from the chat history.\n`
        : "";

    const systemPrompt = `
Here is a description of the environment you are in:
<description>
${reducedSystemPrompt}
</description>

Here are details to help you understand the project:

${promptPieces.userInformation}

    
You are generating a concise, markdown PRD for the overall project (spec) based on the code and the recent chat history. Call it a specification document for the project details above.
Include (as concise as possible):
- Concise Overview: high-level purpose / description, objectives, and key flows
- Overall summary of the pages that exist
- Very brief file tree that should only have most relevant files (no config files, env, etc). Use proper file tree format / characters to show the tree structure
- Basic Project-wide overview of business logic and the technical logic with file references
- Other relevant overall information, such as structure, integrations, memories, etc.
Keep it short, skimmable, and accurate to current code. Update it based on changes done in the chat history from the most recent user message. Make it as short as possible.

The purpose of this is to keep a very short high level summary of important information project-wide.
It provides a technical guideline of where logic is located in the project and how it is structured overall.

DO NOT SHOW: tech stack specs, irrelevant details, fine details, etc. Only show higher level structure, overview, logic, etc.

Here is the current specification (if none, create a new one. Otherwise, update this outdated version with any changes by rewriting and outputting nothing else but the new version):
<current_project_specification>
${project.spec || ""}
</current_project_specification>${lengthWarning}

Output the markdown only (no extra commentary outside the doc) for the new specification.

MUST KEEP IT SHORT: You are limited to 600 words for the project level summary. NEVER USE ANY MARKDOWN BLOCKS. Never have backticks or any markdown indication. Your only output should be the spec and only the spec itself, in markdown formatted language with proper formatting such as titles, bolding, etc.

For an existing project specifications, update it based on the recent chat messages since the last user message with any new changes.

If there are no changes, output "SAME". Most common there will be no changes, especially if the edits are small. Remember to keep the project structure specification extremely short. 
`;

    const coreMessages = await compactMessagesWithThresholdsXML(
      sharedContext.messages,
      ctx,
      systemPrompt,
      promptPieces.filesInCodebase + promptPieces.codebaseFilesPrompt,
      sharedContext,
      3000,
      3300,
      3500,
      "Output the markdown only (no extra commentary outside the doc) for the new specification. DO NOT DO ANYTHING ELSE. DO NOT EDIT ANY CODE. THE CHAT MESSAGES ARE JUST FOR CONTEXT. DO NOT INCLUDE ANY OTHER TEXT EXCEPT THE RAW TEXT MARKDOWN (no pre-amble, irrelevant words, etc). If there are no relevant changes, output SAME.",
    );

    const response = await generateText({
      model: MODELS.PRIMARY_MODELS.CLAUDE_BEDROCK,
      messages: coreMessages,
    });

    console.log("Response: ", response.text);
    // If the model outputs "SAME", don't make any changes
    if (response.text.trim().toUpperCase() === "SAME") {
      return null;
    }

    // Temporarily disabled while specification updates are under maintence.
    // await ctx.runMutation(internal.project.setProjectSpec, {
    //   projectId: args.projectId,
    //   spec: response.text,
    // });

    return null;
  },
});
