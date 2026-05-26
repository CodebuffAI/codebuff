"use node";

import { generateObject } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { MODELS } from "!/utils/registry";

const suggestionsSchema = z.object({
  suggestions: z
    .array(z.string())
    .length(3)
    .describe(
      "Exactly 3 relevant, actionable suggestions for specific code improvements the user can request",
    ),
});

export const generateMessageSuggestions = internalAction({
  args: {
    messageId: v.id("messages"),
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    try {
      const message = await ctx.runQuery(internal.messages.get, {
        messageId: args.messageId,
      });

      if (!message || message.role !== "assistant") {
        return; // Only generate suggestions for assistant messages
      }

      const allRecentMessages = await ctx.runQuery(
        internal.messages.getForProject,
        {
          projectId: args.projectId,
        },
      );

      // Get project context
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId: args.projectId,
      });

      if (!project) {
        return;
      }

      const userMessages = allRecentMessages
        .filter((msg: any) => msg.role === "user")
        .slice(0, 4)
        .reverse();

      if (userMessages.length === 0) {
        return;
      }

      const userIntentContext = userMessages
        .map((msg: any) => msg.content)
        .join("\n\n");

      const assistantResponse = message.content;

      const systemPrompt = `You are generating specific, actionable follow-up suggestions for a user working with an AI coding assistant.

CONTEXT: The user just received help from an AI coding assistant. Generate suggestions for their next logical coding requests.

FOCUS ON CODE-SPECIFIC ACTIONS that the AI assistant can actually perform:
✅ "Add form validation to the signup"
✅ "Make the navbar responsive" 
✅ "Add loading states to buttons"
✅ "Style the modal with animations"
✅ "Add error handling to the API"
✅ "Create a dark mode toggle"
✅ "Add search functionality here"
✅ "Polish the mobile layout"

AVOID NON-ACTIONABLE OR GENERIC ITEMS:
❌ "Deploy to production" (not something the agent can do)
❌ "Test the application" (too vague)
❌ "Improve performance" (too broad)
❌ "Add more features" (not specific)
❌ "Review the code" (not actionable)

REQUIREMENTS:
- 4-8 words maximum per suggestion
- Focus on immediate code improvements/additions
- Must be something the AI can implement by editing code
- Highly specific to web development tasks
- Progressive enhancement of what was just built

STRATEGY:
1. Look at what the user has been requesting
2. Think about immediate follow-ups to those requests
3. Focus on UI/UX improvements, new components, styling, functionality
4. Suggest specific enhancements to code that was just created`;

      const userPrompt = `Recent user requests:
${userIntentContext}

Latest AI response context:
${assistantResponse.slice(0, 500)}...

Based on the user's recent requests and what was just implemented, generate 3 specific coding suggestions for immediate next steps they could ask for.`;

      const result = await generateObject({
        model: MODELS.PROJECT_NAME_GENERATOR_MODEL,
        schema: suggestionsSchema,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.3,
      });

      // Update the message with suggestions
      await ctx.runMutation(internal.messages.updateMessageSuggestions, {
        messageId: args.messageId,
        suggestions: result.object.suggestions,
      });
    } catch (error) {
      console.error("Failed to generate message suggestions:", error);
    }
  },
});

/**
 * Parse suggestions from the summarizer model's output
 * The summarizer model includes suggestions in <SUGGESTIONS> tags at the end of its response
 */
export const parseSuggestionsFromSummarizer = internalAction({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    try {
      const message = await ctx.runQuery(internal.messages.get, {
        messageId: args.messageId,
      });

      if (!message || message.role !== "assistant") {
        return; // Only parse suggestions for assistant messages
      }

      const content = message.content || "";

      const prompt = `You are parsing suggestions from a summarizer model's output. Extract up to 3 actionable suggestions in the final compiled list that the text has listed.

Use the actions in the final list, and parse them out as only the text, max 5 words per suggestion. Do it from this content:

${content}

Extract exactly 3 suggestions. If there are fewer than 3 suggestions, return empty strings for the missing ones.`;

      const result = await generateObject({
        model: MODELS.PRIMARY_MODELS.CLAUDE_BEDROCK,
        schema: suggestionsSchema,
        prompt: prompt,
        temperature: 0.1,
      });

      // Only update if we got valid suggestions (non-empty)
      const validSuggestions = result.object.suggestions.filter(
        (s) => s && s.trim().length > 0,
      );

      if (validSuggestions.length === 0) {
        // No valid suggestions, don't update
        return;
      }

      // Ensure we have exactly 3 suggestions (pad with empty strings if needed)
      const newSuggestions = [
        ...validSuggestions,
        ...Array(3 - validSuggestions.length).fill(""),
      ].slice(0, 3);

      // Check if message already has suggestions
      const existingSuggestions = message.suggestions || [];

      // Check if new suggestions are different from existing ones
      const suggestionsAreDifferent =
        existingSuggestions.length === 0 ||
        existingSuggestions.length !== newSuggestions.length ||
        existingSuggestions.some(
          (existing: any, index: number) =>
            existing.trim().toLowerCase() !==
            newSuggestions[index]?.trim().toLowerCase(),
        );

      // Only update if suggestions are different and new
      if (suggestionsAreDifferent) {
        await ctx.runMutation(internal.messages.updateMessageSuggestions, {
          messageId: args.messageId,
          suggestions: newSuggestions,
        });
      }
    } catch (error) {
      console.error("Failed to parse suggestions from summarizer:", error);
      // Don't throw - this is a non-critical operation
    }
  },
});
