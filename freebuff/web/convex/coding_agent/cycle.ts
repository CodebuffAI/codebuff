"use node";

import { internal } from "!/_generated/api";
import { ActionCtx, internalAction } from "!/_generated/server";
import schema from "../schema";
import { agentModeValidator } from "../utils/registry_validators";
import {
  contextLengthValidator,
  DEFAULT_CONTEXT_LENGTH,
} from "./config/contextLengthPresets";
import { typedV } from "convex-helpers/validators";
import { handler_getSharedContext, SharedContext } from "./context/assembly";
import { createTerminationQueryThrottler } from "./terminationThrottle";
import { v } from "convex/values";
import { checkCredits } from "../../lib/autumn-api";
import { runAgentIteration } from "./agent/runtime_v2";
import { maybeCompactThreadHistory } from "./agent/process/prompt_assembly_v2";
import { AllToolCalls, dispatchToolCall, toolHandlers } from "./agent/tools";
import { processCodeblocksAndWriteFiles } from "./agent/process/codeblocks";
import { hasPackageManager } from "../../codebase-utils/codebase/Codebase";

const ACTION_TIME_LIMIT_MS = 10 * 60 * 1000;
const CONTEXT_ASSEMBLY_TIMEOUT_MS = 120 * 1000;
const MAX_TYPECHECK_SIZE = 120 * 1024;

type IterationFeedback = {
  toolResults: string[];
  fileApplyResults: ({ path: string } & (
    | { success: true }
    | { success: false; error: string }
  ))[];
  typecheckResult: string;
};

type StepArtifacts = {
  toolCalls: AllToolCalls;
  toolResultSections: string[];
  fileApplyResults: ({ path: string } & (
    | { success: true }
    | { success: false; error: string }
  ))[];
  latestTypecheckResult: string;
  latestAssistantText: string;
};

type RunAccumulator = {
  changedFiles: Set<string>;
  hadSuccessfulWrites: boolean;
  hadSuccessfulTypecheckAfterWrites: boolean;
};

function truncateTypecheckOutput(output: string) {
  if (output.length > MAX_TYPECHECK_SIZE) {
    const headLength = Math.floor(MAX_TYPECHECK_SIZE * 0.75);
    const tailLength = Math.floor(MAX_TYPECHECK_SIZE * 0.25);
    return [
      output.slice(0, headLength),
      "\n\n[typecheck output truncated]\n\n",
      output.slice(-tailLength),
    ].join("");
  }
  return output;
}

function stripCodeBlocks(text: string) {
  return text.replace(/```[\s\S]*?```/g, "[code omitted after file write]");
}

function hasTimedOut(startTime: number) {
  return Date.now() - startTime >= ACTION_TIME_LIMIT_MS;
}

async function isProjectTerminated(
  ctx: ActionCtx,
  sharedContext: SharedContext,
) {
  if (sharedContext.checkTerminatedThrottled) {
    return sharedContext.checkTerminatedThrottled(ctx);
  }
  return await ctx.runQuery(internal.thread.checkIfProjectTerminated, {
    projectId: sharedContext.project._id,
  });
}

function createStepArtifacts(): StepArtifacts {
  return {
    toolCalls: [],
    toolResultSections: [],
    fileApplyResults: [],
    latestTypecheckResult: "",
    latestAssistantText: "",
  };
}

function maybeInjectNewProjectContext(sharedContext: SharedContext) {
  if (sharedContext.project.name) {
    return;
  }

  const mostRecentUserMessageIndex = sharedContext.messages.findIndex(
    (message) => message.role === "user",
  );

  if (mostRecentUserMessageIndex < 0) {
    return;
  }

  const userMessage = sharedContext.messages[mostRecentUserMessageIndex];
  const additionalContext =
    "\n\nNOTE: This is a brand new project with little or no existing application code. Build from scratch as needed, make the / route substantial and visible, and read exact files only when you need to confirm scaffolded structure before editing.";

  if (
    userMessage &&
    typeof userMessage.content === "string" &&
    !userMessage.content.includes(additionalContext)
  ) {
    sharedContext.messages[mostRecentUserMessageIndex] = {
      ...userMessage,
      content: userMessage.content + additionalContext,
    };
  }
}

