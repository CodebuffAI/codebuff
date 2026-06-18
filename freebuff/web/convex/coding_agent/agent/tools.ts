"use node";
import { tool } from "ai";
import { z } from "zod";
import { internal } from "!/_generated/api";
import { SharedContext } from "../context/assembly";
import { scrapeWebsite } from "../../utils/divmagic";
import { extractWithFirecrawl } from "../../utils/firecrawl_scrape";
import { crossRank } from "!/utils/cross_rank";
import { kapaSearch } from "../../utils/kapa_search";
import { addIntegration } from "!/integrations/add_integration";
import { haikuSearch } from "!/utils/haiku_search";
import { countTokens } from "../helpers/tokenizer";
import { getContextLengthPreset } from "../config/contextLengthPresets";
import { Id } from "!/_generated/dataModel";

// Update ToolHandler type to be generic
type ToolHandler<T> = (
  args: T,
  sharedContext: SharedContext,
) => Promise<string>;

const MAX_TOOL_RESULT_TOKENS = 6_000;

function truncateToolOutput(toolName: string, content: string) {
  const tokenCount = countTokens(content);
  if (tokenCount <= MAX_TOOL_RESULT_TOKENS) {
    return content;
  }

  const maxChars = Math.max(4_000, Math.floor(MAX_TOOL_RESULT_TOKENS * 4.2));
  const headChars = Math.floor(maxChars * 0.75);
  const tailChars = Math.floor(maxChars * 0.25);

  return [
    content.slice(0, headChars),
    `\n... [${toolName} output truncated from ${tokenCount} tokens] ...\n`,
    content.slice(-tailChars),
  ].join("");
}

// =============================================================================
// TOOL 2: READ FILES TO CONTEXT
// =============================================================================

export const readFilesToContextSchema = z.object({
  file_paths: z.array(z.string()),
});

const readFilesToContextTool = tool({
  description: `Read one or more files directly from the codebase and return their current contents.
  Use this when you need the most up-to-date file contents before editing or relying on implementation details.
  Use exact paths from the codebase structure in the prompt. Do NOT use the execute command tool to run ls or find.
  It returns the file contents directly in the normal tool back-and-forth flow.
  If a file is too large to fit safely, it will be truncated deterministically with a warning.`,
  inputSchema: readFilesToContextSchema,
});

// TODO: verify logic of the adding files to context and ensure edited files are added to context
// Handlers with correct type for args
const readFilesToContextHandler: ToolHandler<
  z.infer<typeof readFilesToContextSchema>
