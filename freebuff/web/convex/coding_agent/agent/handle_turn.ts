"use node";
import { ModelMessage } from "ai";
import { ActionCtx } from "!/_generated/server";
import { ToolSet } from "ai";
import { SharedContext } from "../context/assembly";
import { callAgentWrapper } from "./wrapper";
import { Model } from "!/utils/registry_validators";
import { AllToolCalls, dispatchToolCall, toolHandlers } from "./tools";
import { internal } from "!/_generated/api";
import { processCodeblocksAndWriteFiles } from "./process/codeblocks";
import { hasPackageManager } from "../../../codebase-utils/codebase/Codebase";

export type agentHandlerArgs = {
  coreMessages: ModelMessage[];
  toolSet: ToolSet;
  temperature: number;
  modelOrder: Model[];
  allowModelFallback?: boolean;
  providerOptions?: any; // Custom provider options to pass to streamText
};

const MAX_TYPECHECK_SIZE = 800 * 1024; // 800KB

function truncateTypecheckOutput(output: string): string {
  if (output.length > MAX_TYPECHECK_SIZE) {
    return output.substring(0, MAX_TYPECHECK_SIZE);
  }
  return output;
}

// Call this to pass in the tools, prompt, and context, and the process will be executed
export const handleAgentCall = async (
  ctx: ActionCtx,
  sharedContext: SharedContext,
  args: agentHandlerArgs,
): Promise<boolean> => {
  let agentResult: {
    text?: string;
    toolCalls?: AllToolCalls;
    terminated?: boolean;
  } | null = null;

  // Track the last error to provide better error messages
  let lastError: string | null = null;
  const attemptedModels = args.allowModelFallback
    ? args.modelOrder
    : args.modelOrder.slice(0, 1);

  // process each model
  for (const [index, model] of attemptedModels.entries()) {
    // test the model
    try {
      agentResult = await callAgentWrapper(ctx, sharedContext, {
        model: model,
        coreMessages: args.coreMessages,
        toolSet: args.toolSet,
        temperature: args.temperature,
        modelCallStart: Date.now(),
        providerOptions: args.providerOptions,
      });
      break;
    } catch (err) {
      // if it fails, log the error and update message state to show the error
      const errorMessage = err instanceof Error ? err.message : String(err);
      lastError = errorMessage;
      await sharedContext.consoleLog(
        `[Wrapper] Model ${model} failed: ${errorMessage}`,
        "agent",
        {
          error: errorMessage,
          errorStack: err instanceof Error ? err.stack : undefined,
        },
      );

      // Update message state to show the current model failure
      const shouldTryNextModel = index < attemptedModels.length - 1;
      await ctx.runMutation(internal.messages.updateMessageState, {
        messageId: sharedContext.assistantMessageId,
        status: "error",
        message: `Model ${model} failed: ${errorMessage}${shouldTryNextModel ? " (trying next model)" : ""}`,
      });
    }
  }

  // rate limit or error case
  if (!agentResult) {
    // if all models failed, write rate limit issue to the chat, then throw
    await sharedContext.consoleLog(
      `[Wrapper] ${attemptedModels.length > 1 ? "All candidate models failed" : "Selected model failed"}, stopping agent`,
      "agent",
    );
    console.error(
      `${attemptedModels.length > 1 ? "All candidate models failed" : "Selected model failed"}, stopping agent: `,
      sharedContext.assistantMessageId,
    );

    // Determine the appropriate error message based on the actual error
    let errorMsg: string;
    if (lastError?.toLowerCase().includes("rate limit")) {
      // Rate limit error
      errorMsg = "Rate limit encountered. Please try again in a minute.";
    } else {
      // Generic error
      errorMsg =
        "An error occurred while processing your request. Please try again or contact support.";
    }

    // Update message state to error with descriptive message
    await ctx.runMutation(internal.messages.updateMessageState, {
      messageId: sharedContext.assistantMessageId,
      status: "error",
      message: errorMsg,
    });

    // Don't update message content with error messages - only update state
    return false;
  }

  // termination case
  if (agentResult.terminated) {
    // if terminated, handle termination, then throw
    await sharedContext.consoleLog(
      "[Wrapper] Agent terminated, stopping agent",
      "agent",
    );
    await ctx.runMutation(internal.thread.rollbackAssistantMessage, {
      assistantMessageId: sharedContext.assistantMessageId,
    });
    // tbh you can just return shared context with keep going flag set to false
    // but, you can also just throw when you're layers deep since it's being caught
    return false;
  }

  // if there is text, process codeblocks (skip for PLANNING mode)
  if (agentResult.text) {
    // Skip code block processing for PLANNING mode (read-only agent)
    if (sharedContext.model === "PLANNING") {
      await sharedContext.consoleLog(
        "[Handler] Skipping codeblock processing for PLANNING mode",
        "codegen",
      );
      // For planning mode, just set empty results since no files should be modified
      await ctx.runMutation(internal.messages.setProcessingResult, {
        messageId: sharedContext.assistantMessageId,
        typecheckResult: "",
        fileApplyResults: [],
      });
    } else {
      await sharedContext.consoleLog(
        "[Handler] Processing codeblocks and writing files",
        "codegen",
        { hasToolCall: !!agentResult.toolCalls?.length },
      );
      const codeProcessingStart = Date.now();
      const codeProcessingResult = await processCodeblocksAndWriteFiles(
        ctx,
        sharedContext,
        agentResult.text,
      );
      await sharedContext.consoleLog(
        "[singleAgentTurn] Finished processing codeblocks",
        "codegen",
        {
          durationMs: Date.now() - codeProcessingStart,
          fileResults: codeProcessingResult.fileResults,
        },
      );

      // write results
      await ctx.runMutation(internal.messages.setProcessingResult, {
        messageId: sharedContext.assistantMessageId,
        typecheckResult: truncateTypecheckOutput(
          codeProcessingResult.typeCheckResult.output,
        ),
        fileApplyResults: codeProcessingResult.fileResults,
      });

      // After codeblocks are processed: trigger Abstractor for Vite src/pages
      try {
        const changedFiles = (sharedContext as SharedContext).changedFiles;
        if (changedFiles.length > 0) {
          // Sync routes from src/main.tsx -> entry points (single source of truth)
          // Only check for new routes if main.tsx was actually changed
          try {
            if (changedFiles.includes("src/main.tsx")) {
              const mainContent = await (
                sharedContext as SharedContext
              ).codebase.readFile("src/main.tsx");
              if (mainContent && mainContent.length > 0) {
                // Build map of component name -> page file path under src/pages
                const importMap: Record<string, string> = {};
                const importRegex =
                  /import\s+(?:\{\s*([^}]+)\s*\}|([A-Za-z0-9_]+))\s+from\s+["']([^"']+)["']/g;
                let m: RegExpExecArray | null;
                while ((m = importRegex.exec(mainContent)) !== null) {
                  const namedGroup = m[1];
                  const defaultName = m[2];
                  const source = m[3];
                  const normalizeToPagePath = (src: string): string | null => {
                    let rest = "";
                    if (src.startsWith("@/pages/")) {
                      rest = src.slice("@/pages/".length);
                    } else if (src.includes("/pages/")) {
                      rest = src.substring(
                        src.indexOf("/pages/") + "/pages/".length,
                      );
                    } else if (src.startsWith("src/pages/")) {
                      rest = src.slice("src/pages/".length);
                    } else {
                      return null;
                    }
                    let ext = "";
                    const m = rest.match(/\.(tsx|jsx|ts|js)$/i);
                    if (m) {
                      ext = m[0];
                      rest = rest.replace(/\.(tsx|jsx|ts|js)$/i, "");
                    }
                    if (rest.endsWith("/index")) rest = rest.slice(0, -6);
                    const finalExt = ext || ".tsx";
                    return `src/pages/${rest}${finalExt}`;
                  };
                  const filePath = normalizeToPagePath(source);
                  if (!filePath) continue;
                  if (defaultName) importMap[defaultName] = filePath;
                  if (namedGroup) {
                    const names = namedGroup
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    for (const entry of names) {
                      const asParts = entry.split(/\s+as\s+/i);
                      const name = (asParts[1] || asParts[0]).trim();
                      if (name) importMap[name] = filePath;
                    }
                  }
                }

                // Extract <Route path="..." element={<Component ... />} />
                const routeRegex =
                  /<Route\s+[^>]*path=["']([^"']+)["'][^>]*element=\{<([A-Za-z0-9_]+)/g;
                let r: RegExpExecArray | null;
                const scheduled = new Set<string>();
                while ((r = routeRegex.exec(mainContent)) !== null) {
                  const routePath = r[1];
                  const compName = r[2];
                  const filePath = importMap[compName];
                  if (!filePath) continue;
                  const key = `${filePath}::${routePath}`;
                  if (scheduled.has(key)) continue;
                  scheduled.add(key);
                  // Check if entry point already exists for this file path
                  if (
                    sharedContext.entryPoints.some(
                      (ep) => ep.page?.page_file === filePath,
                    )
                  )
                    continue;
                  await ctx.runMutation(
                    internal.abstractor.routeSync.createEntryPoint,
                    {
                      project_id: (sharedContext as SharedContext).projectId,
                      file_path: filePath,
                      new_route: routePath,
                    },
                  );
                }
              }
            }
          } catch (err) {
            await (sharedContext as SharedContext).consoleLog(
              "[Handler] Route sync failed",
              "agent",
              { error: err instanceof Error ? err.message : String(err) },
            );
          }

          // Additionally, trigger abstraction updates for edited page files
          // Note: This runs after route sync, so newly created entry points are already in the database
          try {
            const editedFiles = (sharedContext as SharedContext).changedFiles;
            const entryPoints = (sharedContext as SharedContext).entryPoints;

            // Find entry points that have files that were edited
            // Skip entry points that are in "processing" status (newly created)
            const editedEntryPoints = entryPoints.filter((ep) => {
              // Skip if entry point is still being processed (newly created)
              if (ep.status === "processing") return false;
              // Check if any of the entry point's associated files were edited
              return ep.associated_files.some((af) => editedFiles.includes(af));
            });

            // Track which entry points we've already scheduled to prevent duplicates
            const scheduledEntryPoints = new Set<string>();

            // Schedule abstraction updates for each affected entry point
            for (const entryPoint of editedEntryPoints) {
              const entryPointId = entryPoint._id;
              if (scheduledEntryPoints.has(entryPointId)) {
                continue; // Skip if already scheduled
              }
              scheduledEntryPoints.add(entryPointId);

              // Temporarily disabled while documentation agent is under maintence.
              // await ctx.scheduler.runAfter(
              //   0,
              //   internal.abstractor.agent.abstractorAgent,
              //   {
              //     project: (sharedContext as SharedContext).projectId,
              //     entry_point_id: entryPoint._id,
              //   },
              // );
            }
          } catch (e) {
            await (sharedContext as SharedContext).consoleLog(
              "[Handler] Failed to schedule page abstraction updates",
              "agent",
              { error: e instanceof Error ? e.message : String(e) },
            );
          }
        }
      } catch (e) {
        await sharedContext.consoleLog(
          "[Handler] Failed to schedule abstractor updates",
          "agent",
          { error: e instanceof Error ? e.message : String(e) },
        );
      }

      // Removed safety net scan to keep main.tsx as single source of truth

      // If undefined, log that as well
      if (codeProcessingResult.fileResults.length === 0) {
        await sharedContext.consoleLog(
          "[singleAgentTurn] No file changes were made after codegen",
          "codegen",
          {},
        );

        // for if there are no tool calls
        if (!agentResult.toolCalls?.length) {
          // no tool calls and no file changes = agent complete

          await sharedContext.consoleLog(
            "[Handler] Agent complete after codegen, exiting",
            "step_end",
            {},
          );

          // summarize
          await ctx.scheduler.runAfter(
            0,
            internal.coding_agent.helpers.summarizer.summarizeMessage,
            {
              messageId: sharedContext.assistantMessageId,
            },
          ); // TODO: add commit message and commit correctly

          // Temporarily disabled while specification updates are under maintence.
          // try {
          //   await ctx.scheduler.runAfter(
          //     0,
          //     internal.coding_agent.models.secondary.analysis_model
          //       .updateProjectSpec,
          //     {
          //       projectId: sharedContext.projectId,
          //       assistantMessageId: sharedContext.assistantMessageId,
          //     },
          //   );
          // } catch (e) {
          //   console.warn("[Handler] Failed to schedule project spec update", e);
          // }

          // no tool calls, so we're done
          return false;
        }
      }
    }
  }

  // For PLANNING mode, check if we should terminate (no tool calls means done)
  if (
    sharedContext.model === "PLANNING" &&
    agentResult.text &&
    !agentResult.toolCalls?.length
  ) {
    await sharedContext.consoleLog(
      "[Handler] Planning agent complete, exiting",
      "step_end",
    );

    // Don't summarize for planning agent when there are no tool calls
    return false;
  }

  // if there are tool calls, process them and continue
  // Run unified error checker BEFORE executing any tools if needed
  let ranPreToolErrorCheck = false;
  if ((sharedContext as SharedContext).needsErrorCheck) {
    await sharedContext.consoleLog(
      "[Handler] Running unified error checker before tool execution",
      "typecheck",
    );

    // Update message state to checking errors
    await ctx.runMutation(internal.messages.updateMessageState, {
      messageId: sharedContext.assistantMessageId,
      status: "checking_errors",
      message: "Running error checker before processing tools",
    });

    // Check if any of the changed files include backend files
    const hasBackendChanges = (
      sharedContext as SharedContext
    ).changedFiles.some((filePath) => filePath.includes("src/convex"));

    // Choose command based on whether backend files were changed
    if (!hasPackageManager(sharedContext.codebase)) {
      throw new Error("Codebase does not support package manager");
    }
    const pm = sharedContext.codebase.getPackageManager();
    const typeCheckCommand = hasBackendChanges
      ? `${pm.run("convex dev --once")} && ${pm.run("tsc -b --noEmit")}`
      : pm.run("tsc -b --noEmit");

    // Run unified error checking logic
    const typeCheckResultRaw = await sharedContext.codebase.runCommand(
      typeCheckCommand,
      30000,
    );

    let errorCheckResult: string;
    let _typeCheckSuccess: boolean;

    if (typeCheckResultRaw.exitCode === 0) {
      _typeCheckSuccess = true;
      const skipSummarizer = sharedContext.skipSummarizerOnPass === true;
      if (!skipSummarizer) {
        sharedContext.model = "SUMMARIZER";
        sharedContext.skipSummarizerOnPass = false;
      }
      errorCheckResult = "✅ Error checker passed: No errors found.";

      await ctx.runMutation(internal.messages.updateMessageState, {
        messageId: sharedContext.assistantMessageId,
        status: "complete",
        message: "Code changes completed successfully",
      });
    } else {
      // typeCheckSuccess = false; // Unused variable
      //sharedContext.model = "PRECISE";
      if (
        sharedContext.model === "CHEAP" ||
        sharedContext.model === "EFFICIENT"
      ) {
        // if cheap or efficient, switch to precise to solve bugs
        sharedContext.model = "PRECISE";
      }

      errorCheckResult =
        "❌ Errors found when running the error checker:\n\n" +
        typeCheckResultRaw.output;

      await ctx.runMutation(internal.messages.updateMessageState, {
        messageId: sharedContext.assistantMessageId,
        status: "type_errors",
        message: "Type checking found errors",
      });
    }

    // Update the message with the error check result
    await ctx.runMutation(internal.messages.setProcessingResult, {
      messageId: sharedContext.assistantMessageId,
      typecheckResult: truncateTypecheckOutput(errorCheckResult),
    });

    // Invalidate runtime and build errors if any files were successfully written
    if ((sharedContext as SharedContext).hasSuccessfulWrites) {
      try {
        await ctx.runMutation(
          internal.runtime_errors.invalidateAllRuntimeErrors,
          {
            projectId: sharedContext.projectId,
          },
        );
        console.log(
          "[Handler] Invalidated runtime errors after successful code changes",
        );
      } catch (error) {
        console.warn("[Handler] Failed to invalidate runtime errors:", error);
        // Don't fail the entire operation if runtime error invalidation fails
      }

      // Also invalidate build errors
      try {
        await ctx.runMutation(internal.build_errors.invalidateAllBuildErrors, {
          projectId: sharedContext.projectId,
        });
        console.log(
          "[Handler] Invalidated build errors after successful code changes",
        );
      } catch (error) {
        console.warn("[Handler] Failed to invalidate build errors:", error);
        // Don't fail the entire operation if build error invalidation fails
      }
    }

    // Clear the flags and reset context
    (sharedContext as SharedContext).needsErrorCheck = false;
    (sharedContext as SharedContext).changedFiles = [];
    (sharedContext as SharedContext).hasSuccessfulWrites = false;
    (sharedContext as SharedContext).codeblocksForLogging = [];
    ranPreToolErrorCheck = true;
  }

  const toolResult = [];
  if (agentResult.toolCalls?.length) {
    // Update message state to processing tools
    await ctx.runMutation(internal.messages.updateMessageState, {
      messageId: sharedContext.assistantMessageId,
      status: "processing_tools",
      message: `Processing ${agentResult.toolCalls.length} tool calls`,
    });

    await sharedContext.consoleLog(
      `[Turn] Processing ${agentResult.toolCalls.length} tool calls`,
      "cycle",
    );
    for (const toolCall of agentResult.toolCalls) {
      await sharedContext.consoleLog(
        `[Turn] Executing tool: ${toolCall.toolName}`,
        "cycle",
        {
          tool: toolCall.toolName,
          args: Object.keys(toolCall.input || {}),
        },
      );
      const result = await dispatchToolCall(
        toolCall.toolName as keyof typeof toolHandlers,
        toolCall.input,
        sharedContext,
      );
      toolResult.push(result);
    }
  }

  await ctx.runMutation(internal.messages.updateMessageToolResult, {
    messageId: sharedContext.assistantMessageId,
    toolResult: JSON.stringify(toolResult),
  });
  // After tools, only set completion state if we did NOT run a pre-tool error check
  if (!ranPreToolErrorCheck) {
    await ctx.scheduler.runAfter(0, internal.messages.updateMessageState, {
      messageId: sharedContext.assistantMessageId,
      status: "complete",
      message: "Tool processing completed",
    });
  }

  // summarize
  await ctx.scheduler.runAfter(
    0,
    internal.coding_agent.helpers.summarizer.summarizeMessage,
    {
      messageId: sharedContext.assistantMessageId,
    },
  );

  return true;
};
