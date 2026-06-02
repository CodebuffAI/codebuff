import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  httpAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { getOrganizationContext } from "./org_security";

/**
 * Performs constant-time string comparison to prevent timing attacks
 * @param a First string to compare
 * @param b Second string to compare
 * @returns true if strings are equal, false otherwise
 */
function constantTimeStringCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

export const createIntegrationBearerKey = internalMutation({
  args: {
    projectId: v.id("project"),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.insert("integration_bearer_keys", {
      project_id: args.projectId,
      key: args.key,
    });
    return record;
  },
});

export const getIntegrationKeyForProject = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("integration_bearer_keys")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .first();
    return record?.key ?? null;
  },
});

export const validateIntegrationBearerKey = internalQuery({
  args: {
    key: v.string(),
  },
  returns: v.union(
    v.object({
      valid: v.boolean(),
      projectId: v.id("project"),
      customerId: v.string(),
      customerData: v.object({
        name: v.string(),
        email: v.string(),
      }),
      semanticIdentifier: v.string(),
    }),
    v.object({
      valid: v.boolean(),
      error: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    // Step 1: Validate the bearer key and get project ID
    const record = await ctx.db
      .query("integration_bearer_keys")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!record) {
      return {
        valid: false,
        error: "Invalid bearer key",
      };
    }

    // Step 2: Get project to check organization context
    const project = await ctx.db.get(record.project_id);
    if (!project) {
      return {
        valid: false,
        error: "Project not found",
      };
    }

    // Step 3: Get project owner for fallback user data
    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project", (q) => q.eq("project", record.project_id))
      .filter((q) => q.eq(q.field("project_role"), "owner"))
      .first();

    if (!projectMember) {
      return {
        valid: false,
        error: "Project owner not found",
      };
    }

    const user = await ctx.db.get(projectMember.user);
    if (!user) {
      return {
        valid: false,
        error: "User not found",
      };
    }

    // Step 4: Determine customer ID and data based on organization context
    // This matches the billing logic used in Autumn integration
    const customerId = project.organization_id || user.clerk_id;

    // Get organization context to retrieve real organization name
    const orgContext = await getOrganizationContext(ctx);
    const organizationName =
      project.organization_id && orgContext?.name
        ? orgContext.name
        : project.organization_id
          ? "Organization" // Fallback for organizations without names
          : user.name;

    const customerData = {
      name: organizationName,
      email: user.email, // Use project owner email for contact
    };

    return {
      valid: true,
      projectId: record.project_id,
      customerId,
      customerData,
      semanticIdentifier: project.semantic_identifier,
    };
  },
});

export const http_validateIntegrationBearerKey = httpAction(
  async (ctx, request) => {
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] [http_validateIntegrationBearerKey] Request received`,
    );

    // Log request headers (without revealing sensitive values)
    const vlyHeader = request.headers.get("x-vly-master-integration-key");
    const hasMasterKeyHeader = !!vlyHeader;
    console.log(
      `[${timestamp}] [http_validateIntegrationBearerKey] Has master key header: ${hasMasterKeyHeader}`,
    );

    const masterKey = process.env.VLY_MASTER_INTEGRATION_KEY;
    const hasMasterKeyEnv = !!masterKey;
    console.log(
      `[${timestamp}] [http_validateIntegrationBearerKey] Has master key env var: ${hasMasterKeyEnv}`,
    );

    if (
      !vlyHeader ||
      !masterKey ||
      !constantTimeStringCompare(vlyHeader, masterKey)
    ) {
      console.log(
        `[${timestamp}] [http_validateIntegrationBearerKey] Master key authentication failed`,
      );
      return new Response(
        "Unauthorized - set x-vly-master-integration-key header to the master integration key",
        { status: 401 },
      );
    }

    console.log(
      `[${timestamp}] [http_validateIntegrationBearerKey] Master key authenticated successfully`,
    );

    let body;
    try {
      body = await request.json();
      console.log(
        `[${timestamp}] [http_validateIntegrationBearerKey] Request body parsed`,
      );
    } catch (error) {
      console.error(
        `[${timestamp}] [http_validateIntegrationBearerKey] Failed to parse request body:`,
        error,
      );
      return new Response("Invalid JSON body", { status: 400 });
    }

    const key: string | undefined | null = body.key;

    if (!key) {
      console.log(
        `[${timestamp}] [http_validateIntegrationBearerKey] No key provided in body`,
      );
      return new Response("Key is required", { status: 400 });
    }

    // Log key prefix for debugging (first 10 chars only)
    const keyPrefix = key.substring(0, 10);
    console.log(
      `[${timestamp}] [http_validateIntegrationBearerKey] Validating key starting with: ${keyPrefix}...`,
    );

    let result;
    try {
      result = await ctx.runQuery(
        internal.integration_auth.validateIntegrationBearerKey as any,
        {
          key: body.key,
        },
      );
      console.log(
        `[${timestamp}] [http_validateIntegrationBearerKey] Validation query completed. Valid: ${result.valid}`,
      );
      if (!result.valid && result.error) {
        console.log(
          `[${timestamp}] [http_validateIntegrationBearerKey] Validation error: ${result.error}`,
        );
      }
    } catch (error) {
      console.error(
        `[${timestamp}] [http_validateIntegrationBearerKey] Validation query failed:`,
        error,
      );
      return new Response("Internal server error during validation", {
        status: 500,
      });
    }

    const responseStatus = result.valid ? 200 : 400;
    console.log(
      `[${timestamp}] [http_validateIntegrationBearerKey] Returning response with status: ${responseStatus}`,
    );

    return new Response(JSON.stringify(result), {
      status: responseStatus,
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
);
