import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { incrementStatDirectly } from "./stats";

type ReadDbCtx = Pick<QueryCtx, "db">;

export const AUTH_COUNTER_NAMES = {
  chatgptSubscriptionConnected: "admin_auth_chatgpt_connected",
  codexOpenAiByok: "admin_auth_codex_openai_byok",
  claudeAnthropicByok: "admin_auth_claude_anthropic_byok",
  claudeBedrockByok: "admin_auth_claude_bedrock_byok",
  gptPreferredOAuth: "admin_auth_gpt_pref_oauth",
  gptPreferredByok: "admin_auth_gpt_pref_byok",
} as const;

export type AuthMetricKey = keyof typeof AUTH_COUNTER_NAMES;

const AGENT_THREAD_COUNTER_PREFIX = "admin_threads_";

export function agentThreadCounterName(agentType: string): string {
  return `${AGENT_THREAD_COUNTER_PREFIX}${agentType.replace(/ /g, "_").toLowerCase()}`;
}

export function userAuthMetricFlags(user: Doc<"users"> | null) {
  return {
    chatgptSubscriptionConnected:
      user?.codex_auth_mode === "chatgpt" &&
      user?.codex_oauth_revoked !== true,
    codexOpenAiByok: !!user?.gpt_openai_api_key_encrypted,
    claudeAnthropicByok: !!user?.claude_anthropic_api_key_encrypted,
    claudeBedrockByok: !!user?.claude_bedrock_bearer_token_encrypted,
    gptPreferredOAuth: user?.gpt_auth_method === "oauth",
    gptPreferredByok: user?.gpt_auth_method === "byok",
  };
}

async function adjustStatDirectly(
  ctx: MutationCtx,
  name: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;

  const existingStat = await ctx.db
    .query("stats")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();

  const nextValue = Math.max(0, (existingStat?.value ?? 0) + delta);
  if (existingStat) {
    await ctx.db.patch(existingStat._id, { value: nextValue });
    return;
  }

  await ctx.db.insert("stats", { name, value: nextValue });
}

/** Bump auth counters when a user's connection state changes (not on refresh). */
export async function applyUserAuthMetricDelta(
  ctx: MutationCtx,
  before: Doc<"users">,
  after: Doc<"users">,
): Promise<void> {
  const beforeFlags = userAuthMetricFlags(before);
  const afterFlags = userAuthMetricFlags(after);

  for (const key of Object.keys(AUTH_COUNTER_NAMES) as AuthMetricKey[]) {
    const beforeActive = beforeFlags[key] ? 1 : 0;
    const afterActive = afterFlags[key] ? 1 : 0;
    const delta = afterActive - beforeActive;
    if (delta !== 0) {
      await adjustStatDirectly(ctx, AUTH_COUNTER_NAMES[key], delta);
    }
  }
}

/** Increment thread inventory when a new agent thread is created. */
export async function recordAgentThreadCreated(
  ctx: MutationCtx,
  agentType: string,
): Promise<void> {
  await incrementStatDirectly(ctx, agentThreadCounterName(agentType), 1);
}

export async function readAuthCounter(
  ctx: ReadDbCtx,
  key: AuthMetricKey,
): Promise<number> {
  const stat = await ctx.db
    .query("stats")
    .withIndex("by_name", (q) => q.eq("name", AUTH_COUNTER_NAMES[key]))
    .unique();
  return stat?.value ?? 0;
}

export async function readAgentThreadCounter(
  ctx: ReadDbCtx,
  agentType: string,
): Promise<number> {
  const stat = await ctx.db
    .query("stats")
    .withIndex("by_name", (q) => q.eq("name", agentThreadCounterName(agentType)))
    .unique();
  return stat?.value ?? 0;
}
