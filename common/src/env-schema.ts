import z from 'zod/v4'

export const CLIENT_ENV_PREFIX = 'NEXT_PUBLIC_'

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_CB_ENVIRONMENT: z.enum(['dev', 'test', 'prod']),
  NEXT_PUBLIC_CODEBUFF_APP_URL: z.url().min(1),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.email().min(1),
  NEXT_PUBLIC_POSTHOG_API_KEY: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_HOST_URL: z.url().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: z.url().min(1),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
  NEXT_PUBLIC_WEB_PORT: z.coerce.number().min(1000),
} satisfies Record<`${typeof CLIENT_ENV_PREFIX}${string}`, any>)
export const clientEnvVars = clientEnvSchema.keyof().options
export type ClientEnvVar = (typeof clientEnvVars)[number]
export type ClientInput = {
  [K in (typeof clientEnvVars)[number]]: string | undefined
}
export type ClientEnv = z.infer<typeof clientEnvSchema>

/**
 * Strip wrapping single or double quotes from an env var value.
 * Some secret managers (e.g. Infisical export) produce values like:
 *   NEXT_PUBLIC_SUPPORT_EMAIL='support@codebuff.com'
 * which sets the value to the literal string `'support@codebuff.com'`
 * (with quotes), causing Zod format validators (z.email(), z.url()) to fail.
 */
function stripEnvQuotes(value: string | undefined): string | undefined {
  if (
    value &&
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    return value.slice(1, -1)
  }
  return value
}

// Bun will inject all these values, so we need to reference them individually (no for-loops)
export const clientProcessEnv: ClientInput = {
  NEXT_PUBLIC_CB_ENVIRONMENT: stripEnvQuotes(process.env.NEXT_PUBLIC_CB_ENVIRONMENT),
  NEXT_PUBLIC_CODEBUFF_APP_URL: stripEnvQuotes(process.env.NEXT_PUBLIC_CODEBUFF_APP_URL),
  NEXT_PUBLIC_SUPPORT_EMAIL: stripEnvQuotes(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
  NEXT_PUBLIC_POSTHOG_API_KEY: stripEnvQuotes(process.env.NEXT_PUBLIC_POSTHOG_API_KEY),
  NEXT_PUBLIC_POSTHOG_HOST_URL: stripEnvQuotes(process.env.NEXT_PUBLIC_POSTHOG_HOST_URL),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    stripEnvQuotes(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL:
    stripEnvQuotes(process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL),
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID:
    stripEnvQuotes(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID),
  NEXT_PUBLIC_WEB_PORT: stripEnvQuotes(process.env.NEXT_PUBLIC_WEB_PORT),
}
