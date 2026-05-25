/**
 * Stream parser for CLI agent output
 *
 * This module handles parsing and filtering of stream items from the CLI agent,
 * extracting content, filtering sensitive data, and formatting tool_use items.
 */

export interface AssistantStreamItem {
  type: string;
  title?: string;
  status?: string;
  content: string;
  description?: string;
  thinking?: string;
}

export interface ProcessStreamItemResult {
  shouldSave: boolean;
  streamItem?: AssistantStreamItem;
  shouldTerminate?: boolean;
  sessionId?: string;
  usage?: {
    totalCostUsd?: number;
    usageBreakdown?: {
      input_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
      output_tokens: number;
      other?: string;
    };
  };
}

/**
 * Extract text content from an array of content items
 */
function extractTextFromArray(items: any[]): string {
  const textParts = items
    .filter(
      (item: any) =>
        item &&
        typeof item === "object" &&
        item.type === "text" &&
        typeof item.text === "string" &&
        item.text,
    )
    .map((item: any) => item.text);
  return textParts.join("\n");
}

/**
 * Strip the /home/daytona/codebase/ prefix from file paths
 */
function stripCodebasePrefix(filePath: string): string {
  const prefix = "/home/daytona/codebase/";
  if (filePath.startsWith(prefix)) {
    return filePath.substring(prefix.length);
  }
  return filePath;
}

/**
 * Extract thinking blocks from an array of content items
 */
function extractThinkingBlocks(items: any[]): Array<{ thinking: string }> {
  return items
    .filter(
      (item: any) =>
        item &&
        typeof item === "object" &&
        item.type === "thinking" &&
        typeof item.thinking === "string" &&
        item.thinking.trim().length > 0,
    )
    .map((item: any) => ({ thinking: item.thinking }));
}

/**
 * Format tool_use items into readable text
 */
function formatToolUseItems(items: any[]): string[] {
  return items
    .filter(
      (item: any) =>
        item && typeof item === "object" && item.type === "tool_use",
    )
    .map((item: any) => {
      try {
        const toolName =
          item.name && typeof item.name === "string" ? item.name : "Tool";
        const toolInput =
          item.input && typeof item.input === "object" ? item.input : {};
        if (typeof toolInput.command === "string") {
          return `Using ${toolName}: ${toolInput.command}`;
        } else if (typeof toolInput.file_path === "string") {
          const cleanPath = stripCodebasePrefix(toolInput.file_path);
          return `Using ${toolName}: ${cleanPath}`;
        } else {
          return `Using ${toolName}...`;
        }
      } catch {
        return `Using Tool...`;
      }
    })
    .filter((part: any) => part); // Remove any undefined/null results
}

/**
 * Extract description from tool_use items
 */
function extractDescriptionFromToolUse(items: any[]): string | undefined {
  try {
    const toolUseItem = items.find(
      (item: any) =>
        item &&
        typeof item === "object" &&
        item.type === "tool_use" &&
        item.input &&
        typeof item.input === "object",
    );
    if (
      toolUseItem?.input?.description &&
      typeof toolUseItem.input.description === "string"
    ) {
      return toolUseItem.input.description;
    }
  } catch {
    // Ignore description extraction errors
  }
  return undefined;
}

/**
 * Parse content from an array structure
 */
function parseArrayContent(
  items: any[],
): { content: string; description?: string; thinking?: string } | null {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return null;
    }

    const textContent = extractTextFromArray(items);
    const toolUseParts = formatToolUseItems(items);
    const description = extractDescriptionFromToolUse(items);
    const thinkingBlocks = extractThinkingBlocks(items);

    // Combine text and tool_use parts
    const allParts = [textContent, ...toolUseParts].filter((part) => part);
    const content = allParts.join("\n");

    // Combine thinking blocks if any
    const thinking =
      thinkingBlocks.length > 0
        ? thinkingBlocks.map((b) => b.thinking).join("\n\n")
        : undefined;

    // If we have thinking blocks but no other content, still return thinking
    if (!content && thinking) {
      return { content: "", thinking, description };
    }

    // If we have no content at all, filter it out
    if (!content && !thinking) {
      return null;
    }

    return { content, thinking, description };
  } catch (error) {
    // Log error for debugging but don't throw
    console.error("[StreamParser] Error in parseArrayContent:", error);
    return null;
  }
}

