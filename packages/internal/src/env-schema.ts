import { clientEnvSchema, clientProcessEnv } from '@codebuff/common/env-schema'
import z from 'zod/v4'

export const serverEnvSchema = clientEnvSchema.extend({
  // LLM API keys
  OPEN_ROUTER_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  LINKUP_API_KEY: z.string().min(1),
  CONTEXT7_API_KEY: z.string().optional(),
  GRAVITY_API_KEY: z.string().min(1),
  PORT: z.coerce.number().min(1000),

  // Web/Database variables
  DATABASE_URL: z.string().min(1),
  CODEBUFF_GITHUB_ID: z.string().min(1),
  CODEBUFF_GITHUB_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.url().optional(),
  NEXTAUTH_SECRET: z.string().min(1),
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
  LINKUP_API_KEY: process.env.LINKUP_API_KEY,
  CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY,
  GRAVITY_API_KEY: process.env.GRAVITY_API_KEY,
  PORT: process.env.PORT,

  // Web/Database variables
  DATABASE_URL: process.env.DATABASE_URL,
  CODEBUFF_GITHUB_ID: process.env.CODEBUFF_GITHUB_ID,
  CODEBUFF_GITHUB_SECRET: process.env.CODEBUFF_GITHUB_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET_KEY: process.env.STRIPE_WEBHOOK_SECRET_KEY,
  STRIPE_TEAM_FEE_PRICE_ID: process.env.STRIPE_TEAM_FEE_PRICE_ID,
  STRIPE_SUBSCRIPTION_100_PRICE_ID: process.env.STRIPE_SUBSCRIPTION_100_PRICE_ID,
  STRIPE_SUBSCRIPTION_200_PRICE_ID: process.env.STRIPE_SUBSCRIPTION_200_PRICE_ID,
  STRIPE_SUBSCRIPTION_500_PRICE_ID: process.env.STRIPE_SUBSCRIPTION_500_PRICE_ID,
  LOOPS_API_KEY: process.env.LOOPS_API_KEY,
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
}
