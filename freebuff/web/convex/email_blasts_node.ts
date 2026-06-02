"use node";

import { Resend, type ErrorResponse } from "resend";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUser } from "./users";
import React from "react";
import ReactMarkdown from "react-markdown";
import { renderToStaticMarkup } from "react-dom/server";

const DEFAULT_APP_URL = "https://vly.ai";
const BLAST_FROM_EMAIL = "Victor Cheng <victor@vly.ai>";
const BLAST_REPLY_TO_EMAIL = "victor@vly.ai";
const MARKDOWN_EMBED_MARKER = "VLY_MARKDOWN";
const DEFAULT_SYNC_BATCH_SIZE = 100;
const MAX_SYNC_BATCH_SIZE = 250;
const RESEND_SYNC_MAX_REQUESTS_PER_SECOND = 100;
const RESEND_RATE_LIMIT_RETRY_ATTEMPTS = 5;
const RESEND_RATE_LIMIT_BASE_BACKOFF_MS = 300;

type ResendResult<T> = {
  data: T | null;
  error: ErrorResponse | null;
};

function getAppBaseUrl(): string {
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || DEFAULT_APP_URL;
  return rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
}

function getPromotionalPreferencesUrl(): string {
  return `${getAppBaseUrl()}/dashboard/preferences?unsubscribe=1`;
}

function getResendApiKey(): string {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return apiKey;
}

function getAudienceId(): string {
  const audienceId =
    process.env.RESEND_AUDIENCE_ID || process.env.RESEND_BROADCAST_AUDIENCE_ID;
  if (!audienceId) {
    throw new Error(
      "RESEND_AUDIENCE_ID is not configured for broadcast contacts",
    );
  }
  return audienceId;
}

