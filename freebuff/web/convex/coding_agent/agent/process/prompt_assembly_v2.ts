"use node";

import { internal } from "!/_generated/api";
import { ActionCtx } from "!/_generated/server";
import {
  generateText,
  ModelMessage,
  SystemModelMessage,
  UserModelMessage,
} from "ai";
import { SharedContext } from "../../context/assembly";
import { ContextMessage } from "../../context/types";
import { countTokens } from "../../helpers/tokenizer";
import { MODELS } from "../../../utils/registry";
import { getContextLengthPreset } from "../../config/contextLengthPresets";

const RAW_MESSAGES_TO_KEEP_AFTER_COMPACTION = 8;
const MAX_ANTHROPIC_CACHE_BREAKPOINTS = 4;
const RAW_HISTORY_CACHE_CHUNK_TOKENS = 20_000;

export const PROMPT_ASSEMBLY_ORDER = `Prompt assembly order:
1. system prompt
2. deterministic serialized prompt sections in order
   - static context
   - compacted chat history, if present
   - raw chat history chunks
   - in-action continuation messages`;

const STABLE_CACHE_PROVIDER_OPTIONS = {
  anthropic: {
    cacheControl: { type: "ephemeral" as const, ttl: "1h" as const },
  },
  bedrock: { cachePoint: { type: "default" as const } },
};

function sortMessagesChronologically(messages: ContextMessage[]) {
  return [...messages].sort((a, b) => a.date - b.date);
}

function removeCodeBlocks(text: string) {
  return text.replace(/```[\s\S]*?```/g, "[code omitted]");
}

function isTruncatedStoredMessage(text: string | undefined | null) {
  if (!text) {
    return false;
  }

  return (
    text.startsWith("[...truncated...]") ||
    text.includes("[core_message truncated]") ||
    text.includes("[content truncated]")
  );
}

function truncateToTokenBudget(text: string, maxTokens: number) {
  if (countTokens(text) <= maxTokens) {
    return text;
  }

  const maxChars = Math.max(2_000, Math.floor(maxTokens * 4.2));
  return `${text.slice(0, maxChars)}\n[truncated]`;
}

function getHistoryCompactionMinimumTokens(targetSummaryTokens: number) {
  return Math.max(1_500, Math.floor(targetSummaryTokens * 0.7));
}

function buildHistoryCompactionSystemPrompt(
  targetSummaryTokens: number,
  minimumTargetTokens: number,
) {
  return `You compact coding-agent chat history.

Your job:
- Compress the history as aggressively as possible while keeping all virtal information. Do not lose any elements.
- Prioritize the most recent information and user instructions.
- Preserve user instructions, user-set rules, constraints, preferences, and unresolved issues above everything else.
- Preserve important tool findings, file names, commands, errors, and decisions only when they matter for future work.
- Hide code. Never quote or restate large code snippets. Refer to files and edits briefly.
- Keep the summary under ${targetSummaryTokens.toLocaleString()} tokens.
- Aim to use the available budget aggressively. When the source history is large enough, target roughly ${minimumTargetTokens.toLocaleString()} to ${targetSummaryTokens.toLocaleString()} tokens instead of producing a tiny summary.
- If the draft is much shorter than ${minimumTargetTokens.toLocaleString()} tokens and there is still relevant history left out, expand it with more retained detail.
- Write plain text with short sections. No markdown code fences. Make it very clear as to what has happened.
- Make most recent messages have more detail than older messages.
- If there is already a summary, extract important details from the summary (user preferences, rules, etc) and get rid of less relevant information. We want to preserve both the summary and new messages.
`;
}

async function getMessageImageLines(
  ctx: ActionCtx,
  message: ContextMessage,
): Promise<string[]> {
  if (!message.images?.length) {
    return [];
  }

  const urls = await Promise.all(
    message.images.map(async (storageId) => ctx.storage.getUrl(storageId)),
  );

  return urls
    .filter((url): url is string => url !== null)
    .map((url, index) => `Image ${index + 1}: ${url}`);
}

