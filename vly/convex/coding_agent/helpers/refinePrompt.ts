"use node";

import { action } from "!/_generated/server";
import { v } from "convex/values";
import { getAuthUser } from "!/users";
import { internal } from "!/_generated/api";
import { MODELS } from "!/utils/registry";
import { streamText } from "ai";
import { checkRefinePromptRateLimit } from "../rateLimiter";

/**
 * Refines a user's prompt by analyzing:
 * - Current page abstraction (if entryPointId provided)
 * - Overall project abstraction (project spec)
 * - Recent chat history
 *
 * Returns an enhanced version of the prompt with context
 */
export const refinePrompt = action({
  args: {
    projectSemanticIdentifier: v.string(),
    currentPrompt: v.string(),
    entryPointId: v.optional(v.id("entry_point")),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Check rate limit (maximum once every 20 seconds)
    const rateLimitResult = await checkRefinePromptRateLimit(ctx, user._id);
    if (!rateLimitResult.success) {
      throw new Error(rateLimitResult.error.message);
    }

    // Get project (for overall project abstraction/spec)
    const project = await ctx.runQuery(
      internal.project.getVerifiedAccessProjectInternal,
      {
        userId: user._id,
        semanticIdentifier: args.projectSemanticIdentifier,
      },
    );

    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.active_thread) {
      throw new Error("No active thread found");
    }

    // Get entry points (for page abstractions)
    const entryPoints = await ctx.runQuery(
      internal.entry_point.getProjectEntryPoints,
      {
        projectId: project._id,
      },
    );

    // Query only the most recent assistant message (most efficient)
    const mostRecentAssistantMessage = await ctx.runQuery(
      internal.messages.getMostRecentAssistantMessage,
      {
        threadId: project.active_thread,
      },
    );

    // Find current page abstraction if entryPointId is provided
    let currentPageAbstraction = "";
    if (args.entryPointId) {
      const currentEntryPoint = entryPoints.find(
        (ep: any) => ep._id === args.entryPointId,
      );
      if (currentEntryPoint?.abstraction) {
        currentPageAbstraction = currentEntryPoint.abstraction;
      }
    }

    // Get all other page abstractions (exclude current if provided)
    //   const otherPageAbstractions = entryPoints
    //     .filter((ep) => !args.entryPointId || ep._id !== args.entryPointId)
    //     .filter((ep) => ep.abstraction)
    //     .map((ep) => ({
    //       title: ep.page?.page_title || "Untitled",
    //       url: ep.page?.page_display_url || "/",
    //       abstraction: ep.abstraction,
    //     }));

    // Overall project abstraction (project spec)
    const projectAbstraction = project.spec || "";

    // Build context string for the prompt
    let contextString = "";

    if (projectAbstraction) {
      contextString += `## Overall Project Specification\n${projectAbstraction}\n\n`;
    }

    if (currentPageAbstraction) {
      contextString += `## Current Page Abstraction (note: user may not actually be referencing this page; do not use much) \n${currentPageAbstraction}\n\n`;
    }

    //   if (otherPageAbstractions.length > 0) {
    //     contextString += `## Other Page Abstractions\n`;
    //     otherPageAbstractions.forEach((page) => {
    //       contextString += `### ${page.title} (${page.url})\n${page.abstraction}\n\n`;
    //     });
    //   }

    let chatHistory = "";
    if (mostRecentAssistantMessage) {
      const content =
        typeof mostRecentAssistantMessage.content === "string"
          ? mostRecentAssistantMessage.content
          : JSON.stringify(mostRecentAssistantMessage.content);
      chatHistory = `## Most Recent Assistant Response\n${content}\n\n`;
    }
    contextString += chatHistory;

    // Create system prompt for refinement
    const systemPrompt = `You are a prompt refinement assistant. Your job is to enhance user prompts by adding specifics to the prompt using the project's context.

Here is some context you will get:
- The overall project specification
- The current page documentation (if applicable) that the user is looking at
- Recent chat message

Your goal is to:
- Understand what the user wants to accomplish
- Incorporate necessary context and logic; adds context and necessary business logic and details from the overall specification
- Make the prompt more specific: this means adding specifications, details, and other logic breakdowns that should be included
- Preserve the user's original intent and wording as much as possible
- Think through a good user experience for what is added; keep it concise and higher level

Make sure to include further details that would enhance the prompt. Make it in a structured format (a description with a singular numbered list) so that it's easily readable and editable.

Make sure that the prompt is VERY SIMPLE and not overly complicated. Do not add additional work or tasks that are not necessary; it should simply be specifying the task.

Overly complex tasks can include:
- tasks that require extremely complex features that are vague and not defined
- lofty asks
- extremely long prompts; break them down into smaller steps

Make sure that the enhanced prompt integrates well into the project, adds a breakdown, and adds any necessary logic that is required to complete the task.
Do not add unnecessary features.

Return ONLY the refined prompt - do not add explanations, comments, or meta-commentary. Just return the enhanced prompt text that the user can directly use. Do not add any other formatting, characters, etc.
Do not add any markdown formatting (do not add titles or bolding); english text only in a brief and concise list with no titles only details.`;

    // Build the user message with context
    const userMessage = `Here is the context available to refine your prompt off of:

<context>
${contextString}
</context>
---

Original user prompt to refine:
<user_prompt>
${args.currentPrompt}
</user_prompt>

Think through first, then output only the refined prompt. Keep the enhanced prompt as short and concise as possible (very important! must be very brief).
Refine this prompt by incorporating necessary business logic, specifications, and preventing complexity and encouraging simplicity). Return only the refined prompt without any formatting (ie bolding,titles, etc). Keep it as simple as possible.`;

    // Debug logging
    console.log("\n--- USER MESSAGE (FULL PROMPT) ---");
    console.log(userMessage);
    console.log("=== END REFINE PROMPT DEBUG ===\n");

    // Use a fast model for prompt refinement
    const stream = streamText({
      model: MODELS.PRIMARY_MODELS.CLAUDE_BEDROCK,
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0.1,
      maxOutputTokens: 2048,
    });

    // Collect the full response
    const refinedPrompt = await stream.text;

    if (!refinedPrompt || refinedPrompt.trim().length === 0) {
      // Fallback to original prompt if refinement fails
      return args.currentPrompt;
    }

    return refinedPrompt.trim();
  },
});
