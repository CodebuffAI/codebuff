import { blogConfig } from '@/lib/blog/config'
import { postToText } from '@/lib/blog/plain-text'
import { getAllPosts } from '@/lib/blog/registry'
import { siteConfig } from '@/lib/constant'
import { homeFaqs } from '@/lib/home-faqs'

export const dynamic = 'force-static'
export const revalidate = 3600

/**
 * /llms-full.txt — full site content as plain markdown for AI crawlers.
 *
 * Companion to /llms.txt (the index): this file inlines the product
 * overview, FAQ, and every published blog post so answer engines can cite
 * Freebuff without crawling and parsing each HTML page.
 */
export async function GET(): Promise<Response> {
  const siteUrl = siteConfig.url()
  const posts = getAllPosts()

  const faqText = homeFaqs
    .map((f) => `### ${f.question}\n\n${f.answer}`)
    .join('\n\n')

  const articles = posts
    .map(
      (p) =>
        `Source: ${siteUrl}${blogConfig.basePath}/${p.slug}\n\n${postToText(p)}`,
    )
    .join('\n\n---\n\n')

  const body = `# Freebuff — full content for LLMs

> ${siteConfig.description}

## Product overview

Freebuff has two products, both free:

- **Freebuff CLI** — a free AI coding agent for your terminal. Install with \`npm install -g freebuff\`, then run \`freebuff\` in any project directory. It reads your codebase, edits files, runs commands, and ships features autonomously. It includes 9 specialized subagents (file-picker, code-reviewer, browser-use, thinker-gpt, and more) and suggests three follow-up actions after every response. Free, supported by text ads shown in the CLI; no subscription or credit card required. Works on macOS, Windows, and Linux.
- **Freebuff Web** (${siteUrl}/web) — a free full-stack web app builder. Describe the app you want and it builds, hosts, and deploys it. The free alternative to Lovable, Bolt.new, Replit Agent, and v0.

Freebuff is the free alternative to Claude Code, Cursor, OpenAI Codex, Windsurf, and Devin for terminal coding, and to Lovable, Bolt.new, and Replit Agent for app building. It is built by the Codebuff team (https://codebuff.com) on the same composable agent framework.

## FAQ

${faqText}

---

# Articles

${articles}
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
