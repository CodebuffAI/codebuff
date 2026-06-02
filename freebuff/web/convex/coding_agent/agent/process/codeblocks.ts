"use node";

import { ActionCtx } from "!/_generated/server";
import { SharedContext } from "!/coding_agent/context/assembly";
import { createTerminationQueryThrottler } from "!/coding_agent/terminationThrottle";
import { fastApply } from "!/utils/fast_apply";
import { validateAndFixCronIntervals, isCronsFile } from "./cronValidator";
import {
  validateConvexCosts,
  isConvexFunctionFile,
  formatViolations,
} from "./costValidator";

/**
 * Checks if a file path is a protected .env file
 */
function isProtectedEnvFile(filePath: string): boolean {
  return (
    filePath === ".env" ||
    filePath.endsWith("/.env") ||
    filePath.startsWith(".env.") ||
    filePath.endsWith("/.env.local") ||
    filePath.endsWith("/.env.development") ||
    filePath.endsWith("/.env.production") ||
    filePath.endsWith("/.env.test") ||
    filePath.endsWith("/.env.staging")
  );
}

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
 * Extracts codeblocks from agentResult.text, creates/edits files, and runs type checking.
 * Returns codegenResult string.
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

  const checkTerminatedThrottled = createTerminationQueryThrottler(
    context.project._id,
  );
  const checkTerminated = async () => {
    return checkTerminatedThrottled(ctx);
  };
  // Using same regex pattern as wrapper backend for consistency
  const codeblockRegex = /```([^\n]*)\n([\s\S]*?)```/g;
  const codeblocks: {
    file_path: string;
    content: string | { search: string; replace: string };
    format?: "semantic" | "diff-fenced";
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

    // Check if this is a diff-fenced format - improved regex to handle whitespace variations
    const diffFencedMatch = content.match(
      /^<<<<<<< SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE\s*$/,
    );

    if (diffFencedMatch) {
      // This is a diff-fenced format - use the label as the file path
      const filePath = label.trim();
      const searchContent = diffFencedMatch[1];
      const replaceContent = diffFencedMatch[2];

      codeblocks.push({
        file_path: filePath,
        content: {
          search: searchContent,
          replace: replaceContent,
        },
        format: "diff-fenced",
      });
    } else {
      // This is the standard semantic file format
      codeblocks.push({ file_path: label, content, format: "semantic" });
    }
  }

  if (codeblocks.length === 0) {
    return {
      fileResults: [],
      typeCheckResult: {
        success: true,
        output: "",
      },
    };
  } else {
    // Process all codeblocks sequentially
    const actionResults: WriteFileResult["fileResults"] = [];

    for (const block of codeblocks) {
      // Check for termination before processing each file
      if (await checkTerminated()) {
        console.log(
          "[processCodeblocks] Project terminated, stopping file processing",
        );
        // Return early with whatever we've processed so far
        return {
          fileResults: actionResults,
          typeCheckResult: {
            success: false,
            output: "Processing terminated by user",
          },
        };
      }

      const fileExists = fileExistsInContext(block.file_path);

      // Prevent writing to vly-toolbar-readonly.tsx
      if (
        block.file_path === "vly-toolbar-readonly.tsx" ||
        block.file_path.endsWith("/vly-toolbar-readonly.tsx")
      ) {
        actionResults.push({
          path: block.file_path,
          success: false as const,
          error: `Access denied: ${block.file_path} is a read-only system file and cannot be modified.`,
        });
        continue;
      }

      // Prevent writing to .env files
      if (isProtectedEnvFile(block.file_path)) {
        actionResults.push({
          path: block.file_path,
          success: false as const,
          error: `Access denied: ${block.file_path} is a protected environment file and cannot be modified.`,
        });
        continue;
      }

      // Validate and fix cron intervals for crons.ts files
      if (isCronsFile(block.file_path) && typeof block.content === "string") {
        const validation = validateAndFixCronIntervals(block.content);
        if (validation.adjustments.length > 0) {
          // Log adjustments to Axiom via console
          console.log("[CRON_INTERVAL_ADJUSTMENT]", {
            projectId: context.project._id,
            threadId: context.threadId,
            filePath: block.file_path,
            adjustments: validation.adjustments,
          });
          // Use the adjusted content
          block.content = validation.content;
        }
      }

      // Validate Convex function files for expensive patterns
      if (
        isConvexFunctionFile(block.file_path) &&
        typeof block.content === "string"
      ) {
        const costValidation = validateConvexCosts(block.content);
        if (costValidation.violations.length > 0) {
          // Log violations to Axiom via console
          console.log("[COST_VALIDATION_WARNING]", {
            projectId: context.project._id,
            threadId: context.threadId,
            filePath: block.file_path,
            violations: costValidation.violations,
          });
          // Also log formatted message for easier debugging
          console.warn(
            formatViolations(costValidation.violations, block.file_path),
          );
        }
      }

      try {
        if (!fileExists) {
          // THIS SHOULD NEVER HAPPEN!!
          // For new files, handle diff-fenced format differently
          await context.codebase.writeFile(
            block.file_path,
            typeof block.content === "string"
              ? block.content
              : block.content.replace,
          );
          updateCachedFile(
            block.file_path,
            typeof block.content === "string"
              ? block.content
              : block.content.replace,
          );

          actionResults.push({
            path: block.file_path,
            success: true as const,
          });
        } else {
          const fileContent = await getFileContent(block.file_path);
          let mergedCode: string;

          if (block.format === "diff-fenced") {
            // Handle diff-fenced format: search and replace
            const diffData =
              typeof block.content === "string"
                ? JSON.parse(block.content)
                : block.content;

            // Normalize whitespace for comparison
            const normalizeWhitespace = (str: string) =>
              str.trim().replace(/\s+/g, " ");
            const searchNormalized = normalizeWhitespace(diffData.search);
            const fileContentNormalized = normalizeWhitespace(fileContent);

            // Try exact match first
            if (fileContent.includes(diffData.search)) {
              mergedCode = fileContent.replace(
                diffData.search,
                diffData.replace,
              );
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
                const afterLines = lines.slice(
                  startLineIndex + searchLines.length,
                );
                const replaceLines = diffData.replace.split("\n");
                mergedCode = [
                  ...beforeLines,
                  ...replaceLines,
                  ...afterLines,
                ].join("\n");
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
          } else {
            // Use existing semantic merging for standard format
            mergedCode = await fastApply(
              typeof block.content === "string"
                ? block.content
                : block.content.replace,
              fileContent,
            );
            //const mergedCode = await morphFastApply(block.content, fileContent);
          }

          await context.codebase.writeFile(block.file_path, mergedCode);
          updateCachedFile(block.file_path, mergedCode);

          actionResults.push({
            path: block.file_path,
            success: true as const,
          });
        }
      } catch (error) {
        const errorMsg = `Failed to ${fileExists ? "edit" : "create"} file ${block.file_path}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg, error);
        actionResults.push({
          path: block.file_path,
          success: false as const,
          error: errorMsg,
        });
      }
    }

    // Check for termination before setting up error checking
    if (await checkTerminated()) {
      console.log(
        "[processCodeblocks] Project terminated before error checking",
      );
      return {
        fileResults: actionResults,
        typeCheckResult: {
          success: false,
          output: "Processing terminated by user",
        },
      };
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
}