/**
 * Parse content from a JSON string
 */
function parseJsonStringContent(
  jsonString: string,
): { content: string; description?: string; thinking?: string } | null {
  try {
    if (!jsonString || typeof jsonString !== "string") {
      return null;
    }

    const parsedContent = JSON.parse(jsonString);
    if (Array.isArray(parsedContent)) {
      // Array of items - parse each item
      return parseArrayContent(parsedContent);
    } else if (typeof parsedContent === "object" && parsedContent !== null) {
      // Single object - extract text if available, or format tool_use, or extract thinking
      if (
        parsedContent.type === "text" &&
        typeof parsedContent.text === "string" &&
        parsedContent.text.trim().length > 0
      ) {
        return { content: parsedContent.text };
      } else if (
        parsedContent.type === "thinking" &&
        typeof parsedContent.thinking === "string" &&
        parsedContent.thinking.trim().length > 0
      ) {
        return { content: "", thinking: parsedContent.thinking };
      } else if (parsedContent.type === "tool_use") {
        const toolName =
          parsedContent.name && typeof parsedContent.name === "string"
            ? parsedContent.name
            : "Tool";
        const toolInput =
          parsedContent.input && typeof parsedContent.input === "object"
            ? parsedContent.input
            : {};
        let content = "";
        if (typeof toolInput.command === "string") {
          content = `Using ${toolName}: ${toolInput.command}`;
        } else if (typeof toolInput.file_path === "string") {
          const cleanPath = stripCodebasePrefix(toolInput.file_path);
          content = `Using ${toolName}: ${cleanPath}`;
        } else {
          content = `Using ${toolName}...`;
        }
        const description =
          toolInput.description && typeof toolInput.description === "string"
            ? toolInput.description
            : undefined;
        return { content, description };
      } else {
        // Filter out non-text, non-tool_use, non-thinking objects
        return null;
      }
    } else {
      // Parsed to primitive value, use as-is
      return { content: String(parsedContent) };
    }
  } catch (error) {
    // If parsing fails, it's just a regular string - use as-is
    // But don't return null - return the string as content
    return { content: jsonString };
  }
}

/**
 * Parse user type content and extract tool results
 */
