import { clientEnvSchema, clientProcessEnv } from '@codebuff/common/env-schema'
import z from 'zod/v4'

export const serverEnvSchema = clientEnvSchema.extend({
  // LLM API keys
  OPEN_ROUTER_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  FIREWORKS_API_KEY: z.string().min(1),
  MOONSHOT_API_KEY: z.string().min(1).optional(),
  CANOPYWAVE_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  MINIMAX_API_KEY: z.string().min(1).optional(),
  MIMO_API_KEY: z.string().min(1).optional(),
  SILICONFLOW_API_KEY: z.string().min(1).optional(),
  OPENCODE_API_KEY: z.string().min(1).optional(),
  // Infron (https://infron.ai) OpenRouter-compatible aggregator at
  // llm.onerouter.pro. Currently serves GLM 5.2.
  INFRON_API_KEY: z.string().min(1).optional(),
  SERPER_API_KEY: z.string().min(1),
  CONTEXT7_API_KEY: z.string().optional(),
  GRAVITY_API_KEY: z.string().min(1),
  IPINFO_TOKEN: z.string().min(1),
  SPUR_TOKEN: z.string().min(1),
  SCAMALYTICS_API_KEY: z.string().min(1),
  COMPOSIO_API_KEY: z.string().min(1).optional(),
  // BuySellAds (Carbon) zone key used for the Freebuff Carbon ad.
  // Optional: when unset the Carbon provider returns no ad and callers fall
  // back to their cached ads / fallback content. `CVADC53U` is the public
  // test key from BSA docs and is safe to use in dev.
  CARBON_ZONE_KEY: z.string().min(1).optional(),
  PORT: z.coerce.number().min(1000),

  // Web/Database variables
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  CODEBUFF_GITHUB_ID: z.string().min(1),
  CODEBUFF_GITHUB_SECRET: z.string().min(1),
  FREEBUFF_GITHUB_ID: z.string().min(1).optional(),
  FREEBUFF_GITHUB_SECRET: z.string().min(1).optional(),
  // Google OAuth. Optional so environments without Google configured still
  // boot (the Google provider is only registered when both id+secret exist).
  // Freebuff falls back to the CODEBUFF_* credentials when its own are unset.
  CODEBUFF_GOOGLE_ID: z.string().min(1).optional(),
  CODEBUFF_GOOGLE_SECRET: z.string().min(1).optional(),
  FREEBUFF_GOOGLE_ID: z.string().min(1).optional(),
  FREEBUFF_GOOGLE_SECRET: z.string().min(1).optional(),
  NEXTAUTH_URL: z.url().optional(),
  NEXTAUTH_FREEBUFF_URL: z.url().optional(),
  NEXTAUTH_SECRET: z.string().min(1),
  // Dedicated Codebuff service user used by Freebuff Web's server-side
  // Convex actions. This account is unmetered but still records usage.
  FREEBUFF_WEB_SERVICE_USER_ID: z.string().uuid().optional(),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET_KEY: z.string().min(1),
  STRIPE_TEAM_FEE_PRICE_ID: z.string().min(1),
  STRIPE_SUBSCRIPTION_100_PRICE_ID: z.string().min(1),
  STRIPE_SUBSCRIPTION_200_PRICE_ID: z.string().min(1),
  STRIPE_SUBSCRIPTION_500_PRICE_ID: z.string().min(1),
  LOOPS_API_KEY: z.string().min(1),
  DISCORD_PUBLIC_KEY: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: z.string().min(1),

  // Shared secret for the hourly bot-sweep GitHub Action. Callers must send
  // `Authorization: Bearer $BOT_SWEEP_SECRET` to /api/admin/bot-sweep.
  // Optional so dev environments can start without it; the endpoint returns
  // 503 if the secret isn't configured.
  BOT_SWEEP_SECRET: z.string().min(16).optional(),

  // Shared secret for the referral-sweep GitHub Action. Callers must send
  // `Authorization: Bearer $REFERRAL_SWEEP_SECRET` to /api/admin/referral-sweep.
  // Optional so dev environments can start without it; the endpoint returns
  // 503 if the secret isn't configured.
  REFERRAL_SWEEP_SECRET: z.string().min(16).optional(),

  // Shared secret for the chat-attachment-sweep GitHub Action. Callers send
  // `Authorization: Bearer $CHAT_ATTACHMENT_SWEEP_SECRET` to
  // /api/admin/chat-attachment-sweep, which deletes expired chat document
  // blobs. Optional so dev can start without it; the endpoint returns 503 when
  // the secret isn't configured.
  CHAT_ATTACHMENT_SWEEP_SECRET: z.string().min(16).optional(),

  // Optional GitHub PAT used by the bot-sweep to look up each suspect's
  // GitHub account age. Without it we fall back to unauthenticated API
  // calls (60 req/hr from the server IP) which is enough for a normal
  // sweep but risks rate-limiting.
  BOT_SWEEP_GITHUB_TOKEN: z.string().min(1).optional(),

  FREEBUFF_SESSION_LENGTH_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  // Candidate per-egress-IP concurrent active-session ceiling. A residential /
  // CGNAT IP rarely holds more than a handful of simultaneous freebuff sessions;
  // a registration farm holds hundreds (the 2026-06-20 Indonesia farm: ~605 on
  // one client_ip_hash, all idle). Currently LOG-ONLY: at admission we count
  // active sessions sharing the hash and log what this cap *would* block — no
  // request is rejected yet. The default is a starting guess to be tuned from
  // the logged distribution before enforcement. See
  // docs/freebuff-abuse-detection.md ("Mitigation gap").
  FREEBUFF_IP_SESSION_CAP: z.coerce.number().int().positive().default(30),
})
export const serverEnvVars = serverEnvSchema.keyof().options
export type ServerEnvVar = (typeof serverEnvVars)[number]
export type ServerInput = {
  [K in (typeof serverEnvVars)[number]]: string | undefined
}
export type ServerEnv = z.infer<typeof serverEnvSchema>