function getResendClient(): Resend {
  return new Resend(getResendApiKey());
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRateLimitError(error: ErrorResponse | null): boolean {
  if (!error) {
    return false;
  }
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  return (
    name.includes("rate_limit") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

function createRateLimitedResendCaller(maxRequestsPerSecond: number) {
  const minIntervalMs = Math.ceil(1000 / maxRequestsPerSecond);
  let nextAllowedAt = 0;

  return async function call<T>(
    makeRequest: () => Promise<ResendResult<T>>,
  ): Promise<ResendResult<T>> {
    for (
      let attempt = 0;
      attempt < RESEND_RATE_LIMIT_RETRY_ATTEMPTS;
      attempt += 1
    ) {
      const now = Date.now();
      const waitMs = Math.max(0, nextAllowedAt - now);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      nextAllowedAt = Math.max(nextAllowedAt, Date.now()) + minIntervalMs;

      const result = await makeRequest();
      if (!result.error || !isRateLimitError(result.error)) {
        return result;
      }

      const backoffMs =
        RESEND_RATE_LIMIT_BASE_BACKOFF_MS * Math.pow(2, attempt) +
        Math.floor(Math.random() * 150);
      await sleep(backoffMs);
    }

    return makeRequest();
  };
}

function renderMarkdownEmailBody(markdown: string): string {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, null, markdown),
  );
}

function encodeMarkdown(markdown: string): string {
  return Buffer.from(markdown, "utf8").toString("base64");
}

function decodeMarkdown(encoded: string): string | null {
  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function extractEmbeddedMarkdown(html?: string | null): string | null {
  if (!html) {
    return null;
  }

  const markerRegex = new RegExp(
    `<!--\\s*${MARKDOWN_EMBED_MARKER}:([A-Za-z0-9+/=]+)\\s*-->`,
  );
  const match = html.match(markerRegex);
  if (!match?.[1]) {
    return null;
  }

  return decodeMarkdown(match[1]);
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildEmailHtml(
  markdownContent: string,
  unsubscribeUrl: string = getPromotionalPreferencesUrl(),
): string {
  const contentHtml = renderMarkdownEmailBody(markdownContent);
  const encodedMarkdown = encodeMarkdown(markdownContent);

  return `
    <!-- ${MARKDOWN_EMBED_MARKER}:${encodedMarkdown} -->
    <div>
      ${contentHtml}
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
      
      <p style="font-size: 12px; color: #6b7280;">
        <a href="${unsubscribeUrl}" style="color: #111827; text-decoration: underline;">
          unsubscribe
        </a>
      </p>
    </div>
  `;
}

function buildEmailText(
  markdownContent: string,
  unsubscribeUrl: string = getPromotionalPreferencesUrl(),
): string {
  const textContent = markdownToPlainText(markdownContent);
  return `${textContent}\n\n---\nUnsubscribe from all promotional emails: ${unsubscribeUrl}`;
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNamesFromFullName(name?: string | null): {
  firstName?: string;
  lastName?: string;
} {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    return {};
  }
  const pieces = trimmed.split(/\s+/);
  if (pieces.length === 1) {
    return { firstName: pieces[0] };
  }
  return {
    firstName: pieces[0],
    lastName: pieces.slice(1).join(" "),
  };
}

function isNotFoundError(error: ErrorResponse | null): boolean {
  if (!error) {
    return false;
  }
  const normalizedName = error.name.toLowerCase();
  const normalizedMessage = error.message.toLowerCase();
  return (
    normalizedName.includes("not_found") ||
    normalizedMessage.includes("not found")
  );
}

function isAlreadyExistsError(error: ErrorResponse | null): boolean {
  if (!error) {
    return false;
  }
  const normalizedMessage = error.message.toLowerCase();
  return normalizedMessage.includes("already exists");
}

function ensureResendData<T>(
  result: { data: T | null; error: ErrorResponse | null },
  fallbackMessage: string,
): T {
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data) {
    throw new Error(fallbackMessage);
  }
  return result.data;
}

async function requireAdminUser(ctx: any) {
  const user = await getAuthUser(ctx);
  if (!user || (user.role !== "god" && user.role !== "admin")) {
    throw new Error("Unauthorized: Admin access required");
  }
  return user;
}

async function upsertAudienceContact(args: {
  resend: Resend;
  audienceId: string;
  email: string;
  name?: string;
  subscribed?: boolean;
  resendCall?: <T>(
    makeRequest: () => Promise<ResendResult<T>>,
  ) => Promise<ResendResult<T>>;
}): Promise<"created" | "updated" | "skipped"> {
  const email = normalizeEmail(args.email);
  if (!email) {
    return "skipped";
  }

  const { firstName, lastName } = getNamesFromFullName(args.name);
  const resendCall =
    args.resendCall ??
    (async <T>(makeRequest: () => Promise<ResendResult<T>>) => makeRequest());

  const create = await resendCall(() =>
    args.resend.contacts.create({
      audienceId: args.audienceId,
      email,
      firstName,
      lastName,
      unsubscribed:
        typeof args.subscribed === "boolean" ? !args.subscribed : false,
    }),
  );
  if (!create.error) {
    return "created";
  }

  if (create.error) {
    if (!isAlreadyExistsError(create.error)) {
      throw new Error(create.error.message);
    }
  }

  const update = await resendCall(() =>
    args.resend.contacts.update({
      audienceId: args.audienceId,
      email,
      firstName,
      lastName,
      unsubscribed:
        typeof args.subscribed === "boolean" ? !args.subscribed : undefined,
    }),
  );
  if (update.error) {
    if (isNotFoundError(update.error)) {
      const recreate = await resendCall(() =>
        args.resend.contacts.create({
          audienceId: args.audienceId,
          email,
          firstName,
          lastName,
          unsubscribed:
            typeof args.subscribed === "boolean" ? !args.subscribed : false,
        }),
      );
      if (recreate.error) {
        throw new Error(recreate.error.message);
      }
      return "created";
    }
    throw new Error(update.error.message);
  }

  return "updated";
}

async function syncResendContactForUser(
  ctx: any,
  user: Doc<"users">,
): Promise<{ success: boolean; skipped: boolean; error?: string }> {
  if (!user.email) {
    return { success: false, skipped: false, error: "User missing email" };
  }

  const normalizedEmail = normalizeEmail(user.email);
  if (
    user.resend_contact_last_synced_email &&
    normalizeEmail(user.resend_contact_last_synced_email) === normalizedEmail
  ) {
    return { success: true, skipped: true };
  }

  try {
    const resend = getResendClient();
    const audienceId = getAudienceId();
    const resendCall = createRateLimitedResendCaller(
      RESEND_SYNC_MAX_REQUESTS_PER_SECOND,
    );

    await upsertAudienceContact({
      resend,
      audienceId,
      email: user.email,
      name: user.name,
      resendCall,
    });

    await ctx.runMutation(internal.users.markResendContactSyncSuccessInternal, {
      userId: user._id,
      syncedEmail: normalizedEmail,
    });
    return { success: true, skipped: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.users.markResendContactSyncFailedInternal, {
      userId: user._id,
      error: errorMessage,
    });
    console.error(
      `[syncResendContactForUser] Failed syncing ${normalizedEmail}:`,
      errorMessage,
    );
    return { success: false, skipped: false, error: errorMessage };
  }
}

function getMarkdownFromBroadcastContent(args: {
  html?: string | null;
  text?: string | null;
}): string {
  const embeddedMarkdown = extractEmbeddedMarkdown(args.html);
  if (embeddedMarkdown !== null) {
    return embeddedMarkdown;
  }
  return args.text ?? "";
}

export const listBroadcasts = action({
  args: {},
  handler: async (ctx) => {
    await requireAdminUser(ctx);

    const resend = getResendClient();
    const audienceId = getAudienceId();
    const result = await resend.broadcasts.list();
    const broadcasts = ensureResendData(
      result,
      "Failed to list broadcasts from Resend",
    );

    const rows = broadcasts.data
      .filter((broadcast) => broadcast.audience_id === audienceId)
      .sort(
        (a, b) =>
          (parseTimestamp(b.created_at) ?? 0) -
          (parseTimestamp(a.created_at) ?? 0),
      )
      .map((broadcast) => ({
        id: broadcast.id,
        name: broadcast.name,
        status: broadcast.status,
        createdAt: parseTimestamp(broadcast.created_at) ?? Date.now(),
        scheduledAt: parseTimestamp(broadcast.scheduled_at),
        sentAt: parseTimestamp(broadcast.sent_at),
      }));

    return { blasts: rows };
  },
});

export const getBroadcastDraft = action({
  args: {
    broadcastId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);

    const resend = getResendClient();
    const audienceId = getAudienceId();
    const result = await resend.broadcasts.get(args.broadcastId);
    const broadcast = ensureResendData(result, "Broadcast not found in Resend");

    if (broadcast.audience_id !== audienceId) {
      throw new Error("This broadcast is not part of the configured audience");
    }

    const markdown = getMarkdownFromBroadcastContent({
      html: (broadcast as { html?: string | null }).html,
      text: (broadcast as { text?: string | null }).text,
    });

    return {
      id: broadcast.id,
      subject: broadcast.subject ?? broadcast.name ?? "",
      contentMarkdown: markdown,
      status: broadcast.status,
      createdAt: parseTimestamp(broadcast.created_at) ?? Date.now(),
      scheduledAt: parseTimestamp(broadcast.scheduled_at),
      sentAt: parseTimestamp(broadcast.sent_at),
    };
  },
});

export const createDraft = action({
  args: {
    subject: v.string(),
    contentMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);

    const subject = args.subject.trim();
    if (!subject) {
      throw new Error("Subject is required");
    }

    const contentMarkdown = args.contentMarkdown.trim();
    if (!contentMarkdown) {
      throw new Error("Email body is required");
    }

    const resend = getResendClient();
    const audienceId = getAudienceId();
    const create = await resend.broadcasts.create({
      audienceId,
      name: subject,
      from: BLAST_FROM_EMAIL,
      replyTo: BLAST_REPLY_TO_EMAIL,
      subject,
      html: buildEmailHtml(contentMarkdown),
      text: buildEmailText(contentMarkdown),
    });

    const broadcast = ensureResendData(create, "Failed to create broadcast");
    return { blastId: broadcast.id };
  },
});

