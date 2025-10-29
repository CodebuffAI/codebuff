import { clientEnvSchema } from '@codebuff/common/env-schema'
import z from 'zod/v4'

export const serverEnvSchema = clientEnvSchema.extend({
  // Backend variables
  CODEBUFF_API_KEY: z.string().optional(),
  OPEN_ROUTER_API_KEY: z.string().min(1),
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