function parseUserContent(parsed: any): {
  content: string;
  isToolResult: boolean;
} {
  let content = "";
  let isToolResult = false;

  // Check if this is a tool result message structure
  // Structure: {"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"..."}]}}
  if (
    parsed.message &&
    typeof parsed.message === "object" &&
    parsed.message !== null
  ) {
    const message = parsed.message;
    if (message.role === "user" && Array.isArray(message.content)) {
      // Extract tool_result items from content array
      const toolResults = message.content
        .filter(
          (item: any) => item && item.type === "tool_result" && item.content,
        )
        .map((item: any) => {
          if (typeof item.content === "string") {
            return item.content;
          }
          return JSON.stringify(item.content);
        });

      if (toolResults.length > 0) {
        content = toolResults.join("\n\n");
        isToolResult = true;
        return { content, isToolResult };
      }

      // Fallback: extract text from content array
      const textParts = message.content
        .filter((item: any) => item && item.type === "text" && item.text)
        .map((item: any) => item.text);
      content = textParts.join("\n");
    }
  }

  // Handle content field - may be a JSON string that needs parsing
  if (!content && parsed.content) {
    if (typeof parsed.content === "string") {
      // Try to parse as JSON string first
      try {
        const parsedContent = JSON.parse(parsed.content);
        // Handle case where it's an object with role and content
        if (typeof parsedContent === "object" && parsedContent !== null) {
          if (
            parsedContent.role === "user" &&
            Array.isArray(parsedContent.content)
          ) {
            // Extract tool_result items first
            const toolResults = parsedContent.content
              .filter(
                (item: any) =>
                  item && item.type === "tool_result" && item.content,
              )
              .map((item: any) => {
                if (typeof item.content === "string") {
                  return item.content;
                }
                return JSON.stringify(item.content);
              });

            if (toolResults.length > 0) {
              content = toolResults.join("\n\n");
              isToolResult = true;
              return { content, isToolResult };
            }

            // Extract text from content array
            const textParts = parsedContent.content
              .filter((item: any) => item && item.type === "text" && item.text)
              .map((item: any) => item.text);
            content = textParts.join("\n");

            // If no text, try to extract meaningful info from tool_use_id items
            if (!content) {
              const toolUseIds = parsedContent.content
                .filter((item: any) => item.tool_use_id)
                .map((item: any) => `Tool result for ${item.tool_use_id}`);
              content = toolUseIds.join("\n") || parsed.content;
            }
          } else if (Array.isArray(parsedContent.content)) {
            // Content is directly an array
            const toolResults = parsedContent.content
              .filter(
                (item: any) =>
                  item && item.type === "tool_result" && item.content,
              )
              .map((item: any) => {
                if (typeof item.content === "string") {
                  return item.content;
                }
                return JSON.stringify(item.content);
              });

            if (toolResults.length > 0) {
              content = toolResults.join("\n\n");
              isToolResult = true;
              return { content, isToolResult };
            }

            const textParts = parsedContent.content
              .filter((item: any) => item && item.type === "text" && item.text)
              .map((item: any) => item.text);
            content = textParts.join("\n") || parsed.content;
          } else if (typeof parsedContent.content === "string") {
            content = parsedContent.content;
          } else {
            content = parsed.content;
          }
        } else {
          content = parsed.content;
        }
      } catch {
        // If parsing fails, it's just a regular string - use as-is
        content = parsed.content;
      }
    } else if (Array.isArray(parsed.content)) {
      // Content is already an array
      const toolResults = parsed.content
        .filter(
          (item: any) => item && item.type === "tool_result" && item.content,
        )
        .map((item: any) => {
          if (typeof item.content === "string") {
            return item.content;
          }
          return JSON.stringify(item.content);
        });

      if (toolResults.length > 0) {
        content = toolResults.join("\n\n");
        isToolResult = true;
        return { content, isToolResult };
      }

      const textParts = parsed.content
        .filter((item: any) => item && item.type === "text" && item.text)
        .map((item: any) => item.text);
      content = textParts.join("\n") || JSON.stringify(parsed.content);
    } else if (typeof parsed.content === "object" && parsed.content !== null) {
      // Content is already an object
      if (
        parsed.content.content &&
        typeof parsed.content.content === "string"
      ) {
        content = parsed.content.content;
      } else if (Array.isArray(parsed.content.content)) {
        const toolResults = parsed.content.content
          .filter(
            (item: any) => item && item.type === "tool_result" && item.content,
          )
          .map((item: any) => {
            if (typeof item.content === "string") {
              return item.content;
            }
            return JSON.stringify(item.content);
          });

        if (toolResults.length > 0) {
          content = toolResults.join("\n\n");
          isToolResult = true;
          return { content, isToolResult };
        }

        const textParts = parsed.content.content
          .filter((item: any) => item && item.type === "text" && item.text)
          .map((item: any) => item.text);
        content = textParts.join("\n") || JSON.stringify(parsed.content);
      } else {
        content = JSON.stringify(parsed.content);
      }
    } else {
      content = String(parsed.content);
    }
  } else if (!content && parsed.message) {
    content =
      typeof parsed.message === "string"
        ? parsed.message
        : JSON.stringify(parsed.message);
  } else if (!content) {
    content = JSON.stringify(parsed);
  }

  return { content, isToolResult };
}

/**
 * Parse assistant type content
 */