export const updateDraft = action({
  args: {
    blastId: v.string(),
    subject: v.string(),
    contentMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);

    const subject = args.subject.trim();
    if (!subject) {
      throw new Error("Subject is required");
    }

    const contentMarkdown = args.contentMarkdown.trim();
    if (!contentMarkdown) {
      throw new Error("Email body is required");
    }

    const resend = getResendClient();
    const audienceId = getAudienceId();

    const existingResult = await resend.broadcasts.get(args.blastId);
    const existing = ensureResendData(existingResult, "Broadcast not found");
    if (existing.audience_id !== audienceId) {
      throw new Error("This broadcast is not part of the configured audience");
    }
    if (existing.status !== "draft") {
      throw new Error("Only draft broadcasts can be edited");
    }

    const update = await resend.broadcasts.update(args.blastId, {
      name: subject,
      from: BLAST_FROM_EMAIL,
      replyTo: [BLAST_REPLY_TO_EMAIL],
      subject,
      html: buildEmailHtml(contentMarkdown),
      text: buildEmailText(contentMarkdown),
    });
    ensureResendData(update, "Failed to update broadcast");

    return { success: true };
  },
});

export const deleteDraft = action({
  args: {
    blastId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);

    const resend = getResendClient();
    const audienceId = getAudienceId();

    const existingResult = await resend.broadcasts.get(args.blastId);
    const existing = ensureResendData(existingResult, "Broadcast not found");
    if (existing.audience_id !== audienceId) {
      throw new Error("This broadcast is not part of the configured audience");
    }
    if (existing.status === "queued") {
      throw new Error("Queued broadcasts cannot be deleted");
    }

    const remove = await resend.broadcasts.remove(args.blastId);
    ensureResendData(remove, "Failed to delete broadcast");

    return { success: true };
  },
});

