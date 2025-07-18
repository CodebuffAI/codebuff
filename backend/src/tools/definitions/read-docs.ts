import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'
import { CodebuffToolDef } from '../constants'

const toolName = 'read_docs'
const endsAgentStep = true
export const readDocsTool = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      libraryTitle: z
        .string()
        .min(1, 'Library title cannot be empty')
        .describe(
          `The exact library or framework name (e.g., "Next.js", "MongoDB", "React"). Use the official name as it appears in documentation, not a search query.`
        ),
      topic: z
        .string()
        .optional()
        .describe(
          `Optional specific topic to focus on (e.g., "routing", "hooks", "authentication")`
        ),
      max_tokens: z
        .number()
        .optional()
        .describe(
          `Optional maximum number of tokens to return. Defaults to 10000. Values less than 10000 are automatically increased to 10000.`
        ),
    })
    .describe(
      `Fetch up-to-date documentation for libraries and frameworks using Context7 API.`
    ),
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
${getToolCallString(
  toolName,
  {
    libraryTitle: 'Next.js',
    topic: 'app router',
    max_tokens: 15000,
  },
  endsAgentStep
)}

${getToolCallString(
  toolName,
  {
    libraryTitle: 'MongoDB',
  },
  endsAgentStep
)}
    `.trim(),
} satisfies CodebuffToolDef
