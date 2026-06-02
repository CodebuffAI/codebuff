import { env } from '@codebuff/common/env'

import type { MetadataRoute } from 'next'

/**
 * robots.txt.
 *
 * We explicitly allow the AI-search crawlers (GPTBot, OAI-SearchBot,
 * ClaudeBot, Anthropic-AI, PerplexityBot, Google-Extended) so Freebuff
 * appears in AI search and answer engines. Block paths that should never
 * be indexed.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL

  const disallow = [
    '/api/',
    '/web/admin/',
    '/web/dashboard/',
    '/web/project/',
    '/web/devtools/',
    '/web/devtool/',
    '/sso-callback',
    '/callback',
    '/invite/',
    '/live',
  ]

  const aiAndSearchBots = [
    'Googlebot',
    'Bingbot',
    'DuckDuckBot',
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Anthropic-AI',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended',
    'CCBot',
    'Applebot',
    'Applebot-Extended',
    'cohere-ai',
    'YouBot',
    'meta-externalagent',
    'Amazonbot',
    'Bytespider',
    'Diffbot',
  ]

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      ...aiAndSearchBots.map((ua) => ({
        userAgent: ua,
        allow: '/',
        disallow,
      })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