async function serializePersistedMessage(
  ctx: ActionCtx,
  message: ContextMessage,
  options?: {
    omitCode?: boolean;
  },
) {
  const sections: string[] = [];
  const hasCanonicalAssistantPrompt =
    message.role === "assistant" &&
    !!message.core_message &&
    !isTruncatedStoredMessage(message.core_message);
  const assistantPromptContent = hasCanonicalAssistantPrompt
    ? message.core_message!
    : message.content;
  const baseContent = assistantPromptContent
    ? options?.omitCode
      ? removeCodeBlocks(assistantPromptContent)
      : assistantPromptContent
    : "";

  if (message.role === "user") {
    sections.push(baseContent);
    if (message.pageContext) {
      sections.push(`Current page URL: ${message.pageContext}`);
    }
    const imageLines = await getMessageImageLines(ctx, message);
    if (imageLines.length > 0) {
      sections.push(imageLines.join("\n"));
    }
  } else {
    if (baseContent.trim()) {
      sections.push(baseContent);
    }

    if (
      message.core_message &&
      isTruncatedStoredMessage(message.core_message) &&
      baseContent.trim()
    ) {
      sections.push(
        "Note: assistant transcript was truncated in storage, so structured fields below are used as the source of truth for reassembly.",
      );
    }

    if (!hasCanonicalAssistantPrompt) {
      if (message.object) {
        sections.push(`Tool calls:\n${message.object}`);
      }
      if (message.result) {
        sections.push(
          `Tool results:\n${
            options?.omitCode
              ? removeCodeBlocks(message.result)
              : message.result
          }`,
        );
      }
      if (message.error_check) {
        sections.push(
          `Type check:\n${
            options?.omitCode
              ? removeCodeBlocks(message.error_check)
              : message.error_check
          }`,
        );
      }
      if (message.file_apply_results?.length) {
        sections.push(
          `File apply results:\n${JSON.stringify(message.file_apply_results)}`,
        );
      }
    }
  }

  return sections.filter(Boolean).join("\n\n").trim();
}

async function serializeTranscriptEntry(
  ctx: ActionCtx,
  message: ContextMessage,
  options?: {
    omitCode?: boolean;
  },
) {
  const content = await serializePersistedMessage(ctx, message, options);
  if (!content) {
    return "";
  }

  const roleLabel = message.role === "user" ? "USER" : "ASSISTANT";
  return `<CHAT_MESSAGE role="${roleLabel}">
${content}
</CHAT_MESSAGE>`;
}

function buildHistoryCompactionPrompt(args: {
  previousSummary: string;
  serializedMessages: string[];
  targetSummaryTokens: number;
  minimumTargetTokens: number;
}) {
  const compactableMessages = args.serializedMessages.filter(Boolean);
  const promptSections = [];
  if (args.previousSummary.trim()) {
    promptSections.push(args.previousSummary.trim());
  }
  if (compactableMessages.length > 0) {
    promptSections.push(`New history to compact:

${compactableMessages.join("\n\n---\n\n")}`);
  }

  promptSections.push(
    `Rewrite the compacted history so it replaces the old summary. Merge the prior summary with the newer messages. Keep only what future turns need.

Use this structure:
- User instructions and preferences
- Recent work and important outcomes
- Open issues and follow-up items
- Important files, commands, errors, and decisions

Most recent items should have the most detail. Older items can be shorter.
Do not waste space on code blocks, but do retain concrete files, commands, failures, and requested behavior.
Aim for a detailed summary that lands around ${args.minimumTargetTokens.toLocaleString()} to ${args.targetSummaryTokens.toLocaleString()} tokens when the source history is large enough.`,
  );

  return promptSections.join("\n\n");
}

function getPromptHistorySegments(sharedContext: SharedContext) {
  const orderedMessages = sortMessagesChronologically(sharedContext.messages);
  const latestUserIndex = [...orderedMessages]
    .map((message) => message.role)
    .lastIndexOf("user");
  const historyMessages =
    latestUserIndex >= 0
      ? orderedMessages.slice(0, latestUserIndex)
      : orderedMessages.slice();
  const latestUserMessage =
    latestUserIndex >= 0 ? orderedMessages[latestUserIndex] : null;
  const compactedCutoff =
    sharedContext.thread.compacted_history_up_to_message_time ?? -Infinity;
  const rawHistoryMessages = historyMessages.filter(
    (message) => message.date > compactedCutoff,
  );
  const rawPromptMessages = orderedMessages.filter(
    (message) => message.date > compactedCutoff,
  );

  return {
    historyMessages,
    latestUserMessage,
    rawHistoryMessages,
    rawPromptMessages,
  };
}

export async function estimatePersistedHistoryTokens(
  ctx: ActionCtx,
  messages: ContextMessage[],
): Promise<number> {
  const serialized = await Promise.all(
    messages.map((message) => serializePersistedMessage(ctx, message)),
  );
  return countTokens(serialized.filter(Boolean).join("\n\n---\n\n"));
}