function parseAssistantContent(parsed: any): {
  content: string;
  description?: string;
  thinking?: string;
} | null {
  let content = "";
  let description: string | undefined = undefined;
  let thinking: string | undefined = undefined;

  // Handle case where content is in message.content
  if (parsed.message) {
    if (parsed.message.content && Array.isArray(parsed.message.content)) {
      const result = parseArrayContent(parsed.message.content);
      if (result) {
        return result;
      }
      // If parsing failed, try to stringify safely
      try {
        content = JSON.stringify(parsed.message.content);
      } catch {
        content = String(parsed.message.content);
      }
    } else if (typeof parsed.message.content === "string") {
      const result = parseJsonStringContent(parsed.message.content);
      if (result) {
        return result;
      }
      content = parsed.message.content;
    } else {
      // Fallback: try to stringify safely
      try {
        content = JSON.stringify(parsed.message);
      } catch {
        try {
          content = String(parsed.message);
        } catch {
          return null;
        }
      }
    }
  } else if (parsed.content) {
    // Handle case where content is directly in parsed.content
    if (typeof parsed.content === "string") {
      // Try to parse as JSON string first
      const result = parseJsonStringContent(parsed.content);
      if (result) {
        return result;
      }
      content = parsed.content;
    } else if (Array.isArray(parsed.content)) {
      const result = parseArrayContent(parsed.content);
      if (result) {
        return result;
      }
      // If parsing failed, try to stringify safely
      try {
        content = JSON.stringify(parsed.content);
      } catch {
        content = String(parsed.content);
      }
    } else if (typeof parsed.content === "object" && parsed.content !== null) {
      try {
        // Content is already an object
        if (
          parsed.content.type === "text" &&
          typeof parsed.content.text === "string" &&
          parsed.content.text
        ) {
          content = parsed.content.text;
        } else if (
          parsed.content.type === "thinking" &&
          typeof parsed.content.thinking === "string"
        ) {
          thinking = parsed.content.thinking;
          content = ""; // Thinking blocks have no regular content
        } else if (parsed.content.type === "tool_use") {
          const toolName =
            parsed.content.name && typeof parsed.content.name === "string"
              ? parsed.content.name
              : "Tool";
          const toolInput =
            parsed.content.input && typeof parsed.content.input === "object"
              ? parsed.content.input
              : {};
          if (typeof toolInput.command === "string") {
            content = `Using ${toolName}: ${toolInput.command}`;
          } else if (typeof toolInput.file_path === "string") {
            content = `Using ${toolName}: ${toolInput.file_path}`;
          } else {
            content = `Using ${toolName}...`;
          }
          // Extract description from tool_use input (defensive)
          if (
            toolInput.description &&
            typeof toolInput.description === "string"
          ) {
            description = toolInput.description;
          }
        } else {
          // Filter out non-text, non-tool_use, non-thinking objects
          return null;
        }
      } catch {
        // If processing fails, filter it out
        return null;
      }
    } else {
      // Fallback: use as string (defensive)
      try {
        if (parsed.content === null || parsed.content === undefined) {
          return null; // Don't save null/undefined
        }
        content = String(parsed.content);
      } catch {
        return null; // If string conversion fails, filter it out
      }
    }
  } else {
    return null;
  }

  // Ensure content is always a string
  if (typeof content !== "string") {
    try {
      content = String(content);
    } catch {
      return null; // If conversion fails, filter it out
    }
  }

  // If we have thinking but no content, still return it (thinking blocks are valid)
  if (thinking && (!content || content.trim() === "")) {
    return { content: "", thinking, description };
  }

  // Don't save empty content (unless we have thinking)
  if (!content || (typeof content === "string" && content.trim() === "")) {
    if (!thinking) {
      return null;
    }
  }

  return { content, thinking, description };
}

/**
 * Parse tool_use type content
 */
function parseToolUseContent(parsed: any): AssistantStreamItem | null {
  try {
    // Tool use type: extract tool name and input (defensive)
    const title =
      parsed.name && typeof parsed.name === "string" ? parsed.name : "Tool";
    const toolInput =
      parsed.input && typeof parsed.input === "object" && parsed.input !== null
        ? parsed.input
        : {};
    let content = "";

    // Format tool input nicely (defensive type checks)
    if (typeof toolInput.command === "string") {
      content = `Command: ${toolInput.command}`;
      if (typeof toolInput.description === "string") {
        content += `\nDescription: ${toolInput.description}`;
      }
      if (typeof toolInput.timeout === "number") {
        content += `\nTimeout: ${toolInput.timeout}ms`;
      }
    } else if (typeof toolInput.file_path === "string") {
      const cleanPath = stripCodebasePrefix(toolInput.file_path);
      content = `File: ${cleanPath}`;
      if (toolInput.old_string) {
        content += `\nEditing file...`;
      }
    } else {
      // Safe stringify with fallback
      try {
        content = JSON.stringify(toolInput, null, 2);
      } catch {
        content = String(toolInput);
      }
    }

    // Extract description from tool input if available (defensive)
    const description =
      typeof toolInput.description === "string"
        ? toolInput.description
        : undefined;

    // Ensure content is a string
    if (typeof content !== "string") {
      content = String(content);
    }

    // Don't save empty content
    if (!content || content.trim() === "") {
      return null;
    }

    return {
      type: "tool_use",
      title,
      status: parsed.status,
      content,
      description,
    };
  } catch {
    // If processing fails, filter it out
    return null;
  }
}

