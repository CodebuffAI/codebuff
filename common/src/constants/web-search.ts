/**
 * Web-search provider universe, the research-effort tiers, and the server-side
 * environment the /api/v1/web-search route consumes.
 *
 * This is the shared contract between the tool-facing surface (which names a
 * provider and effort tier in a request body), the env schema (which may pin
 * one deployment-wide provider), and the serving endpoints (which resolve and
 * dispatch). Keeping the universes here means adding a provider or an effort
 * tier touches exactly one enum instead of every consumer spelling its own
 * union.
 */

export const WEB_SEARCH_PROVIDERS = ['serper', 'futuresearch'] as const
export type WebSearchProvider = (typeof WEB_SEARCH_PROVIDERS)[number]

/**
 * The research-effort tiers for the FutureSearch multi-agent team, shared by
 * the tool schema, the facade, the /api/v1/deep-research request validation,
 * and the researchQuery wrapper. low (3 fast agents), medium (4 agents, the
 * default), high (2 frontier agents, deepest but slowest and most expensive).
 */
export const RESEARCH_EFFORTS = ['low', 'medium', 'high'] as const
export type ResearchEffort = (typeof RESEARCH_EFFORTS)[number]

/**
 * Provider credentials and routing knobs for the web-search pipeline.
 *
 * `serper` is the classic keyword-search provider; `futuresearch` runs the
 * same tool against FutureSearch's multi-agent research API. Credentials are
 * provided by the deployment; `WEB_SEARCH_PROVIDER` selects the default when a
 * request does not name one.
 */
export interface WebSearchEnv {
  SERPER_API_KEY?: string
  FUTURESEARCH_API_KEY?: string
  /** Optional override for the FutureSearch API base URL. */
  FUTURESEARCH_API_URL?: string
  WEB_SEARCH_PROVIDER?: WebSearchProvider
}