function serializeToolCalls(toolCalls: AllToolCalls) {
  return JSON.stringify(toolCalls, null, 2);
}

function serializeToolResults(
  toolCalls: AllToolCalls,
  toolResults: string[],
): string[] {
  return toolCalls.map((toolCall, index) => {
    const heading = `[${toolCall.toolName}]`;
    const result = toolResults[index] ?? "(no result)";
    return `${heading}\n${result}`;
  });
}

function buildAssistantPromptTranscript(stepArtifacts: StepArtifacts) {
  const sections: string[] = [];

  if (stepArtifacts.latestAssistantText.trim()) {
    sections.push(
      `Assistant response:\n${stripCodeBlocks(stepArtifacts.latestAssistantText).trim()}`,
    );
  }

  if (stepArtifacts.toolCalls.length > 0) {
    sections.push(
      `Tool calls:\n${serializeToolCalls(stepArtifacts.toolCalls)}`,
    );
  }

  if (stepArtifacts.toolResultSections.length > 0) {
    sections.push(
      `Tool results:\n${stepArtifacts.toolResultSections.join("\n\n")}`,
    );
  }

  if (stepArtifacts.fileApplyResults.length > 0) {
    sections.push(
      `File apply results:\n${JSON.stringify(stepArtifacts.fileApplyResults, null, 2)}`,
    );
  }

  if (stepArtifacts.latestTypecheckResult) {
    sections.push(
      `Type check:\n${truncateTypecheckOutput(stepArtifacts.latestTypecheckResult)}`,
    );
  }

  return sections.filter(Boolean).join("\n\n").trim();
}

async function refreshAssistantArtifacts(
  ctx: ActionCtx,
  sharedContext: SharedContext,
  stepArtifacts: StepArtifacts,
) {
  await ctx.runMutation(internal.messages.updateMessageContent, {
    messageId: sharedContext.assistantMessageId,
    content: stepArtifacts.latestAssistantText,
    coreMessage: buildAssistantPromptTranscript(stepArtifacts),
    ...(stepArtifacts.toolCalls.length > 0
      ? { object: JSON.stringify(stepArtifacts.toolCalls) }
      : {}),
    ...(stepArtifacts.toolResultSections.length > 0
      ? {
          result: stepArtifacts.toolResultSections.join("\n\n"),
        }
      : {}),
    ...(stepArtifacts.latestTypecheckResult
      ? {
          errorCheck: truncateTypecheckOutput(
            stepArtifacts.latestTypecheckResult,
          ),
        }
      : {}),
    ...(stepArtifacts.fileApplyResults.length > 0
      ? {
          fileApplyResults: stepArtifacts.fileApplyResults,
        }
      : {}),
  });
}

async function stopIfTerminated(
  ctx: ActionCtx,
  sharedContext: SharedContext,
  stepArtifacts: StepArtifacts,
  options?: {
    preserveExistingMessage?: boolean;
  },
) {
  if (!(await isProjectTerminated(ctx, sharedContext))) {
    return false;
  }

  sharedContext.keepGoing = false;

  if (!options?.preserveExistingMessage) {
    await refreshAssistantArtifacts(ctx, sharedContext, stepArtifacts);
  }

  await ctx.runMutation(internal.messages.updateMessageState, {
    messageId: sharedContext.assistantMessageId,
    status: "error",
    message: "Stopped by user",
  });

  return true;
}

async function runTypeCheckForWrites(
  ctx: ActionCtx,
  sharedContext: SharedContext,
  changedFiles: string[],
) {
  if (changedFiles.length === 0) {
    return {
      passed: true,
      output: "",
    };
  }

  if (!hasPackageManager(sharedContext.codebase)) {
    throw new Error("Codebase does not support package manager");
  }

  // Single mutation: set checking_errors state + invalidate runtime/build errors
  try {
    await ctx.runMutation(internal.messages.setCheckingErrorsAndInvalidate, {
      messageId: sharedContext.assistantMessageId,
      projectId: sharedContext.projectId,
    });
  } catch (error) {
    console.warn(
      "[Cycle] Failed to set checking state / invalidate errors:",
      error,
    );
  }

  const hasBackendChanges = changedFiles.some((filePath) =>
    filePath.includes("src/convex"),
  );
  const packageManager = sharedContext.codebase.getPackageManager();
  const typeCheckCommand = hasBackendChanges
    ? `${packageManager.run("convex dev --once")} && ${packageManager.run("tsc -b --noEmit")}`
    : packageManager.run("tsc -b --noEmit");

  const typeCheckResult = await sharedContext.codebase.runCommand(
    typeCheckCommand,
    30_000,
  );

  if (typeCheckResult.exitCode === 0) {
    return {
      passed: true,
      output: "✅ Type check passed: no errors found.",
    };
  }

  if (sharedContext.model === "CHEAP" || sharedContext.model === "EFFICIENT") {
    sharedContext.model = "PRECISE";
  }

  return {
    passed: false,
    output: `❌ Type check failed:\n\n${typeCheckResult.output}`,
  };
}

