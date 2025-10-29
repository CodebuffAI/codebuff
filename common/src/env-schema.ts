import z from 'zod/v4'

export const CLIENT_ENV_PREFIX = 'NEXT_PUBLIC_'

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_CB_ENVIRONMENT: z.enum(['dev', 'test', 'prod']),
  NEXT_PUBLIC_CODEBUFF_APP_URL: z.url().min(1),
  NEXT_PUBLIC_CODEBUFF_BACKEND_URL: z.string().min(1),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.email().min(1),
  NEXT_PUBLIC_POSTHOG_API_KEY: z.string().optional().default(''),
  NEXT_PUBLIC_POSTHOG_HOST_URL: z.url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: z.url().min(1),
  NEXT_PUBLIC_LINKEDIN_PARTNER_ID: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
  NEXT_PUBLIC_WEB_PORT: z.coerce.number().min(1000).optional().default(3000),
} satisfies Record<`${typeof CLIENT_ENV_PREFIX}${string}`, any>)
export const clientEnvVars = clientEnvSchema.keyof().options
export type ClientEnvVar = (typeof clientEnvVars)[number]
export type ClientInput = {
  [K in (typeof clientEnvVars)[number]]: string | undefined
}
export type ClientEnv = z.infer<typeof clientEnvSchema>