// CI-only env vars that are NOT in the typed schema
// These are injected for SDK tests but should never be accessed via env.* in code
export const ciOnlyEnvVars = ['CODEBUFF_API_KEY'] as const
export type CiOnlyEnvVar = (typeof ciOnlyEnvVars)[number]

// Bun will inject all these values, so we need to reference them individually (no for-loops)
export const serverProcessEnv: ServerInput = {
  ...clientProcessEnv,

  // LLM API keys
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY,
  MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
  CANOPYWAVE_API_KEY: process.env.CANOPYWAVE_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  MINIMAX_API_KEY: process.env.MINIMAX_API_KEY,
  MIMO_API_KEY: process.env.MIMO_API_KEY,
  SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY,
  OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
  INFRON_API_KEY: process.env.INFRON_API_KEY,
  SERPER_API_KEY: process.env.SERPER_API_KEY,
  CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY,
  GRAVITY_API_KEY: process.env.GRAVITY_API_KEY,
  IPINFO_TOKEN: process.env.IPINFO_TOKEN,
  SPUR_TOKEN: process.env.SPUR_TOKEN,
  SCAMALYTICS_API_KEY: process.env.SCAMALYTICS_API_KEY,
  COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY,
  CARBON_ZONE_KEY: process.env.CARBON_ZONE_KEY,
  PORT: process.env.PORT,

  // Web/Database variables
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  CODEBUFF_GITHUB_ID: process.env.CODEBUFF_GITHUB_ID,
  CODEBUFF_GITHUB_SECRET: process.env.CODEBUFF_GITHUB_SECRET,
  FREEBUFF_GITHUB_ID: process.env.FREEBUFF_GITHUB_ID,
  FREEBUFF_GITHUB_SECRET: process.env.FREEBUFF_GITHUB_SECRET,
  CODEBUFF_GOOGLE_ID: process.env.CODEBUFF_GOOGLE_ID,
  CODEBUFF_GOOGLE_SECRET: process.env.CODEBUFF_GOOGLE_SECRET,
  FREEBUFF_GOOGLE_ID: process.env.FREEBUFF_GOOGLE_ID,
  FREEBUFF_GOOGLE_SECRET: process.env.FREEBUFF_GOOGLE_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_FREEBUFF_URL: process.env.NEXTAUTH_FREEBUFF_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  FREEBUFF_WEB_SERVICE_USER_ID: process.env.FREEBUFF_WEB_SERVICE_USER_ID,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET_KEY: process.env.STRIPE_WEBHOOK_SECRET_KEY,
  STRIPE_TEAM_FEE_PRICE_ID: process.env.STRIPE_TEAM_FEE_PRICE_ID,
  STRIPE_SUBSCRIPTION_100_PRICE_ID:
    process.env.STRIPE_SUBSCRIPTION_100_PRICE_ID,
  STRIPE_SUBSCRIPTION_200_PRICE_ID:
    process.env.STRIPE_SUBSCRIPTION_200_PRICE_ID,
  STRIPE_SUBSCRIPTION_500_PRICE_ID:
    process.env.STRIPE_SUBSCRIPTION_500_PRICE_ID,
  LOOPS_API_KEY: process.env.LOOPS_API_KEY,
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
  BOT_SWEEP_SECRET: process.env.BOT_SWEEP_SECRET,
  REFERRAL_SWEEP_SECRET: process.env.REFERRAL_SWEEP_SECRET,
  CHAT_ATTACHMENT_SWEEP_SECRET: process.env.CHAT_ATTACHMENT_SWEEP_SECRET,
  BOT_SWEEP_GITHUB_TOKEN: process.env.BOT_SWEEP_GITHUB_TOKEN,

  // Freebuff free sessions
  FREEBUFF_SESSION_LENGTH_MS: process.env.FREEBUFF_SESSION_LENGTH_MS,
  FREEBUFF_IP_SESSION_CAP: process.env.FREEBUFF_IP_SESSION_CAP,
}
