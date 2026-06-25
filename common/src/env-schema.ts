import z from 'zod/v4'

export const CLIENT_ENV_PREFIX = 'NEXT_PUBLIC_'

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_CB_ENVIRONMENT: z.enum(['dev', 'test', 'prod']),
  NEXT_PUBLIC_CODEBUFF_APP_URL: z.url().min(1),
  NEXT_PUBLIC_OPENBUFF_APP_URL: z.url().min(1).optional(),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.email().min(1),
  NEXT_PUBLIC_POSTHOG_API_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_HOST_URL: z.url().min(1),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
} satisfies Record<`${typeof CLIENT_ENV_PREFIX}${string}`, any>)
export const clientEnvVars = clientEnvSchema.keyof().options
export type ClientEnvVar = (typeof clientEnvVars)[number]
export type ClientInput = {
  [K in (typeof clientEnvVars)[number]]: string | undefined
}
export type ClientEnv = z.infer<typeof clientEnvSchema>

const defaultClientProcessEnv: ClientInput = {
  NEXT_PUBLIC_CB_ENVIRONMENT: 'dev',
  NEXT_PUBLIC_CODEBUFF_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_OPENBUFF_APP_URL: undefined,
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@openbuff.local',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'openbuff-local',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://app.posthog.com',
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: undefined,
}

// Bun will inject all these values, so we need to reference them individually (no for-loops)
export const clientProcessEnv: ClientInput = {
  NEXT_PUBLIC_CB_ENVIRONMENT:
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT ??
    defaultClientProcessEnv.NEXT_PUBLIC_CB_ENVIRONMENT,
  NEXT_PUBLIC_CODEBUFF_APP_URL:
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL ??
    defaultClientProcessEnv.NEXT_PUBLIC_CODEBUFF_APP_URL,
  NEXT_PUBLIC_OPENBUFF_APP_URL:
    process.env.NEXT_PUBLIC_OPENBUFF_APP_URL ?? undefined,
  NEXT_PUBLIC_SUPPORT_EMAIL:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ??
    defaultClientProcessEnv.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_POSTHOG_API_KEY:
    process.env.NEXT_PUBLIC_POSTHOG_API_KEY ??
    defaultClientProcessEnv.NEXT_PUBLIC_POSTHOG_API_KEY,
  NEXT_PUBLIC_POSTHOG_HOST_URL:
    process.env.NEXT_PUBLIC_POSTHOG_HOST_URL ??
    defaultClientProcessEnv.NEXT_PUBLIC_POSTHOG_HOST_URL,
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID:
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID ??
    defaultClientProcessEnv.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID,
}