export const sendBlast = action({
  args: {
    blastId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);

    const resend = getResendClient();
    const audienceId = getAudienceId();

    const existingResult = await resend.broadcasts.get(args.blastId);
    const existing = ensureResendData(existingResult, "Broadcast not found");
    if (existing.audience_id !== audienceId) {
      throw new Error("This broadcast is not part of the configured audience");
    }
    if (existing.status === "sent") {
      throw new Error("This broadcast was already sent");
    }
    if (existing.status === "queued") {
      throw new Error("This broadcast is already queued to send");
    }

    const sent = await resend.broadcasts.send(args.blastId);
    const sentData = ensureResendData(sent, "Failed to send broadcast");

    return {
      success: true,
      broadcastId: sentData.id,
    };
  },
});

export const getMyEmailPreferences = action({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const resend = getResendClient();
    const audienceId = getAudienceId();
    const normalizedEmail = user.email.trim().toLowerCase();
    const contact = await resend.contacts.get({
      audienceId,
      email: normalizedEmail,
    });

    if (contact.error && !isNotFoundError(contact.error)) {
      throw new Error(contact.error.message);
    }

    if (!contact.data) {
      await upsertAudienceContact({
        resend,
        audienceId,
        email: normalizedEmail,
        name: user.name,
      });
      await ctx.runMutation(
        internal.users.markResendContactSyncSuccessInternal,
        {
          userId: user._id,
          syncedEmail: normalizedEmail,
        },
      );
      return {
        email: normalizedEmail,
        promotionalEmailsSubscribed: true,
        promotionalEmailsUnsubscribed: false,
      };
    }

    const unsubscribed = contact.data.unsubscribed === true;
    await ctx.runMutation(internal.users.markResendContactSyncSuccessInternal, {
      userId: user._id,
      syncedEmail: normalizedEmail,
    });
    return {
      email: normalizedEmail,
      promotionalEmailsSubscribed: !unsubscribed,
      promotionalEmailsUnsubscribed: unsubscribed,
    };
  },
});

