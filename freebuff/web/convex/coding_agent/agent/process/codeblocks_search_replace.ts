"use node";

import { ActionCtx } from "!/_generated/server";
import { SharedContext } from "!/coding_agent/context/assembly";

type WriteFileResult = {
  fileResults: ({ path: string } & (
    | { success: true }
    | { success: false; error: string }
  ))[];
  typeCheckResult: {
    success: boolean;
    output: string;
  };
};

/**
 * Extracts codeblocks from agentResult.text, creates/edits files using search and replace methodology.
 * Returns codegenResult string.
 *
 * This new implementation only supports:
 * 1. CREATE FILE - for new files (complete file content)
 * 2. REPLACE FILE - for existing files (search and replace format)
 */
export async function processCodeblocksAndWriteFiles(
  ctx: ActionCtx,
  context: SharedContext,
  agentText: string,
): Promise<WriteFileResult> {
  const fileExistsInContext = (filePath: string) =>
    context.availableFilePaths.includes(filePath);

  const getFileContent = async (filePath: string) => {
    return context.readFileCached(filePath);
  };

  const updateCachedFile = (filePath: string, content: string) => {
    context.loadedFiles[filePath] = content;
    if (!context.availableFilePaths.includes(filePath)) {
      context.availableFilePaths.push(filePath);
    }
  };

  // Using same regex pattern as wrapper backend for consistency
  const codeblockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
  const codeblocks: {
    file_path: string;
    content: string | { search: string; replace: string };
    format: "create" | "search_replace";
  }[] = [];
  let match;

  while ((match = codeblockRegex.exec(agentText)) !== null) {
    const label = match[1].trim();
    const content = match[2];

    // Skip empty or invalid codeblocks
    if (!label || !content) {
      console.warn("[processCodeblocks] Skipping invalid codeblock:", {
        label,
        contentLength: content?.length,
      });
      continue;
    }

    // Check if this is a search and replace format - improved regex to handle whitespace variations
    const searchReplaceMatch = content.match(
      /^<<<<<<< SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE\s*$/,
    );

    if (searchReplaceMatch) {
      // This is a search and replace format
      const filePath = label.trim();
      const searchContent = searchReplaceMatch[1];
      const replaceContent = searchReplaceMatch[2];

      codeblocks.push({
        file_path: filePath,
        content: {
          search: searchContent,
          replace: replaceContent,
        },
        format: "search_replace",
      });
    } else {
      // Check for malformed search and replace blocks
      const hasSearchReplaceKeywords =
        content.includes("SEARCH") &&
        content.includes("REPLACE") &&
        content.includes("<<<") &&
        content.includes("===") &&
        content.includes(">>>");
      if (hasSearchReplaceKeywords) {
        console.error(
          "[processCodeblocks] Skipping malformed search and replace codeblock:",
          {
            label,
            contentPreview: content.substring(0, 100) + "...",
          },
        );
        continue;
      }

      // This is a create file format (complete file content)
      codeblocks.push({
        file_path: label,
        content,
        format: "create",
      });
    }
  }

  if (codeblocks.length === 0) {
    return {
      fileResults: [],
      typeCheckResult: { success: true, output: "" },
    };
  }

  console.log(`[processCodeblocks] Processing ${codeblocks.length} codeblocks`);

  // TODO: NOTE: the results of these action results are not returned to the agent; monitor warnings for failures
  const actionResults: ({ path: string } & (
    | { success: true }
    | { success: false; error: string }
  ))[] = [];

  // Process each codeblock
  for (const block of codeblocks) {
    try {
      const fileExists = fileExistsInContext(block.file_path);

      if (block.format === "create") {
        // CREATE FILE - write complete file content
        if (fileExists) {
          throw new Error(
            `File ${block.file_path} already exists. Use REPLACE FILE format to edit existing files.`,
          );
        }

        const fileContent =
          typeof block.content === "string"
            ? block.content
            : block.content.replace;
        await context.codebase.writeFile(block.file_path, fileContent);
        updateCachedFile(block.file_path, fileContent);

        actionResults.push({
          path: block.file_path,
          success: true as const,
        });

        console.log(`[processCodeblocks] Created file: ${block.file_path}`);
      } else if (block.format === "search_replace") {
        // REPLACE FILE - use search and replace
        if (!fileExists) {
          throw new Error(
            `File ${block.file_path} does not exist. Use CREATE FILE format to create new files.`,
          );
        }

        const fileContent = await getFileContent(block.file_path);
        const diffData = block.content as { search: string; replace: string };
        let mergedCode: string;

        // Normalize whitespace for comparison
        const normalizeWhitespace = (str: string) =>
          str.trim().replace(/\s+/g, " ");
        const searchNormalized = normalizeWhitespace(diffData.search);
        const fileContentNormalized = normalizeWhitespace(fileContent);

        // Try exact match first
        if (fileContent.includes(diffData.search)) {
          mergedCode = fileContent.replace(diffData.search, diffData.replace);
        }
        // Try normalized whitespace match
        else if (fileContentNormalized.includes(searchNormalized)) {
          // Find the actual text in the file that matches the normalized search
          const lines = fileContent.split("\n");
          const searchLines = diffData.search.split("\n");

          // Find starting line that matches first line of search
          let startLineIndex = -1;
          for (let i = 0; i <= lines.length - searchLines.length; i++) {
            if (
              normalizeWhitespace(lines[i]) ===
              normalizeWhitespace(searchLines[0])
            ) {
              // Check if subsequent lines match
              let allMatch = true;
              for (let j = 1; j < searchLines.length; j++) {
                if (
                  i + j >= lines.length ||
                  normalizeWhitespace(lines[i + j]) !==
                    normalizeWhitespace(searchLines[j])
                ) {
                  allMatch = false;
                  break;
                }
              }
              if (allMatch) {
                startLineIndex = i;
                break;
              }
            }
          }

          if (startLineIndex !== -1) {
            // Replace the matched lines
            const beforeLines = lines.slice(0, startLineIndex);
            const afterLines = lines.slice(startLineIndex + searchLines.length);
            const replaceLines = diffData.replace.split("\n");
            mergedCode = [...beforeLines, ...replaceLines, ...afterLines].join(
              "\n",
            );
          } else {
            throw new Error(
              `Search pattern not found in file: ${block.file_path}. Search pattern: "${diffData.search}"`,
            );
          }
        } else {
          throw new Error(
            `Search pattern not found in file: ${block.file_path}. Search pattern: "${diffData.search}"`,
          );
        }

        await context.codebase.writeFile(block.file_path, mergedCode);
        updateCachedFile(block.file_path, mergedCode);

        actionResults.push({
          path: block.file_path,
          success: true as const,
        });

        console.log(
          `[processCodeblocks] Successfully replaced content in ${block.file_path}`,
        );
      }
    } catch (error) {
      const errorMsg = `Failed to ${block.format === "create" ? "create" : "edit"} file ${block.file_path}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg, error);
      actionResults.push({
        path: block.file_path,
        success: false as const,
        error: errorMsg,
      });
    }
  }

  // Update message state to checking errors (scheduled to not block execution)
  // Set up shared context for unified error checking
  const hasSuccessfulWrites = actionResults.some((result) => result.success);

  // Track changed files from codeblocks
  for (const block of codeblocks) {
    if (!context.changedFiles.includes(block.file_path)) {
      context.changedFiles.push(block.file_path);
    }
  }

  // Set up context for unified error checking
  context.hasSuccessfulWrites = hasSuccessfulWrites;
  context.codeblocksForLogging = codeblocks.map((block) => block.file_path);
  context.needsErrorCheck = true;

  return {
    fileResults: actionResults,
    typeCheckResult: {
      success: true, // Will be determined in unified error checking
      output: "", // Will be set in unified error checking
    },
  };
}
