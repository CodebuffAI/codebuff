import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUser } from "./users";
import { Id } from "./_generated/dataModel";

/**
 * Get the unread message count for a user on a specific ticket.
 */
export const getUnreadCount = query({
  args: {
    ticketId: v.id("tickets"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    try {
      const user = await getAuthUser(ctx);
      if (!user) {
        throw new Error("Unauthorized");
      }

      // Verify ticket access
      const ticket = await ctx.db.get(args.ticketId);
      if (!ticket) {
        throw new Error("Ticket not found");
      }

      const isAdmin = user.role === "god";
      const isTicketOwner = ticket.userId === user._id;

      if (!isAdmin && !isTicketOwner) {
        throw new Error("Unauthorized: Cannot access this ticket");
      }

      // Get the user's read state for this ticket
      const readState = await ctx.db
        .query("ticketUserState")
        .withIndex("by_ticket_and_user", (q) =>
          q.eq("ticketId", args.ticketId).eq("userId", user._id),
        )
        .first();

      // Edge case 1: No read state exists → return total message count
      if (!readState || !readState.lastReadMessageId) {
        const totalMessages = await ctx.db
          .query("tickets_messages")
          .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
          .collect();
        return totalMessages.length;
      }

      // Edge case 2: Verify lastReadMessage still exists
      const lastReadMessage = await ctx.db.get(readState.lastReadMessageId);
      if (!lastReadMessage) {
        // Message was deleted - treat as if no read state exists
        const totalMessages = await ctx.db
          .query("tickets_messages")
          .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
          .collect();
        return totalMessages.length;
      }
      // Get unread messages
      const unreadMessages = await ctx.db
        .query("tickets_messages")
        .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
        .filter((q) =>
          q.gt(q.field("_creationTime"), lastReadMessage._creationTime),
        )
        .collect();

      return unreadMessages.length;
    } catch (error) {
      console.error("Error getting unread count:", error);
      throw error;
    }
  },
});

/**
 * Get unread count for multiple tickets for the current user.
 */
export const getUnreadCountByTicket = query({
  args: {
    ticketIds: v.array(v.id("tickets")),
  },
  returns: v.record(v.id("tickets"), v.number()),
  handler: async (ctx, args) => {
    try {
      const user = await getAuthUser(ctx);
      if (!user) {
        throw new Error("Unauthorized");
      }

      const result: Record<Id<"tickets">, number> = {};

      // OPTIMIZATION 1: Fetch all read states for this user in one query
      const allReadStates = await ctx.db
        .query("ticketUserState")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      // Create a Map for O(1) lookups: ticketId -> readState
      const readStateMap = new Map<Id<"tickets">, (typeof allReadStates)[0]>();
      for (const readState of allReadStates) {
        readStateMap.set(readState.ticketId, readState);
      }

      // Process each ticket
      for (const ticketId of args.ticketIds) {
        try {
          // Verify ticket access
          const ticket = await ctx.db.get(ticketId);
          if (!ticket) {
            // Ticket not found, skip it
            result[ticketId] = 0;
            continue;
          }

          const isAdmin = user.role === "god";
          const isTicketOwner = ticket.userId === user._id;

          if (!isAdmin && !isTicketOwner) {
            // User doesn't have access, skip it
            result[ticketId] = 0;
            continue;
          }

          // OPTIMIZATION 2: Get read state from map (O(1) instead of query)
          const readState = readStateMap.get(ticketId);

          // No read state → return total message count
          if (!readState || !readState.lastReadMessageId) {
            const totalMessages = await ctx.db
              .query("tickets_messages")
              .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
              .collect();
            result[ticketId] = totalMessages.length;
            continue;
          }

          // Verify lastReadMessage still exists
          const lastReadMessage = await ctx.db.get(readState.lastReadMessageId);
          if (!lastReadMessage) {
            // Message was deleted - return total count
            const totalMessages = await ctx.db
              .query("tickets_messages")
              .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
              .collect();
            result[ticketId] = totalMessages.length;
            continue;
          }

          // ✅ Use ID-based filtering: only fetch unread messages
          const unreadMessages = await ctx.db
            .query("tickets_messages")
            .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
            .filter((q) =>
              q.gt(q.field("_creationTime"), lastReadMessage._creationTime),
            )
            .collect();

          result[ticketId] = unreadMessages.length;
        } catch (ticketError) {
          console.error(`Error processing ticket ${ticketId}:`, ticketError);
          result[ticketId] = 0;
        }
      }

      return result;
    } catch (error) {
      console.error("Error getting unread counts:", error);
      throw error;
    }
  },
});

/**
 * Mark all messages in a ticket as read for the current user.
 */
export const markTicketAsRead = mutation({
  args: {
    ticketId: v.id("tickets"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const user = await getAuthUser(ctx);
      if (!user) {
        throw new Error("Unauthorized");
      }

      // ✅ Added: Verify ticket access
      const ticket = await ctx.db.get(args.ticketId);
      if (!ticket) {
        throw new Error("Ticket not found");
      }

      const isAdmin = user.role === "god";
      const isTicketOwner = ticket.userId === user._id;

      if (!isAdmin && !isTicketOwner) {
        throw new Error("Unauthorized: Cannot access this ticket");
      }

      // Get the latest message in the ticket
      const latestMessage = await ctx.db
        .query("tickets_messages")
        .withIndex("by_ticket", (q) => q.eq("ticketId", args.ticketId))
        .order("desc")
        .first();

      if (!latestMessage) {
        // No messages, just create/update the read state with null
        const existingReadState = await ctx.db
          .query("ticketUserState")
          .withIndex("by_ticket_and_user", (q) =>
            q.eq("ticketId", args.ticketId).eq("userId", user._id),
          )
          .first();

        if (existingReadState) {
          await ctx.db.patch(existingReadState._id, {
            lastReadMessageId: undefined,
          });
        } else {
          await ctx.db.insert("ticketUserState", {
            ticketId: args.ticketId,
            userId: user._id,
            lastReadMessageId: undefined,
          });
        }
        return null;
      }

      // Check if read state exists
      const existingReadState = await ctx.db
        .query("ticketUserState")
        .withIndex("by_ticket_and_user", (q) =>
          q.eq("ticketId", args.ticketId).eq("userId", user._id),
        )
        .first();

      if (existingReadState) {
        // Update existing read state
        await ctx.db.patch(existingReadState._id, {
          lastReadMessageId: latestMessage._id,
        });
      } else {
        // Create new read state
        await ctx.db.insert("ticketUserState", {
          ticketId: args.ticketId,
          userId: user._id,
          lastReadMessageId: latestMessage._id,
        });
      }

      return null;
    } catch (error) {
      console.error("Error marking ticket as read:", error);
      throw error;
    }
  },
});
