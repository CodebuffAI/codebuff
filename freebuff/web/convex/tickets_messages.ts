import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUser } from "./users";
import { messageRoleValidator } from "./schema";

// Get file URL from storage
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(
    v.null(),
    v.object({
      url: v.string(),
      contentType: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    try {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) return null;
      const metadata = await ctx.db.system.get(args.storageId);
      return {
        url,
        contentType: metadata?.contentType,
      };
    } catch (error) {
      console.error("Error getting file URL:", error);
      throw error;
    }
  },
});

// Get all messages for a ticket
export const listByTicket = query({
  args: { ticketId: v.id("tickets") },
  returns: v.array(
    v.object({
      _id: v.id("tickets_messages"),
      _creationTime: v.number(),
      ticketId: v.id("tickets"),
      content: v.string(),
      role: messageRoleValidator,
      userId: v.id("users"),
      attachments: v.optional(v.array(v.id("_storage"))),
      aiSummary: v.optional(v.string()),
      userName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    // Check permissions
    if (user.role !== "god" && ticket.userId !== user._id) {
      throw new Error("Unauthorized: Cannot view messages for this ticket");
    }

    const messages = await ctx.db
      .query("tickets_messages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
      .collect();

    // Get user info for each message
    const messagesWithUsers = await Promise.all(
      messages.map(async (message) => {
        const messageUser = await ctx.db.get(message.userId);
        return {
          ...message,
          userName: messageUser?.name || messageUser?.email || "Unknown User",
        };
      }),
    );

    return messagesWithUsers;
  },
});

// Send a message
export const send = mutation({
  args: {
    ticketId: v.id("tickets"),
    content: v.string(),
    attachments: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("tickets_messages"),
  handler: async (ctx, args) => {
    try {
      const user = await getAuthUser(ctx);
      if (!user) {
        throw new Error("Unauthorized");
      }

      const ticket = await ctx.db.get(args.ticketId);
      if (!ticket) {
        throw new Error("Ticket not found");
      }

      // Check permissions
      if (user.role !== "god" && ticket.userId !== user._id) {
        throw new Error("Unauthorized: Cannot send message to this ticket");
      }

      // Determine role
      const role: "user" | "admin" = user.role === "god" ? "admin" : "user";

      // ===== PHASE 1: Pre-fetch data (minimize race window) =====

      // Pre-fetch sender's read state (needed in Phase 3)
      const senderReadState = await ctx.db
        .query("ticketUserState")
        .withIndex("by_ticket_and_user", (q) =>
          q.eq("ticketId", args.ticketId).eq("userId", user._id),
        )
        .first();

      // Pre-fetch all admins (needed for both admin and user reply branches)
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "god"))
        .collect();
      console.log(
        `[send PHASE 1] Found ${admins.length} total admins, sender=${user._id}`,
      );

      // If user is replying, get pending emails to cancel
      let pendingEmails: any[] = [];
      if (role === "user") {
        pendingEmails = await ctx.db
          .query("emailQueue")
          .withIndex("by_ticket_sent_cancelled", (q) =>
            q
              .eq("ticketId", args.ticketId)
              .eq("sent", false)
              .eq("cancelled", false),
          )
          .collect();
      }

      // ===== PHASE 2: Write operations in correct order =====

      // Cancel pending emails (if user replying)
      for (const email of pendingEmails) {
        await ctx.db.patch(email._id, { cancelled: true });
      }

      // Update ticket status (if admin replying to open ticket)
      if (role === "admin" && ticket.status === "open") {
        await ctx.db.patch(args.ticketId, { status: "in_progress" });
      }

      // Create the message
      const messageId = await ctx.db.insert("tickets_messages", {
        ticketId: args.ticketId,
        content: args.content,
        role,
        userId: user._id,
        attachments: args.attachments,
      });

      // ===== PHASE 3: IMMEDIATELY mark sender's message as read =====
      // This prevents the sender from seeing their own message as unread

      if (senderReadState) {
        await ctx.db.patch(senderReadState._id, {
          lastReadMessageId: messageId,
        });
      } else {
        await ctx.db.insert("ticketUserState", {
          ticketId: args.ticketId,
          userId: user._id,
          lastReadMessageId: messageId,
        });
      }

      // ===== PHASE 4: Initialize read states for recipients =====
      // Use batch operations to avoid N+1 queries

      if (role === "admin") {
        // Admin replying: ensure BOTH ticket user AND other admins have read states
        //
        // BUG FIX: Ensures ticket user AND all other admins get notified
        // When Admin A sends message, Admin B needs a read state initialized
        // so they see it as unread

        // Get existing read states for all users on this ticket
        const existingReadStates = await ctx.db
          .query("ticketUserState")
          .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
          .collect();

        // Create a Set of user IDs that already have read states
        const userIdsWithReadState = new Set(
          existingReadStates.map((rs) => rs.userId),
        );

        // Ensure ticket user has read state
        if (!userIdsWithReadState.has(ticket.userId)) {
          console.log(
            `[send PHASE 4] Creating read state for ticket user=${ticket.userId}, ticket=${args.ticketId}`,
          );
          await ctx.db.insert("ticketUserState", {
            ticketId: args.ticketId,
            userId: ticket.userId,
            lastReadMessageId: undefined,
          });
          userIdsWithReadState.add(ticket.userId);
        }

        // Ensure other admins have read states (exclude sender)
        for (const admin of admins) {
          if (admin._id !== user._id && !userIdsWithReadState.has(admin._id)) {
            console.log(
              `[send PHASE 4] Creating read state for admin=${admin._id}, ticket=${args.ticketId}`,
            );
            await ctx.db.insert("ticketUserState", {
              ticketId: args.ticketId,
              userId: admin._id,
              lastReadMessageId: undefined,
            });
          }
        }
      } else {
        // User replying: ensure all admins have read state for this ticket
        // Pre-fetched admins in Phase 1

        // Get existing read states for admins (batch query)
        const existingAdminReadStates = await ctx.db
          .query("ticketUserState")
          .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
          .collect();

        // Create a Set of admin IDs that already have read states
        const adminIdsWithReadState = new Set(
          existingAdminReadStates
            .filter((rs) => admins.some((admin) => admin._id === rs.userId))
            .map((rs) => rs.userId),
        );

        // Only create read states for admins who don't have them
        for (const admin of admins) {
          if (!adminIdsWithReadState.has(admin._id)) {
            console.log(
              `[send PHASE 4] Creating read state for admin=${admin._id}, ticket=${args.ticketId}`,
            );
            await ctx.db.insert("ticketUserState", {
              ticketId: args.ticketId,
              userId: admin._id,
              lastReadMessageId: undefined,
            });
          }
        }
      }

      // ===== PHASE 5: Schedule email notification =====

      if (role === "admin") {
        const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
        await ctx.db.insert("emailQueue", {
          ticketId: args.ticketId,
          userId: ticket.userId,
          scheduledFor: fiveMinutesFromNow,
          sent: false,
          cancelled: false,
        });
      }

      return messageId;
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  },
});
