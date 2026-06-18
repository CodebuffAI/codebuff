import { WorkflowManager } from "@convex-dev/workflow";
import { vWorkflowId } from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";
import { components } from "!/_generated/api";
import { internalMutation, internalQuery } from "!/_generated/server";
import { internal } from "!/_generated/api";
import { v } from "convex/values";
import { Id } from "!/_generated/dataModel";

const GEMINI_CLI_MAINTENANCE_MESSAGE = "gemini is currently under maintence.";

// Internal query to get project, thread, and message together
export const getAgentContextData = internalQuery({
  args: {
    projectId: v.id("project"),
    threadId: v.id("agent_thread"),
    messageId: v.id("agent_message"),
  },
  handler: async (ctx, args) => {
    // Fetch project document
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found: " + args.projectId);
    }

    // Fetch thread document
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found: " + args.threadId);
    }

    // Fetch message document
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found: " + args.messageId);
    }

    return {
      project,
      thread,
      message,
    };
  },
});

// Initialize workflow manager
export const workflow = new WorkflowManager(components.workflow as any, {
  workpoolOptions: {
    maxParallelism: 10,
    retryActionsByDefault: true,
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 100,
      base: 2,
    },
  },
});

// Define the CLI agent workflow
export const cliAgentWorkflow = workflow.define({
  args: {
    messageId: v.id("agent_message"),
    threadId: v.id("agent_thread"),
    projectId: v.id("project"),
    userId: v.id("users"),
    agentType: v.union(
      v.literal("Claude Code"),
      v.literal("Gemini CLI"),
      v.literal("Codex"),
      v.literal("Freebuff"),
    ),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      if (args.agentType === "Gemini CLI") {
        return {
          success: false,
          error: GEMINI_CLI_MAINTENANCE_MESSAGE,
        };
      }

      const executingUser = await ctx.runQuery(internal.users.get, {
        userId: args.userId,
      });
      const executingUserIsPlatformAdmin =
        executingUser?.role === "god" || executingUser?.role === "admin";

      const shouldBypassCreditCheck =
        executingUserIsPlatformAdmin ||
        args.agentType === "Freebuff" ||
        (args.agentType === "Codex" &&
          executingUser?.codex_auth_mode === "chatgpt");

      if (!shouldBypassCreditCheck) {
        // Check if user has sufficient credits before starting
        const creditCheck = await ctx.runAction(
          internal.coding_agent.cli_agent.creditTracking.checkAgentCredits,
          {
            projectId: args.projectId,
            executingUserId: args.userId,
          },
        );

        if (!creditCheck.allowed) {
          // User doesn't have enough credits - fail the workflow
          return {
            success: false,
            error:
              creditCheck.error ||
              "Insufficient credits. Please add more credits to continue.",
          };
        }
      }

      // Get project, thread, and message in one query
      const { project, thread, message } = await ctx.runQuery(
        internal.coding_agent.cli_agent.workflow.getAgentContextData,
        {
          projectId: args.projectId,
          threadId: args.threadId,
          messageId: args.messageId,
        },
      );

      // Check if project is terminated due to unresolved GitHub sync conflicts.
      // If termination is stale, clear and continue the workflow.
      if (project.terminated) {
        const hasUnresolvedConflicts = await ctx.runQuery(
          internal.github.sync.status.hasUnresolvedConflicts,
          {
            projectId: args.projectId,
          },
        );

        if (hasUnresolvedConflicts) {
          console.log(
            "[CLIAgentWorkflow] Project is terminated, aborting workflow",
            { projectId: args.projectId },
          );
          return {
            success: false,
            error:
              "Project is terminated due to GitHub sync conflicts. Please resolve conflicts before continuing.",
          };
        }

        await ctx.runMutation(internal.project.setStateDone, {
          projectId: args.projectId,
        });
      }

      // Execute the agent command in the Daytona environment
      const result = await ctx.runAction(
        internal.coding_agent.cli_agent.execute.execute,
        {
          projectId: args.projectId,
          threadId: args.threadId,
          messageId: args.messageId,
          agentType: args.agentType,
          sandboxId: project.sandbox_id,
          activeSessionId: thread.active_session_id,
          executingUserId: args.userId,
          userMessage: message.user_message || "",
          images: message.images, // Pass images from message
          freebuffModel: thread.selected_freebuff_model, // Selected open-source model (Freebuff only)
        },
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  },
});

// Handle workflow completion
export const handleWorkflowComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.any(), // Pass-through context from workflow.start
  },
  handler: async (ctx, args) => {
    const { result, context } = args;
    const { threadId, messageId, projectId, userId, agentType } = context as {
      threadId: Id<"agent_thread">;
      messageId: Id<"agent_message">;
      projectId: Id<"project">;
      userId?: Id<"users">;
      agentType?: "Claude Code" | "Gemini CLI" | "Codex" | "Freebuff";
    };

    try {
      if (agentType === "Freebuff" && result.kind === "success") {
        const returnValue = result.returnValue as {
          success?: boolean;
          error?: string;
          sessionId?: string;
        };

        if (returnValue?.success) {
          await ctx.db.patch(threadId, {
            workflow_id: undefined,
            last_edited_timestamp: Date.now(),
          });
          await ctx.runMutation(
            internal.coding_agent.cli_agent.agent_thread
              .updateAgentThreadActiveSessionId,
            {
              threadId,
              activeSessionId: returnValue.sessionId,
              agentType,
            },
          );
          return;
        }
      }

      // Reset thread processing state
      await ctx.db.patch(threadId, {
        isProcessing: false,
        last_edited_timestamp: Date.now(),
      });

      // Clear workflow ID from thread
      await ctx.db.patch(threadId, {
        workflow_id: undefined,
      });

      // Update message state based on result
      if (result.kind === "success") {
        const returnValue = result.returnValue as {
          success?: boolean;
          error?: string;
          sessionId?: string;
          timedOut?: boolean;
        };
        // In-process 9-minute timeout from Codex/Claude (mirrors Freebuff
        // FREEBUFF_RUN_TIMEOUT_MS). The action returns success=false with
        // timedOut=true; surface that as a Paused message with the canonical
        // copy and append a timeout_continue stream item so the UI matches
        // Freebuff exactly.
        if (returnValue?.timedOut === true) {
          const existingMessage = await ctx.db.get(messageId);
          const existingStream = (existingMessage?.assistant_stream ?? []) as Array<{
            type: string;
            title?: string;
            status?: string;
            content: string;
            description?: string;
          }>;
          const nextStream = [
            ...existingStream,
            {
              type: "timeout_continue",
              title: "Time limit reached",
              content:
                "Maximum time limit for a prompt reached. Engagement required to continue.",
            },
          ];
          await ctx.db.patch(messageId, {
            state: "Paused",
            state_message:
              "Maximum time limit for a prompt reached. Engagement required to continue.",
            isStreaming: false,
            assistant_stream: nextStream,
          });
        } else if (returnValue?.success) {
          await ctx.db.patch(messageId, {
            state: "Completed",
            isStreaming: false,
          });

          // Update thread with new session ID if we got one
          if (returnValue.sessionId) {
            await ctx.runMutation(
              internal.coding_agent.cli_agent.agent_thread
                .updateAgentThreadActiveSessionId,
              {
                threadId,
                activeSessionId: returnValue.sessionId,
                agentType,
              },
            );
          }
        } else {
          await ctx.db.patch(messageId, {
            state: "Error",
            state_message:
              returnValue?.error || "Workflow completed with error",
            isStreaming: false,
          });

          // On failure, session ID handling depends on whether codebase was changed
          // For now, keep existing session ID (don't clear it) as the session might still be valid
        }
      } else if (result.kind === "failed") {
        const failedResult = result as { kind: "failed"; error: string };
        const errorMessage = failedResult.error || "Workflow failed";

        // Check if this was a timeout (action exceeded 10 minute limit)
        // Timeout errors typically contain "deadline exceeded" or similar
        const isTimeout =
          errorMessage.toLowerCase().includes("timeout") ||
          errorMessage.toLowerCase().includes("deadline exceeded") ||
          errorMessage.toLowerCase().includes("timed out") ||
          errorMessage.toLowerCase().includes("execution time");

        await ctx.db.patch(messageId, {
          state: isTimeout ? "Cancelled" : "Error",
          state_message: isTimeout
            ? "Maximum time limit for a prompt reached. Engagement required to continue."
            : errorMessage,
          isStreaming: false,
        });

        // If timeout occurred and we have tracking info, schedule credit deduction
        // Charges a flat $0.50 = 500K credits for timeouts
        let shouldBypassTimeoutBilling = false;
        if (isTimeout && userId) {
          const executingUser = await ctx.db.get(userId);
          shouldBypassTimeoutBilling =
            executingUser?.role === "god" ||
            executingUser?.role === "admin" ||
            agentType === "Freebuff" ||
            (agentType === "Codex" &&
              executingUser?.codex_auth_mode === "chatgpt");
        }

        if (isTimeout && agentType && !shouldBypassTimeoutBilling) {
          // Schedule the credit tracking action (non-blocking)
          await ctx.scheduler.runAfter(
            0,
            internal.coding_agent.cli_agent.creditTracking.trackTimeoutUsage,
            {
              projectId,
              messageId,
              agentType,
              executingUserId: userId,
            },
          );
        }

        // On failure, keep existing session ID (codebase might have been partially modified)
        // Session ID remains on thread for potential recovery
      } else if (result.kind === "canceled") {
        await ctx.db.patch(messageId, {
          state: "Cancelled",
          isStreaming: false,
        });

        // On cancel, keep existing session ID
      }

      // Reset project state if needed
      const project = await ctx.db.get(projectId);
      if (project && project.state === "processing") {
        // Check if there are any other processing threads
        const processingThreads = await ctx.db
          .query("agent_thread")
          .withIndex("by_project", (q) => q.eq("project_id", projectId))
          .filter((q) => q.eq(q.field("isProcessing"), true))
          .collect();

        if (processingThreads.length === 0) {
          await ctx.db.patch(projectId, {
            state: "active",
          });
        }
      }
    } catch (error) {
      console.error("[WorkflowComplete] Error in cleanup:", error);
      // Still try to reset thread state even if other cleanup fails
      try {
        await ctx.db.patch(threadId, {
          isProcessing: false,
          workflow_id: undefined,
        });
      } catch (patchError) {
        console.error(
          "[WorkflowComplete] Failed to reset thread state:",
          patchError,
        );
      }
    }
  },
});
