import { blogConfig } from '@/lib/blog/config'
import { getAllPosts } from '@/lib/blog/registry'
import { siteConfig } from '@/lib/constant'
import { homeFaqs } from '@/lib/home-faqs'

export const dynamic = 'force-static'
export const revalidate = 3600

/**
 * /llms.txt — the llmstxt.org index for AI agents and answer engines.
 *
 * A concise markdown map of the site so LLM crawlers (ChatGPT, Claude,
 * Perplexity, Gemini) can understand what Freebuff is and find the
 * authoritative pages. Full page content lives at /llms-full.txt.
 */
export async function GET(): Promise<Response> {
  const siteUrl = siteConfig.url()
  const posts = getAllPosts()

  const featured = posts.filter((p) => p.featured)
  const rest = posts.filter((p) => !p.featured)

  const postLine = (p: (typeof posts)[number]) =>
    `- [${p.title}](${siteUrl}${blogConfig.basePath}/${p.slug}): ${p.description}`

  const faqLines = homeFaqs
    .map((f) => `### ${f.question}\n\n${f.answer}`)
    .join('\n\n')

  const body = `# Freebuff

> ${siteConfig.description}

Freebuff has two products, both free:

- **Freebuff CLI** — a free AI coding agent for your terminal. Install with \`npm install -g freebuff\`, then run \`freebuff\` in any project. It edits code, runs commands, and ships features autonomously. Supported by text ads shown in the CLI; no subscription or credit card required. Works on macOS, Windows, and Linux.
- **Freebuff Web** (${siteUrl}/web) — a free full-stack web app builder. Describe the app you want and it builds, hosts, and deploys it. The free alternative to Lovable, Bolt.new, Replit Agent, and v0.

Freebuff is built by the Codebuff team (https://codebuff.com) on the same agent framework.

## Key pages

- [Home](${siteUrl}/): What Freebuff is, install instructions, and FAQ
- [Get started](${siteUrl}/get-started): Step-by-step setup guide for the CLI
- [Freebuff Web](${siteUrl}/web): The free full-stack app builder
- [Community](${siteUrl}/web/community): Apps built with Freebuff Web
- [Blog](${siteUrl}${blogConfig.basePath}): Guides and comparisons ([RSS](${siteUrl}${blogConfig.basePath}/rss.xml))
- [Privacy policy](${siteUrl}/web/privacy)
- [Terms of service](${siteUrl}/web/terms)

## FAQ

${faqLines}

## Featured articles

${featured.map(postLine).join('\n')}

## More articles

${rest.map(postLine).join('\n')}

## Optional

- [Full site content for LLMs](${siteUrl}/llms-full.txt): Every page above rendered as plain markdown
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
