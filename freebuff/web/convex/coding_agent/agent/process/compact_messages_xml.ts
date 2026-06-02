"use node";

import { ActionCtx } from "!/_generated/server";

import { ModelMessage, TextPart, ImagePart, SystemModelMessage } from "ai";
import { countTokens } from "../../helpers/tokenizer";
import { SharedContext } from "!/coding_agent/context/assembly";
import { ContextMessage } from "!/coding_agent/context/types";
import { AllToolCalls } from "../tools";

// XML-based compaction logic
export async function compactMessagesWithThresholdsXML(
  messages: ContextMessage[],
  ctx: ActionCtx,
  systemPrompt: string,
  filesInContext: string,
  sharedContext: SharedContext,
  firstThreshold: number = 5000,
  secondThreshold: number = 6000,
  thirdThreshold: number = 9000,
  finalMessageInjection: string = "",
  dynamicSystemPrompt?: string,
): Promise<ModelMessage[]> {
  let runningTokens = 0;

  // Build content as we iterate through messages
  const messageParts: (TextPart | ImagePart)[] = [];

  // Sort messages by date in reverse chronological order (newest first) for token budget prioritization
  const messagesToProcess = [...messages].sort((a, b) => b.date - a.date);

  // Merge all summarizations into a single string
  const summarizationText: string[] = [];
  let usedSummarization = false;

  for (const m of messagesToProcess) {
    let content = "";

    // Calculate token count for the full message including tool calls
    const fullTokenCount = [m.content, m.error_check, m.result, m.object]
      .filter(Boolean)
      .join("");

    // Determine what content to use based on token budget
    if (
      runningTokens + countTokens(fullTokenCount) < firstThreshold &&
      !usedSummarization
    ) {
      // Use code_summarization if it exists, otherwise use content
      content = m.code_summarization || m.content;
      runningTokens += countTokens(fullTokenCount);
    } else if (
      m.summarization &&
      runningTokens + countTokens(m.summarization) < secondThreshold
    ) {
      content = m.summarization;
      usedSummarization = true;
      runningTokens += countTokens(m.summarization);
    } else if (
      m.compact_summarization &&
      runningTokens + countTokens(m.compact_summarization) < thirdThreshold
    ) {
      content = m.compact_summarization;
      usedSummarization = true;
      runningTokens += countTokens(m.compact_summarization);
    } else if (
      !m.summarization &&
      !m.compact_summarization &&
      runningTokens < thirdThreshold
    ) {
      // Handle in the case that summarizations don't exist. use the original content and count it as less tokens.
      if (runningTokens + countTokens(fullTokenCount) / 4 < secondThreshold) {
        // Use code_summarization if it exists, otherwise use content
        content = m.code_summarization || m.content;
        runningTokens += countTokens(fullTokenCount) / 4; // can handle up to 4x the second token threshold
      } else {
        content = "This message is too long to be included. Let the user know.";
      }
    } else {
      // Skip message that is over the token budget
      continue;
    }

    if (usedSummarization) {
      if (m.role === "user") {
        // User message
        if (m.content.length < content.length) {
          // Only use user summarization if it is shorter than the original message
          summarizationText.push(
            JSON.stringify({ type: "user_message", content: m.content }),
          );
        } else {
          // Summarized user message
          summarizationText.push(
            JSON.stringify({
              type: "summarized_user_message",
              content: content,
            }),
          );
        }
      } else {
        // Assistant message
        summarizationText.push(
          JSON.stringify({
            type: "summarized_assistant_message",
            content: content,
          }),
        );
      }
      continue;
    }

    if (m.role === "user") {
      // Build user message content inline
      let userMessageContent = `${content || ""}`;

      if (m.pageContext) {
        userMessageContent = `Current page URL user is looking at: (${m.pageContext})\n\nPrompt:\n${userMessageContent}`;
      }

      // Handle images if present
      if (m.images && m.images.length > 0) {
        const imageUrls = await Promise.all(
          m.images.map(async (storageId) => {
            return await ctx.storage.getUrl(storageId);
          }),
        );

        const validImageUrls = imageUrls.filter(
          (url): url is string => url !== null,
        );
        if (validImageUrls.length > 0) {
          // Add image references inline to the user message
          const imageReferences = validImageUrls
            .map((url, idx) => `[Image ${idx + 1}: ${url}]`)
            .join(",\n");
          userMessageContent += `\n\n${JSON.stringify({ type: "message_images", content: `Referenced images:\n${imageReferences}` })}`;

          // Add images as separate image parts
          validImageUrls.forEach((url) => {
            messageParts.push({
              type: "image" as const,
              image: url,
            } as ImagePart);
          });
        }
      }

      messageParts.push({
        type: "text" as const,
        text: JSON.stringify({
          type: "user_message",
          content: `<USER_INSTRUCTIONS_TO_FOLLOW>\n${userMessageContent}\n</USER_INSTRUCTIONS_TO_FOLLOW>`,
        }),
      } as TextPart);
    } else {
      // Handle empty assistant messages: skip if no content, no object
      const isEmptyAssistant =
        (!content || content.trim() === "") &&
        (!m.object || m.object.trim() === "");
      if (isEmptyAssistant) {
        continue; // Skip empty assistant message
      }

      // Check if this message has tool calls that need to be preserved
      const hasToolCalls =
        m.object &&
        m.object.trim() !== "" &&
        m.object !== "[]" &&
        m.object !== "null" &&
        m.object !== "undefined";

      // Handle assistant messages - merge all cases
      if (m.error_check && !usedSummarization) {
        messageParts.push({
          type: "text" as const,
          text: JSON.stringify({
            type: "error_check",
            content: `Result of the error check: ${m.error_check}`,
          }),
        } as TextPart);
      }

      // Add tool calls if they exist
      if (m.object && hasToolCalls && !usedSummarization) {
        try {
          // Parse into AllToolCalls format
          const parsedObject: AllToolCalls = JSON.parse(m.object);
          let toolCallsInfo = "";

          parsedObject.forEach((item, index: number) => {
            const toolName = item.toolName;
            const args = JSON.stringify(item.input);

            // Get corresponding result
            let resultText = "Tool executed successfully";
            try {
              const parsedResult = JSON.parse(m.result || '["Executed"]');
              if (Array.isArray(parsedResult) && parsedResult[index]) {
                resultText = parsedResult[index];
              } else if (index === 0 && m.result) {
                resultText = m.result;
              }
            } catch {
              if (index === 0 && m.result) {
                resultText = m.result;
              }
            }

            toolCallsInfo +=
              JSON.stringify({
                type: "tool_call",
                tool_number: index + 1,
                tool_name: toolName,
                input_args: args,
                results: resultText,
              }) + "\n----\n";
          });

          messageParts.push({
            type: "text" as const,
            text: JSON.stringify({
              type: "tool_calls",
              content: toolCallsInfo,
            }),
          } as TextPart);
        } catch {
          // If both fail, fallback to stringifying the whole thing
          messageParts.push({
            type: "text" as const,
            text: JSON.stringify({
              type: "tool_calls",
              content: `Tool calls: ${m.tool_call || ""} ${m.object}\nTool results: ${m.result || "Executed"}`,
            }),
          } as TextPart);
        }
      }

      // Add assistant message content if it exists
      if (content && content.trim() !== "") {
        messageParts.push({
          type: "text" as const,
          text: JSON.stringify({ type: "assistant_message", content: content }),
        } as TextPart);
      }
    }
  }

  // Reverse the array to get chronological order
  const reversedParts = messageParts.reverse();

  // Detect first message: only user message(s) and images, no prior assistant/tool activity
  const isFirstMessage =
    summarizationText.length === 0 &&
    reversedParts.every(
      (p) =>
        p.type === "image" ||
        (p.type === "text" &&
          (p.text.includes("user_message") ||
            p.text.includes("message_images"))),
    );

  return [
    {
      role: "system" as const,
      content: systemPrompt,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
        bedrock: { cachePoint: { type: "default" } },
      },
    } as SystemModelMessage,
    ...(dynamicSystemPrompt
      ? [
          {
            role: "system" as const,
            content: dynamicSystemPrompt, // dynamic
          } as SystemModelMessage,
        ]
      : []),
    {
      role: "user" as const,
      content: (() => {
        const contentParts: (TextPart | ImagePart)[] = [];

        if (isFirstMessage) {
          // For initial prompt: put user's task FIRST so the agent reads it before files
          reversedParts.forEach((part) => contentParts.push(part));
          contentParts.push({
            type: "text" as const,
            text: `

Here are the most up to date files in context. This is the only source of truth for what files exist:
            ${JSON.stringify({ type: "files_in_context", content: filesInContext })}
            Use these files to complete the user's task above.`,
          } as TextPart);
        } else {
          // For follow-up turns: files first, then history, then messages
          contentParts.push({
            type: "text" as const,
            text: `Here are the most up to date files in context. This is the only source of truth for what files exist:
            ${JSON.stringify({ type: "files_in_context", content: filesInContext })}
            Use these files and the context of what happened to determine the next edits or actions.

            `,
          } as TextPart);

          contentParts.push({
            type: "text" as const,
            text: `Here is the summarized conversation history in JSON format:
        ${JSON.stringify({ type: "compacted_conversation_history", content: summarizationText.reverse().join("\n---\n") })}`,
          } as TextPart);

          reversedParts.forEach((part) => contentParts.push(part));
        }

        contentParts.push({
          type: "text" as const,
          text: `Next steps: Write in markdown. Always start by talking with a text preamble intro and postamble to be quick with the user.
            NEVER EDIT MORE THAN YOUR TASK AT HAND. NEVER TOUCH ANYTHING ELSE EXCEPT YOUR FOCUS. IF COMPLETE BASED ON PREVIOUS ACTIONS, SUMMARIZE AND STOP.
            NEVER REPEAT YOURSELF WITH PAST ACTIONS, WORDS, AND PHRASES. Past text is what has happened, you must determine the next step (continue or finish), and never repeat yourself or else face severe user dismay. You must never assume anything before has happened; always look closely at the results.
            Never be lazy and not complete the task; make sure to perform the correct edit, call the right tool, etc; never do nothing, and never repeat yourself in a loop (always proceed to the next step).
            ${finalMessageInjection}`,
        } as TextPart);

        return contentParts;
      })(),
    },
  ];
}