export async function maybeCompactThreadHistory(
  ctx: ActionCtx,
  sharedContext: SharedContext,
) {
  const contextPreset = getContextLengthPreset(sharedContext.contextLength);
  const currentSummary =
    sharedContext.thread.compacted_history_summary?.trim() ?? "";
  const { historyMessages, rawHistoryMessages } =
    getPromptHistorySegments(sharedContext);

  if (historyMessages.length === 0) {
    return;
  }

  const rawHistoryTokens = await estimatePersistedHistoryTokens(
    ctx,
    rawHistoryMessages,
  );
  const visibleHistoryTokens = rawHistoryTokens + countTokens(currentSummary);
  if (visibleHistoryTokens <= contextPreset.historyCompaction.compactAtTokens) {
    return;
  }

  const rawMessagesToKeep = rawHistoryMessages.length
    ? Math.min(
        RAW_MESSAGES_TO_KEEP_AFTER_COMPACTION,
        Math.max(rawHistoryMessages.length - 1, 0),
      )
    : 0;
  const messagesToCompact = rawHistoryMessages.slice(
    0,
    rawHistoryMessages.length - rawMessagesToKeep,
  );
  if (!currentSummary && messagesToCompact.length === 0) {
    return;
  }

  await ctx.runMutation(internal.messages.updateMessageState, {
    messageId: sharedContext.assistantMessageId,
    status: "thinking",
    message: "compacting...",
  });

  const serializedMessages = await Promise.all(
    messagesToCompact.map((message) =>
      serializePersistedMessage(ctx, message, { omitCode: true }),
    ),
  );
  const lastCompactedMessage = messagesToCompact[messagesToCompact.length - 1];
  const upToMessageTime =
    lastCompactedMessage?.date ??
    sharedContext.thread.compacted_history_up_to_message_time;
  if (upToMessageTime === undefined) {
    return;
  }
  const previousSummary = currentSummary
    ? `Existing compacted history to preserve and improve:\n${currentSummary}`
    : "";
  const minimumTargetTokens = getHistoryCompactionMinimumTokens(
    contextPreset.historyCompaction.targetSummaryTokens,
  );

  const compactionSystemPrompt = buildHistoryCompactionSystemPrompt(
    contextPreset.historyCompaction.targetSummaryTokens,
    minimumTargetTokens,
  );
  const compactionPrompt = buildHistoryCompactionPrompt({
    previousSummary,
    serializedMessages,
    targetSummaryTokens: contextPreset.historyCompaction.targetSummaryTokens,
    minimumTargetTokens,
  });

  const generateCompactionSummary = async (prompt: string) => {
    return await generateText({
      model: MODELS.HISTORY_COMPACTION_MODEL,
      system: compactionSystemPrompt,
      prompt,
      maxOutputTokens: contextPreset.historyCompaction.targetSummaryTokens,
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          textVerbosity: "medium",
          store: false,
        },
      },
    });
  };

  const response = await generateCompactionSummary(compactionPrompt);
  let compactedSummary = truncateToTokenBudget(
    response.text.trim(),
    contextPreset.historyCompaction.targetSummaryTokens,
  );

  if (
    countTokens(compactedSummary) < minimumTargetTokens &&
    visibleHistoryTokens >
      contextPreset.historyCompaction.targetSummaryTokens * 1.5
  ) {
    const expandedResponse = await generateCompactionSummary(
      `${compactionPrompt}

Your previous draft underused the available budget:
${compactedSummary}

Expand it with more retained detail from the source history. Keep the same priorities, stay under ${contextPreset.historyCompaction.targetSummaryTokens.toLocaleString()} tokens, and aim for at least ${minimumTargetTokens.toLocaleString()} tokens if the source material supports it.`,
    );

    compactedSummary = truncateToTokenBudget(
      expandedResponse.text.trim(),
      contextPreset.historyCompaction.targetSummaryTokens,
    );
  }
  const compactedMessageCount =
    (sharedContext.thread.compacted_history_message_count ?? 0) +
    messagesToCompact.length;

  await ctx.runMutation(internal.thread.updateThreadCompaction, {
    threadId: sharedContext.threadId,
    summary: compactedSummary,
    upToMessageTime,
    tokenCount: countTokens(compactedSummary),
    messageCount: compactedMessageCount,
  });

  sharedContext.thread = {
    ...sharedContext.thread,
    compacted_history_summary: compactedSummary,
    compacted_history_up_to_message_time: upToMessageTime,
    compacted_history_tokens: countTokens(compactedSummary),
    compacted_history_message_count: compactedMessageCount,
    compacted_history_updated_at: Date.now(),
    compaction_count: (sharedContext.thread.compaction_count ?? 0) + 1,
  };
}

