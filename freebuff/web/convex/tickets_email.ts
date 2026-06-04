import {
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

// Keep this mutation for database operations only
export const markEmailAsSent = internalMutation({
  args: { emailId: v.id("emailQueue") },
  handler: async (ctx, { emailId }) => {
    await ctx.db.patch(emailId, { sent: true });
  },
});

// Fetch pending emails and coordinate email sending
export const processPendingEmails = internalAction({
  args: {},
  handler: async (ctx) => {
    // Fetch emails via query
    const pendingEmails: any[] = await ctx.runQuery(
      internal.tickets_email.getPendingEmails,
    );

    // console.log(
    //   `[processPendingEmails] Found ${pendingEmails.length} emails to send`,
    // );

    let sentCount = 0;
    let errorCount = 0;

    for (const emailRecord of pendingEmails) {
      try {
        // Fetch all data
        const recipient: any = await ctx.runQuery(
          internal.tickets_email.getUser,
          {
            userId: emailRecord.userId,
          },
        );
        const ticket: any = await ctx.runQuery(
          internal.tickets_email.getTicket,
          {
            ticketId: emailRecord.ticketId,
          },
        );
        const latestMessage: any = await ctx.runQuery(
          internal.tickets_email.getLatestMessage,
          {
            ticketId: emailRecord.ticketId,
          },
        );

        const projectSemanticsIdentifier = await ctx.runQuery(
          internal.tickets_email.getProjectSemanticsIdentifier,
          {
            ticketId: emailRecord.ticketId,
          },
        );

        if (!projectSemanticsIdentifier) {
          console.error(
            `[processPendingEmails] Missing project semantics identifier for email ${emailRecord._id}`,
          );
          errorCount++;
          continue;
        }
        if (!recipient || !ticket || !latestMessage) {
          console.error(
            `[processPendingEmails] Missing data for email ${emailRecord._id}`,
          );
          errorCount++;
          continue;
        }

        // Call email sending action
        const emailResult = await ctx.runAction(
          api.email.sendTicketReplyEmail,
          {
            recipientEmail: recipient.email,
            recipientName: recipient.name ?? "User",
            ticketTitle: ticket.title,
            messageContent: latestMessage.content,
            ticketUrl: getTicketUrl(projectSemanticsIdentifier),
          },
        );

        if (!emailResult.success) {
          console.error(`[processPendingEmails] Failed: ${emailResult.error}`);
          errorCount++;
        } else {
          console.log(`[processPendingEmails] Sent to ${recipient.email}`);
          // Mark as sent via mutation
          await ctx.runMutation(internal.tickets_email.markEmailAsSent, {
            emailId: emailRecord._id,
          });
          sentCount++;
        }
      } catch (error) {
        console.error(`[processPendingEmails] Error: ${error}`);
        errorCount++;
      }
    }

    return { sentCount, errorCount, totalProcessed: pendingEmails.length };
  },
});

// Helper queries
export const getPendingEmails = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Round to nearest 5 minutes for better caching
    // This groups all calls within a 5-minute window together
    const roundedNow =
      Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000);

    return await ctx.db
      .query("emailQueue")
      .withIndex("by_sent_cancelled_scheduled", (q: any) =>
        q
          .eq("sent", false)
          .eq("cancelled", false)
          .lte("scheduledFor", roundedNow),
      )
      .collect();
  },
});

export const getUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

export const getTicket = internalQuery({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    return await ctx.db.get(ticketId);
  },
});

export const getLatestMessage = internalQuery({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    return await ctx.db
      .query("tickets_messages")
      .withIndex("by_ticket", (q: any) => q.eq("ticketId", ticketId))
      .order("desc")
      .first();
  },
});

export const getProjectSemanticsIdentifier = internalQuery({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) {
      return null;
    }
    const project = await ctx.db.get(ticket.projectId);
    return project?.semantic_identifier;
  },
});

function getTicketUrl(projectSemanticsIdentifier: string): string {
  const baseUrl = process.env.APP_URL || "https://freebuff.app";
  return `${baseUrl}/project/${projectSemanticsIdentifier}`;
}
