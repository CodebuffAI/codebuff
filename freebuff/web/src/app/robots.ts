import type { MetadataRoute } from 'next'

import { siteConfig } from '@/lib/constant'

/**
 * robots.txt.
 *
 * We explicitly allow the AI-search crawlers (GPTBot, OAI-SearchBot,
 * ClaudeBot, Anthropic-AI, PerplexityBot, Google-Extended) so Freebuff
 * appears in AI search and answer engines. Block paths that should never
 * be indexed.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = siteConfig.url()

  const disallow = [
    '/api/',
    '/cloud/project/',
    '/web/admin/',
    '/web/dashboard/',
    '/web/project/',
    '/web/devtools/',
    '/web/devtool/',
    '/sso-callback',
    '/callback',
    '/invite/',
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
