/** Public metadata only. A connected app's credentials never leave the server. */
export type IntegrationApp = {
  /** Catalog slug, e.g. `gmail`. */
  slug: string
  name: string
  /** Served from Freebuff's logo route, never a third-party host. */
  logo: string
}

/** One account the user connected for an app. */
export type IntegrationAccount = {
  /** Opaque id; the server checks ownership before acting on it. */
  id: string
  /** Short, token-friendly handle the agent passes to choose this account. */
  handle: string
  /** The provider's own name for the account, e.g. its email address. */
  label: string | null
  connectedAt: string
}

export type IntegrationConnection = {
  app: IntegrationApp
  accounts: IntegrationAccount[]
}

export type IntegrationsOverview = {
  /** False when this environment has no integrations configured. */
  available: boolean
  connections: IntegrationConnection[]
  featured: IntegrationApp[]
}

export type IntegrationsClient = {
  overview(): Promise<IntegrationsOverview>
  search(
    query: string,
    signal?: AbortSignal,
  ): Promise<{ apps: IntegrationApp[] }>
  connect(app: string): Promise<{ url: string }>
  disconnect(accountId: string): Promise<void>
}

/** Freebuff web page that finishes a connection for the signed-in account. */
export const INTEGRATIONS_CALLBACK_PATH = '/integrations/callback'
/** Freebuff web route that serves an app's logo by slug. */
export const INTEGRATION_LOGO_PATH = '/api/integrations/logo'
/** BroadcastChannel the callback page posts to, so an open Settings tab updates at once. */
export const INTEGRATIONS_CHANNEL = 'freebuff-integrations'

export const MAX_INTEGRATION_ACCOUNTS_PER_APP = 5
export const MAX_INTEGRATION_SEARCH_CHARS = 80

/** Shown before the user searches, in this order. */
export const FEATURED_INTEGRATIONS = [
  'gmail',
  'googlecalendar',
  'googledrive',
  'slack',
  'notion',
  'linear',
  'posthog',
  'sentry',
  'stripe',
  'supabase',
  'hubspot',
  'outlook',
] as const

const SLUG = /^[a-z0-9][a-z0-9_]{0,63}$/
const ACCOUNT_ID = /^[a-zA-Z0-9_-]{1,64}$/

export function validIntegrationSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG.test(value)
}

export function validIntegrationAccountId(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_ID.test(value)
}

export function integrationLogoUrl(origin: string, slug: string): string {
  return new URL(`${INTEGRATION_LOGO_PATH}/${slug}`, origin).href
}