async function finalizeSuccessfulTurn(
  ctx: ActionCtx,
  sharedContext: SharedContext,
  runAccumulator: RunAccumulator,
) {
  if (
    await stopIfTerminated(ctx, sharedContext, createStepArtifacts(), {
      preserveExistingMessage: true,
    })
  ) {
    return;
  }

  let commitMessage = "--";
  if (
    runAccumulator.hadSuccessfulWrites &&
    runAccumulator.hadSuccessfulTypecheckAfterWrites
  ) {
    const summaryResult = await ctx.runAction(
      internal.coding_agent.helpers.summarizer.summarizeMessage,
      {
        messageId: sharedContext.assistantMessageId,
      },
    );
    commitMessage = summaryResult.commitMessage;
  }

  if (
    await stopIfTerminated(ctx, sharedContext, createStepArtifacts(), {
      preserveExistingMessage: true,
    })
  ) {
    return;
  }

  if (
    runAccumulator.hadSuccessfulWrites &&
    sharedContext.model !== "PLANNING"
  ) {
    await ctx.runAction(internal.codesandbox.versionControl.commit, {
      projectId: sharedContext.project._id,
      message:
        commitMessage && commitMessage !== "--"
          ? commitMessage
          : "Update project files",
      messageId: sharedContext.assistantMessageId,
    });

    if (runAccumulator.changedFiles.size > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.codebaseStructure.updateChangedFiles,
        {
          sandboxId: sharedContext.project.sandbox_id,
          packageManager: sharedContext.project.packageManager || "bun",
          changedFiles: [...runAccumulator.changedFiles],
        },
      );
    }
  }

  if (
    await stopIfTerminated(ctx, sharedContext, createStepArtifacts(), {
      preserveExistingMessage: true,
    })
  ) {
    return;
  }

  await ctx.runMutation(internal.messages.updateMessageState, {
    messageId: sharedContext.assistantMessageId,
    status: "complete",
    message:
      sharedContext.model === "PLANNING"
        ? "Plan completed"
        : runAccumulator.hadSuccessfulWrites
          ? "Code changes completed successfully"
          : "Completed",
  });
}

function getIntermediateStepStatus(stepArtifacts: StepArtifacts): {
  status: "type_errors" | "error" | "complete";
  message: string;
} {
  const hasTypecheckFailure =
    !!stepArtifacts.latestTypecheckResult &&
    !stepArtifacts.latestTypecheckResult.startsWith("✅");
  const hasFileApplyFailures = stepArtifacts.fileApplyResults.some(
    (result) => !result.success,
  );

  if (hasTypecheckFailure) {
    return { status: "type_errors", message: "Type checking found errors" };
  }
  if (hasFileApplyFailures) {
    return { status: "error", message: "Some file changes failed to apply" };
  }
  return {
    status: "complete",
    message: stepArtifacts.toolCalls.length ? "Step completed" : "Completed",
  };
}

