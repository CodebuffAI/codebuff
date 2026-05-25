import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser } from "./users";
import { ticketStatusValidator } from "./schema";
import { Id } from "./_generated/dataModel";

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Get project names
    const ticketsWithProjects = await Promise.all(
      tickets.map(async (ticket) => {
        const project = await ctx.db.get(ticket.projectId);
        return {
          ...ticket,
          projectName: project?.name || "Unknown Project",
        };
      }),
    );

    return ticketsWithProjects;
  },
});

// Get the ticket for a specific project (one-to-one relationship)
export const getByProject = query({
  args: { projectId: v.id("project") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const allTickets = await ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Filter for only active tickets
    const activeTickets = allTickets.filter(
      (ticket) => ticket.status === "open" || ticket.status === "in_progress",
    );

    if (activeTickets.length === 0) {
      return false;
    }

    return true;
  },
});

// Get all tickets (admin only)
export const listAll = query({
  args: {
    status: v.optional(ticketStatusValidator),
    projectId: v.optional(v.id("project")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) {
      throw new Error("Unauthorized: Admin access required");
    }

    let tickets;

    if (args.status !== undefined) {
      const status = args.status;
      tickets = await ctx.db
        .query("tickets")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    } else if (args.projectId !== undefined) {
      const projectId = args.projectId;
      tickets = await ctx.db
        .query("tickets")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
    } else {
      tickets = await ctx.db.query("tickets").collect();
    }

    // Get user and project info
    const ticketsWithDetails = await Promise.all(
      tickets.map(async (ticket) => {
        const ticketUser = await ctx.db.get(ticket.userId);
        const project = await ctx.db.get(ticket.projectId);
        return {
          ...ticket,
          userName: ticketUser?.name || ticketUser?.email || "Unknown User",
          userEmail: ticketUser?.email,
          projectName: project?.name || "Unknown Project",
        };
      }),
    );

    return ticketsWithDetails;
  },
});

// Get a single ticket
export const get = query({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      return null;
    }

    // Check permissions
    if (
      user.role !== "god" &&
      user.role !== "admin" &&
      ticket.userId !== user._id
    ) {
      throw new Error("Unauthorized: Cannot view this ticket");
    }

    const project = await ctx.db.get(ticket.projectId);
    const ticketUser = await ctx.db.get(ticket.userId);

    return {
      ...ticket,
      projectName: project?.name || "Unknown Project",
      userName: ticketUser?.name || ticketUser?.email || "Unknown User",
      userEmail: ticketUser?.email,
    };
  },
});

// Create a new ticket
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    projectId: v.id("project"),
    attachments: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    // Check if there's already a ticket for this project (globally, not per user)
    const existingTicket = await ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const hasActiveTicket = existingTicket.some(
      (ticket) => ticket.status === "open" || ticket.status === "in_progress",
    );

    if (hasActiveTicket) {
      throw new Error(
        "This project already has an active ticket. Please wait for it to be resolved or closed before creating a new one.",
      );
    }

    return await ctx.db.insert("tickets", {
      title: args.title,
      description: args.description,
      status: "open",
      userId: user._id,
      projectId: args.projectId,
      attachments: args.attachments,
    });
  },
});

// Generate upload URL for file attachments
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

// Update ticket status (admin only)
export const updateStatus = mutation({
  args: {
    id: v.id("tickets"),
    status: ticketStatusValidator,
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) {
      throw new Error("Unauthorized: Admin access required");
    }

    await ctx.db.patch(args.id, { status: args.status });
  },
});

// Delete a ticket (admin only)
export const remove = mutation({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user || (user.role !== "god" && user.role !== "admin")) {
      throw new Error("Unauthorized: Admin access required");
    }

    // Delete all messages associated with the ticket
    const messages = await ctx.db
      .query("tickets_messages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.id))
      .collect();

    // Collect attachments from messages and ticket
    const attachmentIds = new Set<Id<"_storage">>();
    for (const m of messages) {
      if (m.attachments) {
        for (const a of m.attachments) attachmentIds.add(a);
      }
    }
    const ticketDoc = await ctx.db.get(args.id);
    if (ticketDoc?.attachments) {
      for (const a of ticketDoc.attachments) attachmentIds.add(a);
    }

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    // Delete the ticket
    await ctx.db.delete(args.id);

    // Delete attachments
    try {
      await Promise.all(
        Array.from(attachmentIds).map(async (attachmentId) => {
          await ctx.storage.delete(attachmentId);
        }),
      );
    } catch (error) {
      console.error("Error deleting attachments:", error);
      throw new Error("Failed to delete some attachments");
    }
    return null;
  },
});