function wrapPromptSection(tag: string, content: string) {
  if (!content.trim()) {
    return "";
  }

  return `<${tag}>
${content.trim()}
</${tag}>`;
}

function chunkSerializedEntriesByTokenBudget(
  entries: string[],
  maxTokensPerChunk: number,
) {
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const entry of entries.filter(Boolean)) {
    const entryTokens = countTokens(entry);
    const separatorTokens = currentChunk.length > 0 ? countTokens("\n\n") : 0;

    if (
      currentChunk.length > 0 &&
      currentTokens + separatorTokens + entryTokens > maxTokensPerChunk
    ) {
      chunks.push(currentChunk.join("\n\n"));
      currentChunk = [entry];
      currentTokens = entryTokens;
      continue;
    }

    currentChunk.push(entry);
    currentTokens += separatorTokens + entryTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n\n"));
  }

  return chunks;
}

function createUserPromptMessage(content: string, cacheable = false) {
  return {
    role: "user" as const,
    content,
    ...(cacheable ? { providerOptions: STABLE_CACHE_PROVIDER_OPTIONS } : {}),
  } satisfies UserModelMessage;
}

export async function buildPromptMessages(args: {
  ctx: ActionCtx;
  sharedContext: SharedContext;
  systemPrompt: string;
  staticContext: string;
}) {
  const { rawPromptMessages } = getPromptHistorySegments(args.sharedContext);

  const promptMessages: ModelMessage[] = [
    {
      role: "system",
      content: args.systemPrompt,
    } satisfies SystemModelMessage,
  ];

  const rawHistoryEntries = await Promise.all(
    rawPromptMessages.map((message) =>
      serializeTranscriptEntry(args.ctx, message),
    ),
  );
  const rawHistoryChunks = chunkSerializedEntriesByTokenBudget(
    rawHistoryEntries,
    RAW_HISTORY_CACHE_CHUNK_TOKENS,
  );
  const stableRawHistoryChunks = rawHistoryChunks.slice(0, -1);
  const dynamicRawHistoryChunks = rawHistoryChunks.slice(-1);

  const cacheableSectionContents = [
    wrapPromptSection("STATIC_CONTEXT", args.staticContext),
    args.sharedContext.thread.compacted_history_summary
      ? wrapPromptSection(
          "COMPACTED_CHAT_HISTORY",
          args.sharedContext.thread.compacted_history_summary,
        )
      : "",
    ...stableRawHistoryChunks.map((chunk, index) =>
      wrapPromptSection(`RAW_CHAT_HISTORY_CHUNK index="${index}"`, chunk),
    ),
  ].filter(Boolean);

  const cacheableSectionsToMark = Math.min(
    MAX_ANTHROPIC_CACHE_BREAKPOINTS,
    cacheableSectionContents.length,
  );
  const firstCacheableIndex =
    cacheableSectionContents.length - cacheableSectionsToMark;

  cacheableSectionContents.forEach((content, index) => {
    promptMessages.push(
      createUserPromptMessage(content, index >= firstCacheableIndex),
    );
  });

  dynamicRawHistoryChunks.forEach((chunk, index) => {
    const stableChunkCount = stableRawHistoryChunks.length;
    promptMessages.push(
      createUserPromptMessage(
        wrapPromptSection(
          `RAW_CHAT_HISTORY_CHUNK index="${stableChunkCount + index}"`,
          chunk,
        ),
      ),
    );
  });

  const continuationSection = wrapPromptSection(
    "IN_ACTION_CONTINUATION_MESSAGES",
    args.sharedContext.currentTurnMessages.join("\n\n"),
  );
  if (continuationSection) {
    promptMessages.push(createUserPromptMessage(continuationSection));
  }

  return promptMessages;
}

export function getPromptCacheKey(sharedContext: SharedContext) {
  return [
    "vly-agent-v2",
    sharedContext.threadId,
    sharedContext.model,
    sharedContext.thread.compaction_count ?? 0,
  ].join(":");
}