export const setMyPromotionalEmailsSubscribed = action({
  args: {
    subscribed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const resend = getResendClient();
    const audienceId = getAudienceId();

    await upsertAudienceContact({
      resend,
      audienceId,
      email: user.email,
      name: user.name,
      subscribed: args.subscribed,
    });
    await ctx.runMutation(internal.users.markResendContactSyncSuccessInternal, {
      userId: user._id,
      syncedEmail: normalizeEmail(user.email),
    });

    return {
      success: true,
      promotionalEmailsSubscribed: args.subscribed,
      promotionalEmailsUnsubscribed: !args.subscribed,
    };
  },
});

export const syncAudienceContactsBatch = action({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    processedUsers: number;
    pagesProcessed: number;
    continueCursor: string;
    isDone: boolean;
  }> => {
    await requireAdminUser(ctx);

    const resend = getResendClient();
    const audienceId = getAudienceId();
    const resendCall = createRateLimitedResendCaller(
      RESEND_SYNC_MAX_REQUESTS_PER_SECOND,
    );

    const batchSize = Math.min(
      MAX_SYNC_BATCH_SIZE,
      Math.max(1, args.batchSize ?? DEFAULT_SYNC_BATCH_SIZE),
    );
    let cursor = args.cursor;
    let isDone = false;

    let pagesProcessed = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let processedUsers = 0;

    while (!isDone) {
      const page: {
        users: Array<{
          userId: Id<"users">;
          email: string;
          name: string;
        }>;
        continueCursor: string;
        isDone: boolean;
      } = await ctx.runQuery(internal.users.listUsersForPromotionalEmailSync, {
        cursor,
        numItems: batchSize,
      });

      pagesProcessed += 1;
      processedUsers += page.users.length;
      cursor = page.continueCursor;
      isDone = page.isDone;

      const usersByEmail = new Map<
        string,
        Array<{
          userId: Id<"users">;
          email: string;
          name: string;
        }>
      >();
      for (const user of page.users) {
        const emailKey = normalizeEmail(user.email);
        if (!emailKey) {
          continue;
        }
        const existing = usersByEmail.get(emailKey) ?? [];
        existing.push(user);
        usersByEmail.set(emailKey, existing);
      }

      const uniqueUsersToSync: Array<{
        userId: Id<"users">;
        email: string;
        name: string;
      }> = Array.from(usersByEmail.values()).map((users) => users[0]);

      for (const user of uniqueUsersToSync) {
        const emailKey = normalizeEmail(user.email);
        const groupedUsers = usersByEmail.get(emailKey) ?? [user];

        try {
          const result = await upsertAudienceContact({
            resend,
            audienceId,
            email: user.email,
            name: user.name,
            resendCall,
          });

          await Promise.all(
            groupedUsers.map((groupedUser) =>
              ctx.runMutation(
                internal.users.markResendContactSyncSuccessInternal,
                {
                  userId: groupedUser.userId,
                  syncedEmail: emailKey,
                },
              ),
            ),
          );

          if (result === "created") {
            created += 1;
          } else if (result === "updated") {
            updated += 1;
          } else {
            skipped += 1;
          }
        } catch (error) {
          failed += 1;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          await Promise.all(
            groupedUsers.map((groupedUser) =>
              ctx.runMutation(
                internal.users.markResendContactSyncFailedInternal,
                {
                  userId: groupedUser.userId,
                  error: errorMessage,
                },
              ),
            ),
          );
          console.error(
            `[syncAudienceContactsBatch] Failed syncing ${emailKey}:`,
            errorMessage,
          );
        }
      }
    }

    return {
      success: true,
      created,
      updated,
      skipped,
      failed,
      processedUsers,
      pagesProcessed,
      continueCursor: cursor ?? "",
      isDone,
    };
  },
});

export const syncUserContactInternal = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; skipped: boolean; error?: string }> => {
    const user: Doc<"users"> | null = await ctx.runQuery(internal.users.get, {
      userId: args.userId,
    });
    if (!user || !user.email) {
      return { success: false, skipped: false, error: "User not found" };
    }

    return await syncResendContactForUser(ctx, user);
  },
});

export const syncMyContact = action({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user || !user.email) {
      throw new Error("Unauthorized");
    }

    return await syncResendContactForUser(ctx, user);
  },
});
