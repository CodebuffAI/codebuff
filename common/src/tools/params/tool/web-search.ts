import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'web_search'
const endsAgentStep = true
const inputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        `The search query to find relevant web content. Required unless url is provided.`,
      ),
    url: z
      .string()
      .url()
      .optional()
      .describe(
        `A specific URL to fetch and read the full text content of. When provided, fetches this page directly instead of searching. Useful for reading documentation, GitHub READMEs, blog posts, or any public web page.`,
      ),
    depth: z
      .enum(['standard', 'deep'])
      .optional()
      .default('standard')
      .describe(
        `Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'. Ignored when url is provided.`,
      ),
    include_links: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        `When fetching a URL, also extract and return links found on the page. Enables navigation by letting you see what pages are linked. Default: true.`,
      ),
    max_links: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(40)
      .describe(
        `Maximum number of links to extract when include_links is true. Default: 40.`,
      ),
  })
  .describe(
    `Search the web for current information, or fetch the content of a specific URL.`,
  )
const description = `
Purpose: Search the web for current, up-to-date information, or read the full content of a specific web page by URL. Supports multi-step navigation: fetch a page, inspect the extracted links, then fetch the next relevant URL.

Two modes:
- **Search mode** (provide \`query\`): Searches the web using DuckDuckGo and returns a list of results with titles, URLs, and descriptions.
- **Fetch mode** (provide \`url\`): Fetches the full text content of the given URL directly. Returns the page text plus a \`links\` array of \`{href, text}\` pairs found on the page so you can navigate further. GitHub repo URLs (github.com/{owner}/{repo}) are automatically resolved to the raw README for clean content.

Navigation pattern: call with \`url\`, read the result, pick a link from \`links\`, call again with that URL.

Use cases:
- Finding current information about technologies, libraries, or frameworks
- Researching best practices, solutions, or alternatives
- Reading a specific GitHub repo, npm package page, or documentation URL
- Navigating multi-page docs or following links to get deeper content
- Getting up-to-date news or API status
- Checking package documentation or changelogs

Examples:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    query: 'Next.js 15 new features',
    depth: 'standard',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    url: 'https://github.com/vercel/next.js',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    query: 'React Server Components tutorial',
    depth: 'deep',
  },
  endsAgentStep,
})}
`.trim()

export const webSearchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        result: z.string(),
        links: z
          .array(z.object({ href: z.string(), text: z.string() }))
          .optional()
          .describe(
            'Source links for search results, or the fetched page plus links extracted from it.',
          ),
      }),
      z.object({
        resultOmittedForLength: z.literal(true),
        resultExcerpt: z.string().optional(),
        links: z
          .array(z.object({ href: z.string(), text: z.string() }))
          .max(5)
          .optional(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