async function refreshArtifactsAndFinalizeStep(
  ctx: ActionCtx,
  sharedContext: SharedContext,
  stepArtifacts: StepArtifacts,
) {
  const { status, message } = getIntermediateStepStatus(stepArtifacts);

  await ctx.runMutation(internal.messages.updateMessageContentAndState, {
    messageId: sharedContext.assistantMessageId,
    content: stepArtifacts.latestAssistantText,
    coreMessage: buildAssistantPromptTranscript(stepArtifacts),
    ...(stepArtifacts.toolCalls.length > 0
      ? { object: JSON.stringify(stepArtifacts.toolCalls) }
      : {}),
    ...(stepArtifacts.toolResultSections.length > 0
      ? { result: stepArtifacts.toolResultSections.join("\n\n") }
      : {}),
    ...(stepArtifacts.latestTypecheckResult
      ? {
          errorCheck: truncateTypecheckOutput(
            stepArtifacts.latestTypecheckResult,
          ),
        }
      : {}),
    ...(stepArtifacts.fileApplyResults.length > 0
      ? { fileApplyResults: stepArtifacts.fileApplyResults }
      : {}),
    status,
    statusMessage: message,
  });
}

async function startNextAssistantStep(
  ctx: ActionCtx,
  sharedContext: SharedContext,
) {
  const assistantMessageId = await ctx.runMutation(
    internal.messages.insertEmptyAssistantMessage,
    {
      projectId: sharedContext.project._id,
    },
  );

  sharedContext.assistantMessageId = assistantMessageId;
}

async function handleTimeLimit(
  ctx: ActionCtx,
  sharedContext: SharedContext,
  stepArtifacts: StepArtifacts,
) {
  await refreshAssistantArtifacts(ctx, sharedContext, stepArtifacts);

  const timeoutNotice =
    "This action hit the 10 minute limit. Type continue to keep going from the current state.";

  await ctx.runMutation(internal.messages.updateMessageContentAndState, {
    messageId: sharedContext.assistantMessageId,
    content: stepArtifacts.latestAssistantText
      ? `${stepArtifacts.latestAssistantText}\n\n${timeoutNotice}`
      : timeoutNotice,
    streaming: false,
    status: "error",
    statusMessage: timeoutNotice,
  });
}

