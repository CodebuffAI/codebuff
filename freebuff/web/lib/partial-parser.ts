export type FileEdit = {
  type: "create" | "edit" | "replace";
  path: string;
  content: string;
  isComplete: boolean;
};

type FilePart = {
  type: "file";
  data: FileEdit;
};

type TextPart = {
  type: "text";
  data: string;
};

export type MessagePart = TextPart | FilePart;

/**
 * Parses output from an AI coding agent into structured MessagePart objects.
 * Properly handles streaming/incomplete input including partial operations.
 *
 * @param input The string output from the AI coding agent (may be incomplete)
 * @returns Array of MessagePart objects (TextPart | FilePart)
 */
export function parseAIOutput(input: string): MessagePart[] {
  const result: MessagePart[] = [];

  // Add debug logging for parsing issues
  if (!input || typeof input !== "string") {
    console.warn("[parseAIOutput] Invalid input:", input);
    return [];
  }

  // Use a more robust approach - find all file operations in the input
  const fileOperationRegex =
    /(EDIT FILE|CREATE FILE|REPLACE FILE)\s*\n\s*```(?:([^\n]*?)(?:\n|$)|([^\n]*?)(?:\n|$))/g;
  const matches: Array<{
    operation: string;
    path: string;
    startIndex: number;
    fullMatch: string;
  }> = [];
  let match;

  while ((match = fileOperationRegex.exec(input)) !== null) {
    let path = match[2] || match[3] || "";

    // If no path was captured, try to extract it from the content
    if (!path) {
      const contentStart = match.index + match[0].length;
      const nextNewline = input.indexOf("\n", contentStart);
      if (nextNewline !== -1) {
        path = input.substring(contentStart, nextNewline).trim();
      }
    }

    matches.push({
      operation: match[1],
      path: path,
      startIndex: match.index,
      fullMatch: match[0],
    });
  }

  if (matches.length === 0) {
    // No file operations found, just text
    return input.trim() ? [{ type: "text", data: input.trim() }] : [];
  }

  // Process the input based on matches
  let lastIndex = 0;
  matches.forEach((match, index) => {
    // Add text before the operation
    if (match.startIndex > lastIndex) {
      const textBefore = input.substring(lastIndex, match.startIndex).trim();
      if (textBefore) {
        result.push({ type: "text", data: textBefore });
      }
    }

    // Extract the operation content
    const operationStart = match.startIndex + match.fullMatch.length;
    const nextMatch = matches[index + 1];
    const operationEnd = nextMatch ? nextMatch.startIndex : input.length;

    let content = input.substring(operationStart, operationEnd);

    // If the path was extracted separately and is on the first line of content, skip it
    if (match.path && content.startsWith(match.path + "\n")) {
      content = content.substring(match.path.length + 1);
    }
    let isComplete = false;

    // Check if the operation is complete (ends with ```)
    const closingBackticksIndex = content.lastIndexOf("```");
    if (closingBackticksIndex !== -1) {
      isComplete = true;
      content = content.substring(0, closingBackticksIndex);

      // Check if there's text after the closing backticks
      if (closingBackticksIndex + 3 < content.length) {
        const textAfter = content.substring(closingBackticksIndex + 3).trim();
        if (textAfter) {
          // Push this as separate text part
          result.push({
            type: "text",
            data: textAfter,
          });
        }
      }
    } else {
      // Incomplete operation detected
    }

    // Add the file operation
    const opType =
      match.operation === "EDIT FILE"
        ? "edit"
        : match.operation === "CREATE FILE"
          ? "create"
          : "replace";

    result.push({
      type: "file",
      data: {
        type: opType,
        path: match.path.trim(),
        content: content,
        isComplete: isComplete,
      },
    });

    lastIndex = operationEnd;
  });

  // Add any remaining text after the last operation
  if (lastIndex < input.length) {
    const remainingText = input.substring(lastIndex).trim();
    if (remainingText) {
      result.push({ type: "text", data: remainingText });
    }
  }

  // Filter out standalone operation markers that shouldn't be treated as text
  return result.filter(
    (p) =>
      !(
        p.type === "text" &&
        (p.data === "CREATE FILE" ||
          p.data === "EDIT FILE" ||
          p.data === "REPLACE FILE" ||
          p.data.trim() === "")
      ),
  );
}
