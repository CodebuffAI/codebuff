import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'read_docs'
export const readDocsTool = {
  toolName,
  description: `
Purpose: Get current, accurate documentation for popular libraries, frameworks, and technologies. This tool searches Context7's database of up-to-date documentation and returns relevant content.

**IMPORTANT**: The \`libraryTitle\` parameter should be the exact, official name of the library or framework, not a search query. Think of it as looking up a specific book title in a library catalog.

Correct examples:
- "Next.js" (not "nextjs tutorial" or "how to use nextjs")
- "React" (not "react hooks guide")
- "MongoDB" (not "mongodb database setup")
- "Express.js" (not "express server")

Use cases:
- Getting current API documentation for a library
- Finding usage examples and best practices
- Understanding how to implement specific features
- Checking the latest syntax and methods

The tool will search for the library and return the most relevant documentation content. If a topic is specified, it will focus the results on that specific area.

Example:
${getToolCallString(toolName, {
  libraryTitle: 'Next.js',
  topic: 'app router',
  max_tokens: 15000,
})}

${getToolCallString(toolName, {
  libraryTitle: 'MongoDB',
  topic: 'database setup',
})}
    `.trim(),
} satisfies ToolDescription
