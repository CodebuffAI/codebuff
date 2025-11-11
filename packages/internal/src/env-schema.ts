import { clientEnvSchema, clientProcessEnv } from '@codebuff/common/env-schema'
import z from 'zod/v4'

export const serverEnvSchema = clientEnvSchema.extend({
  // Backend variables
  CODEBUFF_API_KEY: z.string().optional(),
  OPEN_ROUTER_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  RELACE_API_KEY: z.string().min(1),
  LINKUP_API_KEY: z.string().min(1),
  CONTEXT7_API_KEY: z.string().optional(),
  GOOGLE_CLOUD_PROJECT_ID: z.string().min(1),
  PORT: z.coerce.number().min(1000),

  // Web/Database variables
  DATABASE_URL: z.string().min(1),
  GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
  CODEBUFF_GITHUB_ID: z.string().min(1),
  CODEBUFF_GITHUB_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.url().optional(),
  NEXTAUTH_SECRET: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET_KEY: z.string().min(1),
  STRIPE_USAGE_PRICE_ID: z.string().min(1),
  STRIPE_TEAM_FEE_PRICE_ID: z.string().min(1),
  LOOPS_API_KEY: z.string().min(1),
  DISCORD_PUBLIC_KEY: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: z.string().min(1),

  // Common variables
  API_KEY_ENCRYPTION_SECRET: z.string().length(32),
})
export const serverEnvVars = serverEnvSchema.keyof().options
export type ServerEnvVar = (typeof serverEnvVars)[number]
export type ServerInput = {
  [K in (typeof serverEnvVars)[number]]: string | undefined
}
export type ServerEnv = z.infer<typeof serverEnvSchema>

// Bun will inject all these values, so we need to reference them individually (no for-loops)
export const serverProcessEnv: ServerInput = {
  ...clientProcessEnv,

  // Backend variables
  CODEBUFF_API_KEY: process.env.CODEBUFF_API_KEY,
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  RELACE_API_KEY: process.env.RELACE_API_KEY,
  LINKUP_API_KEY: process.env.LINKUP_API_KEY,
  CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY,
  GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
  PORT: process.env.PORT,

  // Web/Database variables
  DATABASE_URL: process.env.DATABASE_URL,
  GOOGLE_SITE_VERIFICATION_ID: process.env.GOOGLE_SITE_VERIFICATION_ID,
  CODEBUFF_GITHUB_ID: process.env.CODEBUFF_GITHUB_ID,
  CODEBUFF_GITHUB_SECRET: process.env.CODEBUFF_GITHUB_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET_KEY: process.env.STRIPE_WEBHOOK_SECRET_KEY,
  STRIPE_USAGE_PRICE_ID: process.env.STRIPE_USAGE_PRICE_ID,
  STRIPE_TEAM_FEE_PRICE_ID: process.env.STRIPE_TEAM_FEE_PRICE_ID,
  LOOPS_API_KEY: process.env.LOOPS_API_KEY,
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,

  // Common variables
  API_KEY_ENCRYPTION_SECRET: process.env.API_KEY_ENCRYPTION_SECRET,
}
