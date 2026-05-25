"use node";

import { ActionCtx } from "!/_generated/server";
import { internal } from "../../_generated/api";
import { Id } from "!/_generated/dataModel";
import { DaytonaCodebase } from "../../../codebase-utils/codebase/DaytonaCodebase";

export interface ExecuteFreebuffArgs {
  projectId: Id<"project">;
  threadId: Id<"agent_thread">;
  messageId: Id<"agent_message">;
  sandboxId: string;
  activeSessionId: string | undefined;
  executingUserId: Id<"users">;
  userMessage: string;
  images: Id<"_storage">[] | undefined;
}

export interface ExecuteFreebuffResult {
  success: boolean;
  error?: string;
  sessionId?: string;
}

async function readStoredRunState(
  ctx: ActionCtx,
  threadId: Id<"agent_thread">,
) {
  const thread = await ctx.runQuery(
    internal.coding_agent.cli_agent.agent_thread.getAgentThread,
    { threadId },
  );
  const storageId = (thread as any)?.active_freebuff_run_state_storage_id;
  if (!storageId) return undefined;

  const blob = await ctx.storage.get(storageId);
  if (!blob) return undefined;
  return JSON.parse(await blob.text());
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function executeFreebuff(
  ctx: ActionCtx,
  _codebase: DaytonaCodebase,
  args: ExecuteFreebuffArgs,
): Promise<ExecuteFreebuffResult> {
  const harnessUrl = requireEnv("FREEBUFF_HARNESS_URL").replace(/\/+$/, "");
  const convexSiteUrl = requireEnv("VLY_CONVEX_SITE_URL").replace(/\/+$/, "");
  const codebuffApiKey = requireEnv("CODEBUFF_API_KEY");
  const callbackToken = requireEnv("FREEBUFF_TO_VLY_CALLBACK_TOKEN");

  let userMessage = args.userMessage;
  if (args.images && args.images.length > 0) {
    const imageUrls: string[] = [];
    for (const imageId of args.images) {
      const imageUrl = await ctx.storage.getUrl(imageId);
      if (imageUrl) imageUrls.push(imageUrl);
    }
    if (imageUrls.length > 0) {
      userMessage = `${userMessage}\n\nUser uploaded images:\n${imageUrls
        .map((url, index) => `[Image ${index + 1}: ${url}]`)
        .join("\n")}`;
    }
  }

  const previousRunState = await readStoredRunState(ctx, args.threadId);
  const runId = crypto.randomUUID();

  const response = await fetch(`${harnessUrl}/api/v1/freebuff/harness/runs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${codebuffApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      runId,
      prompt: userMessage,
      previousRunState,
      projectId: args.projectId,
      threadId: args.threadId,
      messageId: args.messageId,
      callbacks: {
        toolUrl: `${convexSiteUrl}/freebuff/tool`,
        eventUrl: `${convexSiteUrl}/freebuff/events`,
        bearerToken: callbackToken,
      },
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `Freebuff harness failed (${response.status}): ${await response.text()}`,
    };
  }

  await ctx.runMutation(
    internal.coding_agent.cli_agent.agent_message.updateAgentMessageSessionId,
    {
      messageId: args.messageId,
      sessionId: runId,
    },
  );

  return { success: true, sessionId: runId };
}
