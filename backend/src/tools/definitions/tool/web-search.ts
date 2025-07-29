import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'web_search'
export const webSearchTool = {
  toolName,
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
${getToolCallString(toolName, {
  query: 'Next.js 15 new features',
  depth: 'standard',
})}

${getToolCallString(toolName, {
  query: 'React Server Components tutorial',
  depth: 'deep',
})}
    `.trim(),
} satisfies ToolDescription