export const primaryAgenticCycle = internalAction({
  args: {
    project: typedV(schema).doc("project"),
    agentMode: v.optional(agentModeValidator),
    contextLength: v.optional(contextLengthValidator),
    cycleCount: v.optional(v.number()),
    executingUserIsPlatformAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const executingUserIsPlatformAdmin =
      args.executingUserIsPlatformAdmin === true;

    if (!args.cycleCount || args.cycleCount === 0) {
      if (executingUserIsPlatformAdmin) {
        console.log(
          `[CreditCheck] Skipping owner credit check for admin sender on project ${args.project._id}`,
        );
      } else {
        try {
          const projectOwner = await ctx.runQuery(
            internal.project.getProjectOwner,
            {
              projectId: args.project._id,
            },
          );

          if (projectOwner) {
            let clerkId: string | undefined;

            if (projectOwner.type === "organization") {
              clerkId = projectOwner.organization_id;
            } else if (projectOwner.type === "user") {
              clerkId = projectOwner.user.clerk_id;
            }

            if (clerkId) {
              const customerId = args.project.organization_id || clerkId;
              const creditData = await checkCredits(customerId);

              if (!creditData.allowed) {
                const balance = creditData.balances?.[0]?.balance || 0;
                await ctx.runMutation(internal.project.setStateDone, {
                  projectId: args.project._id,
                });

                const assistantMessageId = await ctx.runMutation(
                  internal.messages.insertEmptyAssistantMessage,
                  {
                    projectId: args.project._id,
                  },
                );

                await ctx.runMutation(
                  internal.messages.updateMessageContentAndState,
                  {
                    messageId: assistantMessageId,
                    content: `You have run out of credits (${balance} remaining). Please upgrade your plan to continue using the AI agent.`,
                    streaming: false,
                    status: "error",
                    statusMessage: "Insufficient credits",
                  },
                );

                return;
              }
            }
          }
        } catch (creditError) {
          console.error("[CreditCheck] Failed to check credits:", creditError);
        }
      }
    }

    let sharedContext: SharedContext;
    try {
      const assistantMessageId = await ctx.runMutation(
        internal.messages.insertEmptyAssistantMessage,
        {
          projectId: args.project._id,
        },
      );

      const contextPromise = handler_getSharedContext(
        ctx,
        args.project,
        assistantMessageId,
        args.agentMode,
        { executingUserIsPlatformAdmin, contextLength: args.contextLength },
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Context assembly timed out after ${CONTEXT_ASSEMBLY_TIMEOUT_MS / 1000} seconds`,
            ),
          );
        }, CONTEXT_ASSEMBLY_TIMEOUT_MS);
      });

      sharedContext = await Promise.race([contextPromise, timeoutPromise]);
      sharedContext.contextLength =
        args.contextLength || DEFAULT_CONTEXT_LENGTH;
      sharedContext.checkTerminatedThrottled = createTerminationQueryThrottler(
        args.project._id,
      );
    } catch (error: any) {
      console.error("[Cycle] Context assembly failed:", error.message);

      await ctx.runMutation(internal.project.setStateDone, {
        projectId: args.project._id,
      });

      try {
        const assistantMessageId = await ctx.runMutation(
          internal.messages.insertEmptyAssistantMessage,
          {
            projectId: args.project._id,
          },
        );
        const isStateChangeError =
          error.message?.includes("State change in progress") ||
          error.message?.includes("starting up or changing states");

        await ctx.runMutation(internal.messages.updateMessageContentAndState, {
          messageId: assistantMessageId,
          content: isStateChangeError
            ? "Your development environment is currently initializing or changing states. Please wait 10-15 seconds and send your message again."
            : `Failed to initialize the coding agent context. Error: ${error.message}. Please try again or contact support if the issue persists.`,
          streaming: false,
          status: "error",
          statusMessage: isStateChangeError
            ? "The development environment is currently starting up. Please wait a moment and try again."
            : `Context assembly failed: ${error.message}`,
        });
      } catch (messageError) {
        console.error("[Cycle] Failed to create error message:", messageError);
      }

      return;
    }

    maybeInjectNewProjectContext(sharedContext);

    const runAccumulator: RunAccumulator = {
      changedFiles: new Set<string>(),
      hadSuccessfulWrites: false,
      hadSuccessfulTypecheckAfterWrites: false,
    };
    let currentStepArtifacts = createStepArtifacts();

    try {
      while (true) {
        if (
          await stopIfTerminated(ctx, sharedContext, currentStepArtifacts, {
            preserveExistingMessage: true,
          })
        ) {
          return;
        }

        if (hasTimedOut(startTime)) {
          await handleTimeLimit(ctx, sharedContext, currentStepArtifacts);
          return;
        }

        await maybeCompactThreadHistory(ctx, sharedContext);

        if (
          await stopIfTerminated(ctx, sharedContext, currentStepArtifacts, {
            preserveExistingMessage: true,
          })
        ) {
          return;
        }

        currentStepArtifacts = createStepArtifacts();
        const agentResult = await runAgentIteration(ctx, sharedContext);

        if (
          agentResult.terminated ||
          (await stopIfTerminated(ctx, sharedContext, currentStepArtifacts, {
            preserveExistingMessage: true,
          }))
        ) {
          await ctx.runMutation(internal.messages.updateMessageState, {
            messageId: sharedContext.assistantMessageId,
            status: "error",
            message: "Stopped by user",
          });
          return;
        }

        currentStepArtifacts.latestAssistantText =
          agentResult.text?.trim() ?? "";

        const feedback: IterationFeedback = {
          toolResults: [],
          fileApplyResults: [],
          typecheckResult: "",
        };

        if (agentResult.toolCalls?.length) {
          currentStepArtifacts.toolCalls.push(...agentResult.toolCalls);

          const rawToolResults: string[] = [];
          for (const toolCall of agentResult.toolCalls) {
            if (
              await stopIfTerminated(ctx, sharedContext, currentStepArtifacts)
            ) {
              return;
            }

            const result = await dispatchToolCall(
              toolCall.toolName as keyof typeof toolHandlers,
              toolCall.input,
              sharedContext,
            );
            rawToolResults.push(result);

            if (
              await stopIfTerminated(ctx, sharedContext, currentStepArtifacts)
            ) {
              return;
            }
          }

          feedback.toolResults = serializeToolResults(
            agentResult.toolCalls,
            rawToolResults,
          );
          currentStepArtifacts.toolResultSections.push(...feedback.toolResults);
        }

        if (sharedContext.model !== "PLANNING" && agentResult.text) {
          const codeProcessingResult = await processCodeblocksAndWriteFiles(
            ctx,
            sharedContext,
            agentResult.text,
          );

          feedback.fileApplyResults = codeProcessingResult.fileResults;
          currentStepArtifacts.fileApplyResults.push(
            ...codeProcessingResult.fileResults,
          );

          if (
            await stopIfTerminated(ctx, sharedContext, currentStepArtifacts)
          ) {
            return;
          }

          const successfulChangedFiles = codeProcessingResult.fileResults
            .filter((result) => result.success)
            .map((result) => result.path);

          for (const filePath of successfulChangedFiles) {
            runAccumulator.changedFiles.add(filePath);
            delete sharedContext.loadedFiles[filePath];
            if (!sharedContext.availableFilePaths.includes(filePath)) {
              sharedContext.availableFilePaths.push(filePath);
            }
          }

          if (successfulChangedFiles.length > 0) {
            runAccumulator.hadSuccessfulWrites = true;
            if (
              await stopIfTerminated(ctx, sharedContext, currentStepArtifacts)
            ) {
              return;
            }
            const typecheck = await runTypeCheckForWrites(
              ctx,
              sharedContext,
              successfulChangedFiles,
            );
            const truncatedTypecheck = truncateTypecheckOutput(
              typecheck.output,
            );
            feedback.typecheckResult = truncatedTypecheck;
            currentStepArtifacts.latestTypecheckResult = truncatedTypecheck;
            if (
              await stopIfTerminated(ctx, sharedContext, currentStepArtifacts)
            ) {
              return;
            }
            if (typecheck.passed) {
              runAccumulator.hadSuccessfulTypecheckAfterWrites = true;
            }
          } else if (codeProcessingResult.fileResults.length > 0) {
            currentStepArtifacts.latestTypecheckResult = "";
          }
        }

        const hasToolCalls = !!agentResult.toolCalls?.length;
        const hasFileApplyFailures = feedback.fileApplyResults.some(
          (result) => !result.success,
        );
        const typecheckFailed =
          !!feedback.typecheckResult &&
          !feedback.typecheckResult.startsWith("✅");

        if (await stopIfTerminated(ctx, sharedContext, currentStepArtifacts)) {
          return;
        }

        if (hasToolCalls || hasFileApplyFailures || typecheckFailed) {
          // Single mutation: content + artifacts + state
          await refreshArtifactsAndFinalizeStep(
            ctx,
            sharedContext,
            currentStepArtifacts,
          );

          const stepTranscript =
            buildAssistantPromptTranscript(currentStepArtifacts);
          if (stepTranscript) {
            sharedContext.currentTurnMessages.push(stepTranscript);
          }

          await startNextAssistantStep(ctx, sharedContext);
          currentStepArtifacts = createStepArtifacts();
          continue;
        }

        await refreshAssistantArtifacts(
          ctx,
          sharedContext,
          currentStepArtifacts,
        );
        await finalizeSuccessfulTurn(ctx, sharedContext, runAccumulator);
        return;
      }
    } catch (error: any) {
      console.error("[Cycle] Error in primaryAgenticCycle:", error);

      await ctx.runMutation(internal.messages.updateMessageContentAndState, {
        messageId: sharedContext.assistantMessageId,
        content: currentStepArtifacts.latestAssistantText,
        coreMessage: buildAssistantPromptTranscript(currentStepArtifacts),
        ...(currentStepArtifacts.toolCalls.length > 0
          ? { object: JSON.stringify(currentStepArtifacts.toolCalls) }
          : {}),
        ...(currentStepArtifacts.toolResultSections.length > 0
          ? { result: currentStepArtifacts.toolResultSections.join("\n\n") }
          : {}),
        ...(currentStepArtifacts.latestTypecheckResult
          ? {
              errorCheck: truncateTypecheckOutput(
                currentStepArtifacts.latestTypecheckResult,
              ),
            }
          : {}),
        ...(currentStepArtifacts.fileApplyResults.length > 0
          ? { fileApplyResults: currentStepArtifacts.fileApplyResults }
          : {}),
        status: "error",
        statusMessage: `Agent cycle error: ${error.message}`,
      });
    } finally {
      await ctx.runMutation(internal.project.setStateDone, {
        projectId: args.project._id,
      });
    }
  },
});
