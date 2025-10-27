import { z } from 'zod'

export const serverEnvSchema = {
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
  NEXTAUTH_URL: z.string().url().optional(),
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
} as const

export const clientEnvSchema = {
  NEXT_PUBLIC_CB_ENVIRONMENT: z.string().min(1),
  NEXT_PUBLIC_CODEBUFF_APP_URL: z.string().url().min(1),
  NEXT_PUBLIC_CODEBUFF_BACKEND_URL: z.string().min(1),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().min(1),
  NEXT_PUBLIC_POSTHOG_API_KEY: z.string().optional().default(''),
  NEXT_PUBLIC_POSTHOG_HOST_URL: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: z.string().url().min(1),
  NEXT_PUBLIC_LINKEDIN_PARTNER_ID: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
  NEXT_PUBLIC_WEB_PORT: z.coerce.number().min(1000).optional().default(3000),
} as const