/**
 * Process a stream item and return the result
 */
export function processStreamItem(parsed: any): ProcessStreamItemResult {
  const type = parsed.type || "other";

  // SECURITY: Handle result type - process session ID and usage, then terminate
  if (type === "result") {
    const result: ProcessStreamItemResult = {
      shouldSave: false,
      shouldTerminate: false,
    };

    // Extract session ID if present in result
    if (parsed.session_id) {
      result.sessionId = parsed.session_id;
    }

    // Extract and update usage information if present
    if (parsed.total_cost_usd !== undefined || parsed.usage !== undefined) {
      result.usage = {
        totalCostUsd: parsed.total_cost_usd,
        usageBreakdown: parsed.usage
          ? {
              input_tokens: parsed.usage.input_tokens || 0,
              cache_creation_input_tokens:
                parsed.usage.cache_creation_input_tokens || 0,
              cache_read_input_tokens:
                parsed.usage.cache_read_input_tokens || 0,
              output_tokens: parsed.usage.output_tokens || 0,
              other: parsed.usage.server_tool_use
                ? JSON.stringify(parsed.usage.server_tool_use)
                : undefined,
            }
          : undefined,
      };
    }

    // Terminate once final usage is available.
    // Resumed sessions may omit session_id in the final result event.
    if (
      result.usage?.totalCostUsd !== undefined ||
      result.usage?.usageBreakdown !== undefined
    ) {
      result.shouldTerminate = true;
    }

    return result;
  }

  // SECURITY: Filter out text types - they may contain API keys or sensitive data
  if (type === "text") {
    return { shouldSave: false };
  }

  // SECURITY: Filter out system types - don't save system prompts
  if (type === "system") {
    return { shouldSave: false };
  }

  // Save user types (tool results) but only with a preview (first 50 characters)
  if (type === "user") {
    const result = parseUserContent(parsed);
    const isToolResult = result.isToolResult;

    // Get the fully parsed and formatted content
    let finalContent = result.content;

    // Truncate tool results to 2000 characters - AFTER all parsing and formatting is complete
    if (isToolResult) {
      if (finalContent.length > 2000) {
        finalContent = finalContent.substring(0, 2000) + "...";
      }
    } else {
      // For non-tool-result user messages, show preview (first 50 characters)
      finalContent =
        finalContent.length > 50
          ? finalContent.substring(0, 50) + "..."
          : finalContent;
    }

    return {
      shouldSave: true,
      streamItem: {
        type: isToolResult ? "tool_result" : "user",
        title: parsed.title,
        status: parsed.status,
        content: finalContent,
        description: parsed.description,
      },
    };
  }

  // Process assistant type
  if (type === "assistant") {
    const result = parseAssistantContent(parsed);
    if (!result) {
      return { shouldSave: false };
    }

    // If we have thinking content, create a separate thinking item
    // Note: We can only return one item per call, so if there's both thinking and content,
    // we prioritize thinking and the content will be in a subsequent item
    if (result.thinking) {
      return {
        shouldSave: true,
        streamItem: {
          type: "thinking",
          title: "Thinking...",
          content: result.thinking,
        },
      };
    }

    // Only save if we have actual content (not just empty string)
    if (!result.content || result.content.trim() === "") {
      return { shouldSave: false };
    }

    return {
      shouldSave: true,
      streamItem: {
        type: "assistant",
        title: parsed.title,
        status: parsed.status,
        content: result.content,
        description: result.description || parsed.description,
      },
    };
  }

  // Process tool_use type
  if (type === "tool_use") {
    const streamItem = parseToolUseContent(parsed);
    if (!streamItem) {
      return { shouldSave: false };
    }

    return {
      shouldSave: true,
      streamItem,
    };
  }

  // All other types are filtered out for security
  return { shouldSave: false };
}
