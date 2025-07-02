import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'
import { CodebuffToolDef } from '../constants'

export const webSearchTool = {
  toolName: 'web_search',
  endsAgentStep: true,
  parameters: z
    .object({
      query: z
        .string()
        .min(1, 'Query cannot be empty')
        .describe(`The search query to find relevant web content`),
      depth: z
        .enum(['standard', 'deep'])
        .optional()
        .default('standard')
        .describe(
          `Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'.`
        ),
    })
    .describe(`Search the web for current information using Linkup API.`),
  description: `
Purpose: Search the web for current, up-to-date information on any topic. This tool uses Linkup's web search API to find relevant content from across the internet.

Use cases:
- Finding current information about technologies, libraries, or frameworks
- Researching best practices and solutions
- Getting up-to-date news or documentation
- Finding examples and tutorials
- Checking current status of services or APIs

The tool will return search results with titles, URLs, and content snippets.

Example:
${getToolCallString('web_search', {
  query: 'Next.js 15 new features',
  depth: 'standard',
})}

${getToolCallString('web_search', {
  query: 'React Server Components tutorial',
  depth: 'deep',
})}
    `.trim(),
} satisfies CodebuffToolDef
