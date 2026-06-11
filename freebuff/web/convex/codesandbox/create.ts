import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { signedInUser } from "!/users";
import { checkUserRateLimit } from "../coding_agent/rateLimiter";
import { getOrganizationContext } from "../org_security";
import { FEATURE_FLAGS } from "../featureFlags";
import { agentModeValidator } from "../utils/registry_validators";

export const create = mutation({
  args: {
    initialDocumentContent: v.string(),
    displayMessage: v.optional(v.string()),
    images: v.optional(v.array(v.id("_storage"))),
    agentMode: v.optional(agentModeValidator),
    /** Selected open-source Freebuff model id for the initial generation.
     *  Persisted on the new thread; defaults server-side when omitted. */
    freebuffModel: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ success: v.literal(true), semanticIdentifier: v.string() }),
    v.object({
      success: v.literal(false),
      error: v.object({
        kind: v.string(),
        retryAfter: v.optional(v.number()),
        message: v.optional(v.string()),
      }),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    | { success: true; semanticIdentifier: string }
    | {
        success: false;
        error: { kind: string; retryAfter?: number; message?: string };
      }
  > => {
    console.log("Starting project creation action");
    try {
      // requires auth. will throw without auth
      const userId = await signedInUser(ctx);

      // SECURITY FIX: Get organization context from JWT token
      const orgContext = await getOrganizationContext(ctx);

      // Check rate limits BEFORE assigning project
      const rateLimitResult = await checkUserRateLimit(ctx, userId);
      if (!rateLimitResult.success) {
        return {
          success: false as const,
          error: (
            rateLimitResult as Extract<
              typeof rateLimitResult,
              { success: false }
            >
          ).error,
        };
      }

      // Get user to access clerk_id for cached feature flag check
      // @ts-ignore
      const user = await ctx.runQuery(internal.users.get, { userId });

      // Check if billing enforcement is enabled
      const billingEnforcementResult = await ctx.runQuery(
        internal.featureFlags.checkFeatureInternal,
        { key: FEATURE_FLAGS.BILLING_ENFORCEMENT, clerkId: user?.clerk_id },
      );

      // Check if user is paused (if billing enforcement is enabled)
      if (billingEnforcementResult.enabled) {
        const pauseStatus = await ctx.runQuery(
          internal.deployment_queries.getUserPauseStatusInternal,
          { userId },
        );

        if (pauseStatus) {
          console.log(
            `User ${userId} is paused (reason: ${pauseStatus?.pauseReason ?? "unknown"}), blocking project creation`,
          );

          // Schedule an unpause attempt in the background
          // This will check if they have credits and unpause if possible
          await ctx.scheduler.runAfter(
            0,
            internal.deployment_helpers.checkAndUnpauseUser,
            { userId },
          );

          return {
            success: false as const,
            error: {
              kind: "DEPLOYMENTS_PAUSED",
              message:
                "Your Convex deployments are paused. Please add more Convex credits to continue. If you just added credits, please try again in a few moments.",
            },
          };
        }
      }

      // summarize and get name

      // get an existing project in the pool
      const project = await ctx.db
        .query("project")
        .withIndex("by_state", (q) => q.eq("state", "unassigned"))
        .first();

      if (!project) {
        // no project in pool. create 2 new and throw error.
        console.log("Adding projects to pool");

        // this is so there will be a fresh project in the pool
        await ctx.scheduler.runAfter(
          5 * 1000,
          internal.codesandbox.createProject.initializeUnassignedProject,
        );
        console.error("No projects in the pool");
        throw new Error("No projects in the pool");
      }

      // Narrowed: project is non-null after the throw above
      const assignedProject = project!;
      const orgId = orgContext?.organizationId;
      await ctx.db.patch(assignedProject._id, {
        state: "active",
        last_opened: Date.now(),
        ...(orgId ? { organization_id: orgId } : {}),
      });

      await ctx.db.insert("project_member", {
        project: assignedProject._id,
        user: userId,
        project_role: "owner",
      });

      // Use Freebuff for initial generation so new projects start on the
      // agent_thread workflow instead of the legacy VLY agent cycle.
      // Explicit annotation breaks the circular type inference between this
      // mutation's return type and the generated `api` object.
      const workflowResult:
        | { success: true }
        | {
            success: false;
            error: { kind: string; retryAfter?: number; message?: string };
          } = await ctx.runMutation(
        api.coding_agent.cli_agent.trigger.saveMessageAndStartWorkflow,
        {
          projectSemanticIdentifier: assignedProject.semantic_identifier,
          message: args.initialDocumentContent,
          ...(args.images && { images: args.images }),
          ...(args.freebuffModel && { freebuffModel: args.freebuffModel }),
          agentType: "Freebuff" as any,
          _skipRateLimitCheck: true, // Skip rate limit check - already checked above
        },
      );

      // Surface a failed initial workflow instead of silently dropping the
      // user on a project with no generation running.
      if (!workflowResult.success) {
        console.error(
          "Initial Freebuff workflow failed to start:",
          workflowResult.error,
        );
        return {
          success: false as const,
          error: {
            kind: workflowResult.error.kind,
            ...(workflowResult.error.retryAfter !== undefined && {
              retryAfter: workflowResult.error.retryAfter,
            }),
            message:
              workflowResult.error.message ||
              "Project setup could not start the first build. Please try again.",
          },
        };
      }

      // generate project name and initialize new project
      await ctx.scheduler.runAfter(
        0,
        internal.codesandbox.createProject
          .generateProjectNameAndSetAsEnvVarAndInitializeNew,
        {
          semanticIdentifier: assignedProject.semantic_identifier,
          initialDocumentContent: args.initialDocumentContent,
        },
      );

      return {
        success: true as const,
        semanticIdentifier: assignedProject.semantic_identifier,
      };
    } catch (error) {
      console.error("Project creation failed:", error);
      throw error;
    }
  },
});
