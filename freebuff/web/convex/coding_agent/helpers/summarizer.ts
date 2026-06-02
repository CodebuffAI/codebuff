"use node";

import { generateObject } from "ai";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

import { MODELS } from "!/utils/registry";
import { z } from "zod";

const MAX_SUMMARY_CONTEXT_MESSAGES = 24;

function stripCodeBlocks(text: string) {
  return text.replace(/```[\s\S]*?```/g, "[code omitted]");
}

function collapseWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function toBulletText(text: string, maxLength: number) {
  const normalized = collapseWhitespace(stripCodeBlocks(text));
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function toSummaryText(message: {
  role: "user" | "assistant";
  content: string;
  core_message?: string;
}) {
  const baseContent =
    message.role === "assistant"
      ? (message.core_message ?? message.content ?? "")
      : (message.content ?? "");

  return baseContent.trim();
}

function serializeSummaryChain(
  messages: {
    role: "user" | "assistant";
    content: string;
    core_message?: string;
  }[],
) {
  return messages
    .map((message) => {
      const content = toSummaryText(message);
      if (!content) {
        return "";
      }

      return `<${message.role.toUpperCase()}>\n${content}\n</${message.role.toUpperCase()}>`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildFallbackSummary(args: {
  latestUserMessage?: string;
  latestAssistantMessage?: string;
}) {
  const whatChanged =
    toBulletText(
      args.latestAssistantMessage || "Completed the latest requested changes.",
      220,
    ) || "Completed the latest requested changes.";
  const userIntent =
    toBulletText(args.latestUserMessage || "", 140) || "latest user request";

  return {
    concise_summary: whatChanged,
    compact_summary: whatChanged,
    commit_message: "Summarize latest completed work",
    visible_summary_markdown: `## What changed
- ${whatChanged}

## Review
- Type check passed for the latest turn.
- This is a fallback summary for ${userIntent}; no additional review details were generated.

## Suggestions
- Refine the last change
- Review edge cases
- Continue the feature`,
    suggestions: [
      "Refine the last change",
      "Review edge cases",
      "Continue the feature",
    ],
  };
}

export const summarizeMessage = internalAction({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ commitMessage: string; summaryMessageId?: string }> => {
    try {
      const message = await ctx.runQuery(internal.messages.get, {
        messageId: args.messageId,
      });

      if (!message || message.role !== "assistant") {
        throw new Error("Message not found");
      }

      const recentMessages = message.thread_id
        ? await ctx.runQuery(internal.messages.getMessages, {
            threadId: message.thread_id,
          })
        : [message];
      const orderedMessages = [...recentMessages].sort(
        (a, b) => a.date - b.date,
      );
      const targetIndex = orderedMessages.findIndex(
        (candidate) => candidate._id === args.messageId,
      );
      const relevantWindow =
        targetIndex >= 0
          ? orderedMessages.slice(
              Math.max(0, targetIndex - MAX_SUMMARY_CONTEXT_MESSAGES + 1),
              targetIndex + 1,
            )
          : orderedMessages.slice(-MAX_SUMMARY_CONTEXT_MESSAGES);
      const latestUserIndex = [...relevantWindow]
        .map((candidate) => candidate.role)
        .lastIndexOf("user");
      const summaryChain =
        latestUserIndex >= 0
          ? relevantWindow.slice(latestUserIndex)
          : relevantWindow.slice(-1);
      const latestUserMessage =
        latestUserIndex >= 0
          ? toSummaryText(relevantWindow[latestUserIndex])
          : "";
      const latestAssistantMessage = toSummaryText(message);

      const serializedChain = serializeSummaryChain(summaryChain);

      const systemPrompt = `You are a summarizer agent for a coding assistant.

Your job:
- Summarize only the work completed for the latest user turn.
- Write a normal assistant message for the user to read.
- Review the code changes critically.
- Call out likely issues, missing pieces, regressions, or follow-up work when relevant.
- End with up to 3 short actionable suggestions for next requests.

Constraints:
- Do not write code.
- Do not mention internal tools unless they matter to the outcome.
- Keep the summary concise but specific.
- Avoid generic suggestions like "test it" or "deploy it".
- Suggestions must be specific coding tasks, each 5 words or fewer.`;

      const userPrompt = `Summarize and review this latest user turn.

Write the visible summary in markdown with this structure:
## What changed
- concise bullets of what was implemented

## Review
- concise bullets covering issues, risks, missing pieces, regressions, or notable follow-up work
- if there are no material issues, say that explicitly in one bullet

## Suggestions
- up to 3 short actionable follow-up requests

Also produce:
- a concise_summary for storage
- a compact_summary in one sentence
- a one-line commit_message
- the suggestions as a string array

Conversation slice for this turn:
${serializedChain}`;

      const response = await generateObject({
        model: MODELS.CODE_SUMMARIZER_MODEL,
        system: systemPrompt,
        prompt: userPrompt,
        schema: z.object({
          concise_summary: z.string().optional().default(""),
          compact_summary: z.string().optional().default(""),
          commit_message: z.string().optional().default(""),
          visible_summary_markdown: z.string().optional().default(""),
          suggestions: z.array(z.string()).max(3).optional().default([]),
        }),
        providerOptions: {
          openai: {
            reasoningEffort: "low",
            textVerbosity: "low",
            store: false,
          },
        },
      });

      const normalizedResponse = {
        concise_summary:
          response.object.concise_summary.trim() ||
          buildFallbackSummary({
            latestUserMessage,
            latestAssistantMessage,
          }).concise_summary,
        compact_summary:
          response.object.compact_summary.trim() ||
          buildFallbackSummary({
            latestUserMessage,
            latestAssistantMessage,
          }).compact_summary,
        commit_message:
          response.object.commit_message.trim() ||
          buildFallbackSummary({
            latestUserMessage,
            latestAssistantMessage,
          }).commit_message,
        visible_summary_markdown:
          response.object.visible_summary_markdown.trim() ||
          buildFallbackSummary({
            latestUserMessage,
            latestAssistantMessage,
          }).visible_summary_markdown,
        suggestions: response.object.suggestions
          .map((suggestion) => suggestion.trim())
          .filter(Boolean)
          .slice(0, 3),
      };

      const summaryMessageId = await ctx.runMutation(
        internal.messages.insertAssistantMessage,
        {
          projectId: message.project_id,
          content: normalizedResponse.visible_summary_markdown,
          streaming: false,
          excludeFromAgentHistory: true,
        },
      );

      const suggestions = [
        ...normalizedResponse.suggestions,
        ...Array(3).fill(""),
      ].slice(0, 3);

      if (suggestions.some((suggestion) => suggestion.length > 0)) {
        await ctx.runMutation(internal.messages.updateMessageSuggestions, {
          messageId: summaryMessageId,
          suggestions,
        });
      }

      return {
        commitMessage: normalizedResponse.commit_message,
        summaryMessageId,
      };
    } catch (error) {
      console.warn("Summarizer output invalid; using fallback summary", error);
      try {
        const message = await ctx.runQuery(internal.messages.get, {
          messageId: args.messageId,
        });

        if (message && message.role === "assistant") {
          const threadMessages = message.thread_id
            ? await ctx.runQuery(internal.messages.getMessages, {
                threadId: message.thread_id,
              })
            : [];
          const orderedMessages = [...threadMessages].sort(
            (a, b) => a.date - b.date,
          );
          const latestUserMessage = [...orderedMessages]
            .reverse()
            .find((candidate) => candidate.role === "user");
          const fallback = buildFallbackSummary({
            latestUserMessage: latestUserMessage
              ? toSummaryText(latestUserMessage)
              : "",
            latestAssistantMessage: toSummaryText(message),
          });

          const summaryMessageId = await ctx.runMutation(
            internal.messages.insertAssistantMessage,
            {
              projectId: message.project_id,
              content: fallback.visible_summary_markdown,
              streaming: false,
              excludeFromAgentHistory: true,
            },
          );

          await ctx.runMutation(internal.messages.updateMessageSuggestions, {
            messageId: summaryMessageId,
            suggestions: fallback.suggestions,
          });

          return {
            commitMessage: fallback.commit_message,
            summaryMessageId,
          };
        }
      } catch (fallbackError) {
        console.error("Error creating fallback summary: " + fallbackError);
      }

      return {
        commitMessage: "--",
      };
    }
  },
});
