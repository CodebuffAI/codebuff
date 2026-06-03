import { v } from "convex/values";
import { Resend } from "resend";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getAuthUser } from "./users";
import { getVerifiedAccessProject } from "./project";

const FREEBUFF_FROM_EMAIL = "James from Freebuff <james@mail.freebuff.app>";
const FREEBUFF_REPLY_TO_EMAIL = "support@codebuff.com";

function generateInviteToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function sendEmail(to: string, subject: string, body: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  console.log(`Sending email to ${to}: ${subject}`);
  console.log(body);

  const { data, error } = await resend.emails.send({
    from: FREEBUFF_FROM_EMAIL,
    replyTo: FREEBUFF_REPLY_TO_EMAIL,
    to: [to],
    subject: subject,
    html: body,
  });

  if (error) {
    console.error(error);
  }

  return data;
}

export const sendInvite = action({
  args: {
    projectId: v.id("project"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Get project owner information to check member limits
    const ownerInfo = await ctx.runQuery(internal.project.getProjectOwner, {
      projectId: args.projectId,
    });

    if (!ownerInfo) {
      throw new Error("Project owner not found");
    }

    // Determine customer ID (organization_id or user clerk_id)
    let customerId: string;
    if (ownerInfo.type === "organization") {
      customerId = ownerInfo.organization_id;
    } else {
      customerId = ownerInfo.user.clerk_id;
    }

    if (!customerId) {
      throw new Error("Customer ID not found for billing check");
    }

    // Get total member count across all user's projects (not per-project)
    const [totalMemberCount, pendingInvites] = await Promise.all([
      ctx.runQuery(internal.invites.getTotalMemberCountForOwner, {
        clerkId: customerId,
      }),
      ctx.runQuery(internal.invites.getInvitesByProjectInternal, {
        projectId: args.projectId,
      }),
    ]);

    void totalMemberCount;
    void pendingInvites;
    void customerId;

    // Create invite (this will also verify access)
    const { token } = await ctx.runMutation(internal.invites.createInvite, {
      projectId: args.projectId,
      email: args.email,
    });

    // Get project name
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) throw new Error("Project not found");

    const projectName = project.name || "Untitled Project";

    // Send invite email with project name
    await sendEmail(
      args.email,
      `Invitation to collaborate on ${projectName.replace("\n", " ")}`,
      `You've been invited to collaborate on "${projectName}". Click here to accept: ${process.env.PUBLIC_APP_URL}/invite/${token}`,
    );
  },
});

export const createInvite = internalMutation({
  args: {
    projectId: v.id("project"),
    email: v.string(),
    projectRole: v.optional(
      v.union(v.literal("member"), v.literal("admin"), v.literal("owner")),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    if (user.role !== "god" && user.role !== "admin") {
      const project = await getVerifiedAccessProject(
        ctx,
        user._id,
        undefined,
        args.projectId,
      );

      if (!project) {
        throw new Error("Project not found");
      }
    } else {
      const project = await ctx.db.get(args.projectId);
      if (!project) {
        throw new Error("Project not found");
      }
    }

    // Create invite
    const token = generateInviteToken();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    const inviteId = await ctx.db.insert("invites", {
      project: args.projectId,
      email: normalizeEmail(args.email),
      token,
      expires_at: expiresAt,
      project_role: args.projectRole ?? "member",
    });

    return { token: token, inviteId: inviteId };
  },
});

export const deleteProjectInvitesByEmailInternal = internalMutation({
  args: {
    projectId: v.id("project"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = normalizeEmail(args.email);
    const projectInvites = await ctx.db
      .query("invites")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();

    const matchingInvites = projectInvites.filter(
      (invite) => invite.email === normalizedEmail,
    );

    for (const invite of matchingInvites) {
      await ctx.db.delete(invite._id);
    }

    return { deletedCount: matchingInvites.length };
  },
});

export const deleteProjectOwnershipInvitesInternal = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const projectInvites = await ctx.db
      .query("invites")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();

    const ownershipInvites = projectInvites.filter(
      (invite) => invite.project_role === "owner",
    );

    for (const invite of ownershipInvites) {
      await ctx.db.delete(invite._id);
    }

    return { deletedCount: ownershipInvites.length };
  },
});