> = async (args, sharedContext) => {
  const maxFileTokens = getContextLengthPreset(
    sharedContext.contextLength,
  ).fileTokensInContext;
  const truncateForToolResult = (filePath: string, content: string) => {
    const tokenCount = countTokens(content);
    if (tokenCount <= maxFileTokens) {
      return {
        warning: null,
        content,
      };
    }

    const maxChars = Math.max(4_000, Math.floor(maxFileTokens * 4.2));
    const headChars = Math.floor(maxChars * 0.7);
    const tailChars = Math.floor(maxChars * 0.3);
    return {
      warning: `⚠️ WARNING: ${filePath} is too large to include in full (${tokenCount} estimated tokens). The middle of the file was truncated.`,
      content: [
        content.slice(0, headChars),
        "\n... [truncated middle of file] ...\n",
        content.slice(-tailChars),
      ].join(""),
    };
  };

  const readFilesResult = args.file_paths.map((filePath: string) => {
    return sharedContext
      .readFileCached(filePath)
      .then((fileContent) => {
        const truncated = truncateForToolResult(filePath, fileContent);
        return [
          `<FILE path="${filePath}">`,
          truncated.warning ?? "",
          truncated.content,
          `</FILE>`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .catch(() => `File ${filePath} not found.`);
  });

  return truncateToolOutput(
    "readFilesToContextTool",
    (await Promise.all(readFilesResult)).join("\n\n"),
  );
};

// =============================================================================
// TOOL 2.5: EDIT CODE REPLACE
// =============================================================================

export const fileStringCodeReplaceSchema = z.object({
  file_path: z.string().describe("The path to the file to modify"),
  search_string: z.string().describe("The string to search for in the file"),
  replace_string: z
    .string()
    .describe("The string to replace the search string with"),
});

const fileStringCodeReplaceTool = tool({
  description: `Use this tool for small edits to a file. This is the diff string replace tool to make minor edits to a file. Replace all occurrences of a search string with a replace string in a specified file. This tool will find and replace all instances of the exact search string with the replacement string.`,
  inputSchema: fileStringCodeReplaceSchema,
});

const fileStringCodeReplaceHandler: ToolHandler<
  z.infer<typeof fileStringCodeReplaceSchema>
> = async (args, sharedContext) => {
  const { file_path, search_string, replace_string } = args;
  let originalContent: string;
  try {
    originalContent = await sharedContext.readFileCached(file_path);
  } catch {
    return `Error: File ${file_path} not found in the codebase.`;
  }

  // Count occurrences before replacement
  const occurrenceCount = (
    originalContent.match(
      new RegExp(search_string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    ) || []
  ).length;

  if (occurrenceCount === 0) {
    return `No occurrences of "${search_string}" found in ${file_path}.`;
  }

  // Perform the replacement
  const modifiedContent = originalContent.replace(
    new RegExp(search_string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    replace_string,
  );

  try {
    // Update the file using the codebase API
    await sharedContext.codebase.writeFile(file_path, modifiedContent);

    // Update the shared context
    sharedContext.loadedFiles[file_path] = modifiedContent;
    if (!sharedContext.availableFilePaths.includes(file_path)) {
      sharedContext.availableFilePaths.push(file_path);
    }

    await sharedContext.consoleLog(
      `[Tool:fileStringCodeReplace] String replacement completed`,
      "tool",
      {
        file_path,
        occurrences_replaced: occurrenceCount,
        search_string:
          search_string.substring(0, 50) +
          (search_string.length > 50 ? "..." : ""),
        replace_string:
          replace_string.substring(0, 50) +
          (replace_string.length > 50 ? "..." : ""),
      },
    );

    // Set a flag to trigger error checking at the end of the turn
    (sharedContext as SharedContext).needsErrorCheck = true;
    if (!(sharedContext as SharedContext).changedFiles.includes(file_path)) {
      (sharedContext as SharedContext).changedFiles.push(file_path);
    }
    (sharedContext as SharedContext).hasSuccessfulWrites = true;

    return `Successfully replaced ${occurrenceCount} occurrence(s) of "${search_string}" with "${replace_string}" in ${file_path}.`;
  } catch (error: any) {
    return `Error writing to file ${file_path}: ${error.message}`;
  }
};

// =============================================================================
// TOOL 3: SEMANTIC FILE SEARCH
// =============================================================================

export const semanticFileSearchSchema = z.object({
  query: z.string(),
});

// TODO: refine this shit
const semanticFileSearchTool = tool({
  description: `Use this to search for files using a query to orient yourself with the codebase. It will return a list of files that are semantically related to the query.
Only call this tool once per turn. Avoid calling it multiple times in a row. It should be a concise query about the logic to search for with relevant logical context.
`,
  inputSchema: semanticFileSearchSchema,
});

// Handlers with correct type for args
const semanticFileSearchHandler: ToolHandler<
  z.infer<typeof semanticFileSearchSchema>
> = async (args, sharedContext) => {
  const filteredFiles = sharedContext.availableFilePaths
    .map((file) => ({
      filename: file,
      code: file,
    }))
    .filter(
      (file) =>
        file.filename.endsWith(".ts") || // only rank ts and tsx files or md files
        file.filename.endsWith(".tsx") ||
        file.filename.endsWith(".md"),
      //file.filename.endsWith(".json") ||
      //file.filename.endsWith(".md") ||
      //file.filename.endsWith(".txt")
      //!file.filename.includes("components/ui"), // filter out shad cn components
    );

  const rankedFiles = await crossRank(args.query, filteredFiles, 12000, 0.1);

  // Check for files that exceed 20,000 characters and generate warnings
  const resultMessages: string[] = [];

  rankedFiles.forEach((filePath) => {
    resultMessages.push(filePath);
  });

  return truncateToolOutput(
    "semanticFileSearchTool",
    `Semantic file search results:\n${resultMessages.join("\n")}`,
  );
};

// =============================================================================
// TOOL 4: EXECUTE COMMAND
// =============================================================================

export const executeCommandSchema = z.object({
  command: z.string(),
});

const executeCommandTool = tool({
  description: `You can execute commands in the sandboxed environment, from the project's main directory. Use it to run scripts, install packages, grep, curl test API endpoints, etc.
It can run any command. Avoid running potentially destructive commands. Automatically times out after 60 seconds.

Do not use this to read files or perform file operations - use the read file tool (readFilesToContextTool) instead.`,
  inputSchema: executeCommandSchema,
});

// Handlers with correct type for args
const executeCommandHandler: ToolHandler<
  z.infer<typeof executeCommandSchema>
> = async (args, sharedContext) => {
  const { codebase } = sharedContext;
  const timeoutMs = 60 * 1000; // 60 seconds

  const normalizedCommand = args.command.trim();
  const fileReadViaShellPattern =
    /(^|\s)(cat|head|tail|more|less|sed|awk)\b/i;
  if (fileReadViaShellPattern.test(normalizedCommand)) {
    return "Command blocked: use readFilesToContextTool for reading files instead of shell readers (cat/head/tail/sed/awk). This keeps execution safer and faster.";
  }

  try {
    const result = await codebase.runCommand(normalizedCommand, timeoutMs);

    await sharedContext.consoleLog(
      `[Tool:executeCommand] Command completed`,
      "tool",
        {
          command: normalizedCommand,
          success: result.exitCode === 0,
          outputLength: result.output?.length || 0,
        },
      );

    // Update message state based on command result (scheduled to not block execution)
    if (result.exitCode === 0) {
      await sharedContext.ctx.scheduler.runAfter(
        0,
        internal.messages.updateMessageState,
        {
          messageId: sharedContext.assistantMessageId,
          status: "complete",
          message: "Command executed successfully",
        },
      );
    } else {
      // Command failure is an actual process error, not a type error
      await sharedContext.ctx.scheduler.runAfter(
        0,
        internal.messages.updateMessageState,
        {
          messageId: sharedContext.assistantMessageId,
          status: "error",
          message: `Command failed with exit code ${result.exitCode}`,
        },
      );
    }

    return truncateToolOutput(
      "executeCommandTool",
      `Result (exit code: ${result.exitCode}):\n${result.output}`,
    );
  } catch (error: any) {
    const errorMessage = `Command execution failed: ${error.message}`;

    // Update message state to error (scheduled to not block execution)
    await sharedContext.ctx.scheduler.runAfter(
      0,
      internal.messages.updateMessageState,
      {
        messageId: sharedContext.assistantMessageId,
        status: "error",
        message: errorMessage,
      },
    );

    // Don't update message content with error messages - only update state

    throw error;
  }
};

// =============================================================================
// TOOL 5: EXTERNAL SEARCH
// =============================================================================

export const externalSearchesSchema = z.object({
  queries: z.array(
    z.object({
      query: z.string(),
      ask_convex_docs: z.boolean().optional(), // uses kapa to search across convex docs
      deep_research: z.boolean().optional(), // allow for more in-depth research
    }),
  ),
});

const externalSearchesTool = tool({
  description: `Search a list of queries to get web-based answers using a natural language query. Use this to search for web information, specific documentation, code examples, technical help, etc.
  A separate research agent will search each query through google, sites, URLs, etc, and return relevant documentation, information, code examples, etc.
  You can also mark the convex documentation flag to true to ask an agent to search through the convex documentation.
  Provide necessary details and context for the research agent to answer the query.
  Include details about a specific integration you need information on to reference it. It will trigger a research agent to answer any issues about code, integrations, bugs, issues, etc.`,
  inputSchema: externalSearchesSchema,
});

// Handlers with correct type for args
// do gemini search with grounding
const externalSearchesHandler: ToolHandler<
  z.infer<typeof externalSearchesSchema>
> = async (args, sharedContext) => {
  const results = [];
  let hasErrors = false;

  for (const query of args.queries) {
    try {
      let searchResults: string = "Failed to search";
      if (query.ask_convex_docs) {
        searchResults = await kapaSearch(query.query);
      } else {
        searchResults =
          (await haikuSearch(
            sharedContext.ctx,
            query.query,
            query.deep_research ?? false,
          )) ?? "Failed to search";
      }

      if (searchResults === "Failed to search") {
        hasErrors = true;
      }

      results.push(`${query.query}:\n${searchResults}\n`);
    } catch (error: any) {
      hasErrors = true;
      results.push(`${query.query}:\nError searching: ${error.message}\n`);
    }
  }

  // Update message state based on whether there were any errors (scheduled to not block execution)
  if (hasErrors) {
    // Search failures are actual process errors, not type errors
    const errorMessage = "Some searches failed";
    await sharedContext.ctx.scheduler.runAfter(
      0,
      internal.messages.updateMessageState,
      {
        messageId: sharedContext.assistantMessageId,
        status: "error",
        message: errorMessage,
      },
    );

    // Don't update message content with error messages - only update state
  } else {
    await sharedContext.ctx.scheduler.runAfter(
      0,
      internal.messages.updateMessageState,
      {
        messageId: sharedContext.assistantMessageId,
        status: "complete",
        message: "All searches completed successfully",
      },
    );
  }

  return truncateToolOutput(
    "externalSearchesTool",
    results.join("\n----------\n"),
  );
};

// =============================================================================
// TOOL 6: SCRAPE WEBSITE
// =============================================================================

export const scrapeLinksSchema = z.object({
  links: z.array(
    z.object({
      url: z.string(),
      type: z.enum(["scrape_content", "extract_styles"]),
    }),
  ),
});

const scrapeLinksTool = tool({
  description: `Scrape a list of links to either extract content (for more specific information / docs) or extract tailwind styles (will provide tailwind CSS styling exactly on the page)
  scrape_content: returns formatted markdown version of the content
  extract_styles: returns raw jsx tailwind styles and raw content from the html. use this to get design inspiration or when use provides a reference link. 
  always note that extracted styles are hardcoded and can be messed up or too much. Always make sure it is responsive, uses exact colors and content, and all assets are linked as exactly the same.
  `,
  inputSchema: scrapeLinksSchema,
});

// Handlers with correct type for args
const scrapeLinksHandler: ToolHandler<
  z.infer<typeof scrapeLinksSchema>
> = async (args, sharedContext) => {
  const results = [];
  let hasErrors = false;

  for (const link of args.links) {
    try {
      let result;
      switch (link.type) {
        // case "crawl_links":
        //   result = await crawlUrlLinks(args.url);
        //   break;
        case "scrape_content":
          result = await extractWithFirecrawl(link.url);
          break;
        case "extract_styles":
          result = await scrapeWebsite(sharedContext.ctx, {
            url: link.url,
            projectId: sharedContext.projectId,
          });
          break;
        default:
          result = `Unknown scrape type: ${link.type}`;
      }
      results.push(`${link.url}:\n${result}\n`);
    } catch (error: any) {
      hasErrors = true;
      results.push(`Error scraping ${link.url}: ${error.message}`);
    }
  }

  // Update message state based on whether there were any errors (scheduled to not block execution)
  if (hasErrors) {
    // Scraping failures are actual process errors, not type errors
    await sharedContext.ctx.scheduler.runAfter(
      0,
      internal.messages.updateMessageState,
      {
        messageId: sharedContext.assistantMessageId,
        status: "error",
        message: "Some links failed to scrape",
      },
    );
  } else {
    await sharedContext.ctx.scheduler.runAfter(
      0,
      internal.messages.updateMessageState,
      {
        messageId: sharedContext.assistantMessageId,
        status: "complete",
        message: "All links scraped successfully",
      },
    );
  }

  return truncateToolOutput("scrapeLinksTool", results.join("\n----------\n"));
};

// =============================================================================
// TOOL 11: ADD INTEGRATION
// =============================================================================

export const addIntegrationSchema = z.object({
  integration_description: z
    .string()
    .describe(
      "A detailed description of the integration you would like to add. Include a general description of what you are looking for exactly.",
    ),
});

// TODO: allows user to expose the API field. accounts for if the integration is already added
const addIntegrationTool = tool({
  description: `CALL THIS TOOL WHEN TRYING TO ADD ANYTHING EXTERNAL TO THE PROJECT. This is required to let the user set env vars for an integrations. You must call this tool for it. Based on your description of the integration you want to add to the project, this tool will research and add the new integration to this project, allowing the user to add the correct env vars, obtain the API keys, and will give you setup instructions.
When adding, the agent will:
1. Check the existing integrations library for existing integrations that match the description / examples
2. If no existing integrations are found, the agent will research and add a new integration to the library, adding in the instructions and details
3. If it exists, the agent will immediately return the existing integration.

When describing the integration:
- Be descriptive as to what the integration must do
- include user specific information 
- if the user asks for a specific integration, include the name of the integration

This process may take a while to complete; keep these calls minimal; add one integration at a time with this tool, and you can call this tool multiple times.
  `,
  inputSchema: addIntegrationSchema,
});

// Handlers with correct type for args
const addIntegrationHandler: ToolHandler<
  z.infer<typeof addIntegrationSchema>
> = async (args, sharedContext) => {
  const resultText = await addIntegration(
    sharedContext.ctx,
    sharedContext,
    args.integration_description,
  );
  return truncateToolOutput("addIntegrationTool", resultText);
};

// =============================================================================
// TOOL 12: SEARCH UI PRESETS
// =============================================================================

export const searchUiPresetsSchema = z.object({
  query: z
    .string()
    .describe(
      "Natural language description of the UI component or theme you're looking for",
    ),
  category: z
    .enum(["theme", "component"])
    .optional()
    .describe(
      "Optional filter: 'theme' for styling themes, 'component' for UI elements",
    ),
  max_results: z
    .number()
    .optional()
    .describe("Maximum results to return (default: 3, max: 5)"),
});

const searchUiPresetsTool = tool({
  description: `Search the UI preset library to find pre-built UI components and themes.
MANDATORY for UI work: whenever the user asks for any UI/design/layout/styling change, call this tool first before writing UI code.
Use this BEFORE building common UI patterns. Search when you need:
- UI components: buttons, cards, modals, forms, navbars, footers, hero sections
- Styling themes: dark mode, glassmorphism, neumorphism, brutalism
- Common patterns: pricing tables, testimonials, feature grids, contact forms

Returns component code and usage instructions. Use presets with score ≥15 as starting point and customize.
If no good match (score <8), build from scratch using Tailwind + shadcn/ui.`,
  inputSchema: searchUiPresetsSchema,
});

const searchUiPresetsHandler: ToolHandler<
  z.infer<typeof searchUiPresetsSchema>
> = async (args, sharedContext) => {
  const maxResults = Math.min(args.max_results ?? 3, 5);

  try {
    const results = await sharedContext.ctx.runQuery(
      internal.uiPresets.searchUiPresetsInternal,
      {
        searchQuery: args.query,
        category: args.category,
        maxResults,
      },
    );

    if (results.length === 0) {
      await sharedContext.consoleLog(
        `[Tool:searchUiPresets] No presets found for query: "${args.query}"`,
        "tool",
        { query: args.query, category: args.category, resultCount: 0 },
      );
      return `No UI presets found matching "${args.query}". Consider using more general terms or building the component from scratch using Tailwind CSS and shadcn/ui.`;
    }

    // Step 2: Fetch full content only for the top match with score >= 5
    const worthFetching = results.filter((r) => r.score >= 5).slice(0, 1);
    const fullPresets = await Promise.all(
      worthFetching.map((r) =>
        sharedContext.ctx.runQuery(internal.uiPresets.getUiPresetContent, {
          presetId: r._id as Id<"ui_preset">,
        }),
      ),
    );

    const contentMap = new Map(
      fullPresets
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => [p._id, p]),
    );

    const formatted = results
      .map((preset, i) => {
        const content = contentMap.get(preset._id as Id<"ui_preset">);
        const base = `### ${i + 1}. ${preset.title} (${preset.category}) - Score: ${preset.score}
**Tags:** ${(preset.tags ?? []).join(", ")}
**Description:** ${preset.description}`;

        if (content) {
          return `${base}

<code>
${content.code}
</code>

<usage_instructions>
${content.prompt}
</usage_instructions>`;
        }
        return `${base}\n_(Low confidence match — code not fetched)_`;
      })
      .join("\n---\n");

    // Log each preset found with details
    for (const preset of results) {
      await sharedContext.consoleLog(
        `[UI Preset Found] "${preset.title}" (score: ${preset.score}) - ${preset.category}`,
        "tool",
        {
          presetId: preset._id,
          presetTitle: preset.title,
          presetCategory: preset.category,
          score: preset.score,
          tags: preset.tags,
          query: args.query,
        },
      );
    }

    // Summary log
    await sharedContext.consoleLog(
      `[Tool:searchUiPresets] Found ${results.length} UI preset(s) for "${args.query}"`,
      "tool",
      {
        query: args.query,
        category: args.category,
        resultCount: results.length,
        topScore: results[0]?.score ?? 0,
        presets: results.map((p) => ({ title: p.title, score: p.score })),
      },
    );

    return truncateToolOutput(
      "searchUiPresetsTool",
      `Found ${results.length} UI preset(s) for "${args.query}":\n${formatted}

**Decision Guide:** Score ≥15 = HIGH confidence (use preset), 8-14 = MEDIUM (review carefully), <8 = LOW (build from scratch)`,
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await sharedContext.consoleLog(
      `[Tool:searchUiPresets] Error: ${errorMessage}`,
      "error",
      { query: args.query, error: errorMessage },
    );
    return `Error searching UI presets: ${errorMessage}`;
  }
};

// =============================================================================
// UNIFIED TOOL REGISTRY AND DISPATCHER
// =============================================================================

// toolRegistry with correct handler types
const toolRegistry = {
  readFilesToContextTool: {
    tool: readFilesToContextTool,
    handler: readFilesToContextHandler,
  },
  fileStringCodeReplaceTool: {
    tool: fileStringCodeReplaceTool,
    handler: fileStringCodeReplaceHandler,
  },
  semanticFileSearchTool: {
    tool: semanticFileSearchTool,
    handler: semanticFileSearchHandler,
  },
  executeCommandTool: {
    tool: executeCommandTool,
    handler: executeCommandHandler,
  },
  externalSearchesTool: {
    tool: externalSearchesTool,
    handler: externalSearchesHandler,
  },
  scrapeLinksTool: {
    tool: scrapeLinksTool,
    handler: scrapeLinksHandler,
  },
  addIntegrationTool: {
    tool: addIntegrationTool,
    handler: addIntegrationHandler,
  },
  searchUiPresetsTool: {
    tool: searchUiPresetsTool,
    handler: searchUiPresetsHandler,
  },
  continueWithPlanTool: {
    tool: tool({
      description:
        "Call this ONLY after you have ALREADY written code (CREATE FILE / EDIT FILE / REPLACE FILE codeblocks) and the type check passed. Use it to continue with more work in a subsequent turn. NEVER call this tool when you have not yet written any code - you must output actual codeblocks first.",
      inputSchema: z.object({
        plan: z
          .string()
          .describe(
            "Break down what is left to be done next into a short bullet list (3-7 bullets). Keep it as short and concise as possible.",
          ),
      }),
    }),
    handler: (async (args: { plan: string }, sharedContext) => {
      const changedFiles = (sharedContext as SharedContext).changedFiles ?? [];
      const hasSuccessfulWrites =
        (sharedContext as SharedContext).hasSuccessfulWrites ?? false;

      // If no code was written this turn, the agent is misusing the tool - break the loop
      if (!hasSuccessfulWrites && changedFiles.length === 0) {
        return `STOP: You called continueWithPlanTool but you have NOT written any code yet. The continueWithPlanTool is ONLY for continuing AFTER you have already written CREATE FILE / EDIT FILE / REPLACE FILE codeblocks and the type check passed.

You MUST output actual code in your next response. Write CREATE FILE and EDIT FILE codeblocks to build the application. Do NOT call this tool again until you have written code. Output your codeblocks now.`;
      }

      (sharedContext as any).skipSummarizerOnPass = true;
      return "Continuing with the plan and complete the remaining tasks.";
    }) as ToolHandler<any>,
  },
} as const;

// Type-safe handler set
export type ToolHandlerSet = {
  [K in keyof typeof toolRegistry]: (
    args: Parameters<(typeof toolRegistry)[K]["handler"]>[0],
    sharedContext: SharedContext,
  ) => Promise<string>;
};

// Build the handler set from the registry dynamically
export const toolHandlers = Object.fromEntries(
  Object.entries(toolRegistry).map(([key, value]) => [key, value.handler]),
) as ToolHandlerSet;

// Type-safe dynamic dispatcher using toolRegistry and handlers
export async function dispatchToolCall<K extends keyof typeof toolRegistry>(
  toolName: K,
  args: Parameters<(typeof toolRegistry)[K]["handler"]>[0],
  sharedContext: SharedContext,
): Promise<string> {
  const result = await toolHandlers[toolName](args, sharedContext);
  return truncateToolOutput(String(toolName), result);
}

// Export the tool set for AI SDK
export const fullToolSet = Object.fromEntries(
  Object.entries(toolRegistry).map(([key, value]) => [key, value.tool]),
);

// Export tool instructions for prompts (now embedded in descriptions)
export const toolInstructions = Object.values(toolRegistry)
  .map((entry) => entry.tool.description)
  .join("\n\n");

// Types for external use
export type AllToolCalls = Array<{
  type: "tool-call";
  toolCallId: string;
  toolName: keyof typeof toolRegistry;
  input: Parameters<
    (typeof toolRegistry)[keyof typeof toolRegistry]["handler"]
  >[0];
}>;

// Export all tools as a flat object
export const allTools = Object.fromEntries(
  Object.entries(toolRegistry).map(([key, value]) => [key, value.tool]),
) as {
  [K in keyof typeof toolRegistry]: (typeof toolRegistry)[K]["tool"];
};

// Utility types and function to pick a type-safe subset of tools
export type ToolRegistry = typeof allTools;
export type ToolName = keyof ToolRegistry;

export function pickToolSet<T extends readonly ToolName[]>(...names: T) {
  return Object.fromEntries(
    names.map((name) => [name, allTools[name]]),
  ) as Pick<ToolRegistry, T[number]>;
}

// TODO:
// ADD MODEL SWAPPING TOOL
// IMPLEMENT MODEL SWAPPING
