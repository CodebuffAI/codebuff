import { internalAction, mutation } from "!/_generated/server";
import { v } from "convex/values";
import { Id } from "!/_generated/dataModel";
import { internal } from "../../_generated/api";
import { getVerifiedAccessProject } from "../../project";
import { getAuthUser } from "../../users";
import { checkUserRateLimit } from "../rateLimiter";
import { createAgentThread } from "./agent_thread";
import { workflow } from "./workflow";
import { checkContentModeration } from "../../content_moderation";

const GEMINI_CLI_MAINTENANCE_MESSAGE = "gemini is currently under maintence.";

// Main entry point for CLI agent - saves message and starts workflow
export const saveMessageAndStartWorkflow = mutation({
  args: {
    projectSemanticIdentifier: v.optional(v.string()),
    message: v.string(),
    projectId: v.optional(v.id("project")),
    images: v.optional(v.array(v.id("_storage"))),
    agentType: v.union(
      v.literal("Claude Code"),
      v.literal("Gemini CLI"),
      v.literal("Codex"),
      v.literal("Freebuff"),
    ),
    _skipRateLimitCheck: v.optional(v.boolean()), // Internal use only
  },
  returns: v.union(
    v.object({ success: v.literal(true) }),
    v.object({
      success: v.literal(false),
      error: v.object({
        kind: v.string(),
        retryAfter: v.optional(v.number()),
        message: v.optional(v.string()),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    try {
      // Get authenticated user
      const user = await getAuthUser(ctx);
      if (!user) {
        console.error("[CLIAgent] User not found");
        return {
          success: false as const,
          error: {
            kind: "AUTH_ERROR",
            message: "User not found",
          },
        };
      }

      if (args.agentType === "Gemini CLI") {
        return {
          success: false as const,
          error: {
            kind: "AGENT_UNAVAILABLE",
            message: GEMINI_CLI_MAINTENANCE_MESSAGE,
          },
        };
      }

      // Check rate limits (unless this is an internal call)
      if (!args._skipRateLimitCheck) {
        const rateLimitResult = await checkUserRateLimit(ctx, user._id);
        if (!rateLimitResult.success) {
          return rateLimitResult;
        }
      }

      // Content moderation check
      const moderation = checkContentModeration(args.message);
      if (moderation.blocked) {
        return {
          success: false as const,
          error: {
            kind: "CONTENT_MODERATION",
            message: moderation.message,
          },
        };
      }

      // Billing / deployment-pause gate temporarily disabled per product request.
      // To re-enable, uncomment the block below.
      // const isPlatformAdmin = user.role === "god" || user.role === "admin";
      // const shouldBypassCodexBillingGate =
      //   args.agentType === "Codex" && user.codex_auth_mode === "chatgpt";
      // const shouldBypassBillingGate =
      //   isPlatformAdmin || shouldBypassCodexBillingGate;
      //
      // if (!shouldBypassBillingGate) {
      //   const pauseStatus = await ctx.runQuery(
      //     internal.deployment_queries.getUserPauseStatusInternal,
      //     { userId: user._id },
      //   );
      //
      //   if (pauseStatus) {
      //     await ctx.scheduler.runAfter(
      //       0,
      //       internal.deployment_helpers.checkAndUnpauseUser,
      //       { userId: user._id },
      //     );
      //
      //     return {
      //       success: false as const,
      //       error: {
      //         kind: "DEPLOYMENTS_PAUSED",
      //         message:
      //           "Your Convex deployments are paused. Please add more Convex credits to continue. If you just added credits, please try again in a few moments.",
      //       },
      //     };
      //   }
      // }

      // Get verified project access
      const project = await getVerifiedAccessProject(
        ctx,
        user._id,
        args.projectSemanticIdentifier
          ? args.projectSemanticIdentifier
          : undefined,
        args.projectId ? args.projectId : undefined,
      );

      if (!project) {
        console.error("[CLIAgent] Project not found", {
          projectSemanticIdentifier: args.projectSemanticIdentifier,
          projectId: args.projectId,
          userId: user._id,
        });
        return {
          success: false as const,
          error: {
            kind: "PROJECT_NOT_FOUND",
            message: "Project not found or access denied",
          },
        };
      }

      if (project.terminated) {
        console.log(
          "[CLIAgent] Project was terminated; auto-recovering for new message",
          { projectId: project._id },
        );
        await ctx.runMutation(internal.project.setStateProcessing, {
          projectId: project._id,
        });
      }

      // Get or create agent thread
      let threadId: Id<"agent_thread"> | undefined =
        project.active_agent_thread;
      let isNewThread = false;

      if (!threadId) {
        // Create new thread (no active_session_id)
        threadId = await createAgentThread(ctx, project._id, args.agentType);

        // Update project with active thread
        await ctx.db.patch(project._id, {
          active_agent_thread: threadId,
        });

        isNewThread = true;
      } else {
        // Get existing thread to check active_session_id
        const thread = await ctx.db.get(threadId);
        if (!thread) {
          console.error("[CLIAgent] Thread not found", { threadId });
          return {
            success: false as const,
            error: {
              kind: "THREAD_NOT_FOUND",
              message: "Thread not found",
            },
          };
        }

        // Check if thread is already processing
        if (thread.isProcessing) {
          return {
            success: false as const,
            error: {
              kind: "THREAD_PROCESSING",
              message: "Thread is already processing a message. Please wait.",
            },
          };
        }

        // For existing thread, active_session_id is stored on thread
        isNewThread = false;
      }

      // Ensure threadId is defined before proceeding
      if (!threadId) {
        console.error("[CLIAgent] Failed to create or retrieve agent thread", {
          projectId: project._id,
          agentType: args.agentType,
        });
        return {
          success: false as const,
          error: {
            kind: "THREAD_CREATION_FAILED",
            message: "Failed to create or retrieve agent thread",
          },
        };
      }

      // Create agent message first (no session ID set here)
      const messageId = await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message.createAgentMessage,
        {
          threadId,
          userMessage: args.message,
          sessionId: undefined, // Session ID will be set by the workflow
          images: args.images,
        },
      );

      // Mark thread as processing
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_thread
          .updateAgentThreadProcessing,
        {
          threadId,
          isProcessing: true,
        },
      );

      // Update message state to Processing (also sets isStreaming=true)
      // Note: Message is already created with isStreaming=true, but this ensures consistency
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message.updateAgentMessageState,
        {
          messageId,
          state: "Processing",
        },
      );

      // Schedule checkpoint creation for non-first messages (runs asynchronously)
      if (!isNewThread) {
        await ctx.scheduler.runAfter(
          0,
          internal.coding_agent.cli_agent.trigger
            .createCheckpointForAgentMessage,
          {
            projectId: project._id,
            messageId,
            message: `Before: ${args.message.slice(0, 100)}${args.message.length > 100 ? "..." : ""}`,
          }, // TODO: ensure characters are properly escaped
        );
      }

      // Start workflow
      const workflowId = await workflow.start(
        ctx,
        internal.coding_agent.cli_agent.workflow.cliAgentWorkflow,
        {
          messageId,
          threadId,
          projectId: project._id,
          userId: user._id,
          agentType: args.agentType,
        },
        {
          onComplete:
            internal.coding_agent.cli_agent.workflow.handleWorkflowComplete,
          context: {
            threadId,
            messageId,
            projectId: project._id,
            userId: user._id,
            agentType: args.agentType,
          },
        },
      );

      // Update thread with workflow ID
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_thread
          .updateAgentThreadWorkflowId,
        {
          threadId,
          workflowId,
        },
      );

      // Schedule thread title generation for new threads
      if (isNewThread) {
        await ctx.scheduler.runAfter(
          0,
          internal.coding_agent.helpers.agent_thread_namer.nameAgentThread,
          {
            threadId,
          },
        );
      }

      // Update project state
      await ctx.db.patch(project._id, {
        terminated: false,
        state: "processing",
      });

      return { success: true as const };
    } catch (error) {
      console.error(
        "[CLIAgent] Unexpected error in saveMessageAndStartWorkflow:",
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      return {
        success: false as const,
        error: {
          kind: "INTERNAL_ERROR",
          message: errorMessage,
        },
      };
    }
  },
});

// TODO: fix this later

// Internal action to create checkpoint for agent message
export const createCheckpointForAgentMessage = internalAction({
  args: {
    projectId: v.id("project"),
    messageId: v.id("agent_message"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const checkpointResult = await ctx.runAction(
        internal.versioning.checkpoint.createCheckpoint,
        {
          projectId: args.projectId,
          message: args.message,
          messageId: undefined, // Agent messages don't use the old message system
        },
      );

      if (checkpointResult.success && checkpointResult.checkpointId) {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message
            .updateAgentMessageCheckpoint,
          {
            messageId: args.messageId,
            checkpointId: checkpointResult.checkpointId,
            commitHash: checkpointResult.checkpointId, // checkpointId is the commit hash
          },
        );
      } else if (checkpointResult.error) {
        console.error(
          `[CLIAgent] Failed to create checkpoint: ${checkpointResult.error}`,
        );
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message
            .updateAgentMessageCheckpoint,
          {
            messageId: args.messageId,
            checkpointId: "failed",
            commitHash: undefined,
          },
        );
      }
    } catch (error) {
      console.error("[CLIAgent] Exception during checkpoint creation:", error);
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message
          .updateAgentMessageCheckpoint,
        {
          messageId: args.messageId,
          checkpointId: "failed",
          commitHash: undefined,
        },
      );
    }
  },
});