export const transferProjectOwnershipByEmail = action({
  args: {
    projectId: v.id("project"),
    email: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    status: "transferred" | "invite_sent";
    email: string;
    semanticIdentifier: string;
  }> => {
    const user = await getAuthUser(ctx);

    if (!user || (user.role !== "god" && user.role !== "admin")) {
      throw new Error("Unauthorized: Admin access required");
    }

    const normalizedEmail = normalizeEmail(args.email);
    if (!normalizedEmail) {
      throw new Error("Email is required");
    }

    const project: Doc<"project"> | null = await ctx.runQuery(
      internal.project.getProject,
      {
        projectId: args.projectId,
      },
    );

    if (!project) {
      throw new Error("Project not found");
    }

    const currentMembers: Doc<"project_member">[] = await ctx.runQuery(
      internal.project.getProjectMembersInternal,
      { projectId: args.projectId },
    );
    const existingUser = await ctx.runQuery(internal.users.getUserByEmail, {
      email: normalizedEmail,
    });

    if (existingUser) {
      const currentOwnerMemberships = currentMembers.filter(
        (member: Doc<"project_member">) => member.project_role === "owner",
      );
      const existingMembership = currentMembers.find(
        (member: Doc<"project_member">) => member.user === existingUser._id,
      );

      if (
        existingMembership?.project_role === "owner" &&
        currentOwnerMemberships.length === 1
      ) {
        throw new Error("That email already owns this project");
      }

      await ctx.runMutation(internal.project.transferProjectOwnershipInternal, {
        projectId: args.projectId,
        newOwnerUserId: existingUser._id,
      });
      await ctx.runMutation(
        internal.invites.deleteProjectOwnershipInvitesInternal,
        {
          projectId: args.projectId,
        },
      );
      await ctx.runMutation(
        internal.invites.deleteProjectInvitesByEmailInternal,
        {
          projectId: args.projectId,
          email: normalizedEmail,
        },
      );

      return {
        status: "transferred" as const,
        email: normalizedEmail,
        semanticIdentifier: project.semantic_identifier,
      };
    }

    await ctx.runMutation(
      internal.invites.deleteProjectOwnershipInvitesInternal,
      {
        projectId: args.projectId,
      },
    );
    await ctx.runMutation(
      internal.invites.deleteProjectInvitesByEmailInternal,
      {
        projectId: args.projectId,
        email: normalizedEmail,
      },
    );

    const { token } = await ctx.runMutation(internal.invites.createInvite, {
      projectId: args.projectId,
      email: normalizedEmail,
      projectRole: "owner",
    });

    const projectName = project.name || "Untitled Project";

    await sendEmail(
      normalizedEmail,
      `Invitation to take ownership of ${projectName.replace("\n", " ")}`,
      `You've been invited to take ownership of "${projectName}". Click here to accept: ${process.env.PUBLIC_APP_URL}/invite/${token}`,
    );

    return {
      status: "invite_sent" as const,
      email: normalizedEmail,
      semanticIdentifier: project.semantic_identifier,
    };
  },
});

export const acceptInvite = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("AcceptInvite called with token:", args.token);

    const user = await getAuthUser(ctx);
    console.log("User from auth:", user?._id);
    if (!user) throw new Error("Not authenticated - please sign in first");

    console.log("Searching for invite with token:", args.token);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    console.log("Found invite:", invite);
    if (!invite)
      throw new Error(
        "Invalid invite token - the invitation may have been used or deleted",
      );

    if (invite.expires_at && invite.expires_at < Date.now()) {
      console.log(
        "Invite expired. Expires at:",
        new Date(invite.expires_at),
        "Current time:",
        new Date(),
      );
      throw new Error("Invite expired - please request a new invitation");
    }

    // Get project to return its semantic identifier
    console.log("Getting project with ID:", invite.project);
    const projectRecord = await ctx.db.get(invite.project);
    console.log("Found project:", projectRecord);
    if (!projectRecord)
      throw new Error("Project not found - the project may have been deleted");

    const inviteRole = invite.project_role ?? "member";

    // Check if user is already a member
    const existingMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", invite.project).eq("user", user._id),
      )
      .unique();

    if (existingMember) {
      console.log("User already a member, deleting invite");
      if (inviteRole === "owner") {
        await ctx.runMutation(
          internal.project.transferProjectOwnershipInternal,
          {
            projectId: invite.project,
            newOwnerUserId: user._id,
          },
        );
      }
      await ctx.db.delete(invite._id);
      return projectRecord.semantic_identifier;
    }

    console.log("Adding user as project member");
    try {
      if (inviteRole === "owner") {
        await ctx.runMutation(
          internal.project.transferProjectOwnershipInternal,
          {
            projectId: invite.project,
            newOwnerUserId: user._id,
          },
        );
      } else {
        await ctx.db.insert("project_member", {
          project: invite.project,
          user: user._id,
          project_role: inviteRole,
        });
      }
      console.log("Successfully added user as member");
    } catch (error) {
      console.error("Error adding user as member:", error);
      throw new Error("Failed to add user to project - please try again");
    }

    // Delete the invite
    console.log("Deleting invite");
    try {
      await ctx.db.delete(invite._id);
      console.log("Successfully deleted invite");
    } catch (error) {
      console.error("Error deleting invite:", error);
      // Don't throw here as the user was already added
    }

    console.log(
      "Returning semantic identifier:",
      projectRecord.semantic_identifier,
    );
    return projectRecord.semantic_identifier;
  },
});

export const getInvitesByProject = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify user has access to project
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      undefined, // projectSemanticIdentifier
      args.projectId, // projectId
    );
    if (!project) throw new Error("Project not found");

    return await ctx.db
      .query("invites")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();
  },
});

/**
 * Get total member count across all projects owned by a user (identified by clerk_id)
 * This counts all memberships across all projects, not unique users
 */
export const getTotalMemberCountForOwner = internalQuery({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the user by clerk_id
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerkId))
      .first();

    if (!user) {
      return 0;
    }

    // Get all projects where this user is the owner
    const ownedProjectMemberships = await ctx.db
      .query("project_member")
      .withIndex("by_user", (q) => q.eq("user", user._id))
      .filter((q) => q.eq(q.field("project_role"), "owner"))
      .collect();

    // For each owned project, count all members (excluding the owner)
    let totalMemberCount = 0;
    for (const ownership of ownedProjectMemberships) {
      const projectMembers = await ctx.db
        .query("project_member")
        .withIndex("by_project", (q) => q.eq("project", ownership.project))
        .filter((q) => q.neq(q.field("project_role"), "owner"))
        .collect();
      totalMemberCount += projectMembers.length;
    }

    return totalMemberCount;
  },
});

/**
 * Internal version of getInvitesByProject for use in actions
 * Does not require authentication - used for checking limits
 */
export const getInvitesByProjectInternal = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("invites")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .collect();
  },
});
