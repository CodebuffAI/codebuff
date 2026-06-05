import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'query_index'
const endsAgentStep = true

const inputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        `Natural language query or keyword terms describing the files you are looking for. For example: "authentication", "database migrations", "editor proposal logic", "React components".`,
      ),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .default(20)
      .describe('Maximum number of results to return. Defaults to 20.'),
    fileTypes: z
      .array(z.string().min(1))
      .optional()
      .describe(
        `Optional list of file extensions to filter results (without dot). E.g. ["ts", "tsx"] for TypeScript only.`,
      ),
  })
  .describe(
    `Query the local codebase index to find relevant files ranked by symbol names, imports, headings, and path matching. The index is built automatically on startup.`,
  )

const description = `
Purpose: Query the local codebase index to find relevant files ranked by their relevance to your query. Use this as your first step when looking for files related to a concept, feature, or module.

The index tracks:
- File paths and extensions
- Exported/defined symbol names (functions, classes, types, constants)
- Import paths and dependencies
- Markdown headings (for .md/.mdx files)

Query tips:
- Use descriptive natural language: "user authentication", "database connection", "react hooks"
- Use camelCase or PascalCase terms to find symbols: "createUser", "AuthProvider"
- Combine concept + type: "editor agent typescript", "test utilities"
- For docs: use topic keywords that would appear in headings: "quick start", "provider configuration"

Important:
- If the index is not yet built (first run), results may be empty — fall back to read_subtree
- Always verify file content with read_files before editing
- The index is a discovery hint, not a source of truth for file contents

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { query: 'authentication' },
  endsAgentStep,
})}
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { query: 'editor proposal best-of-n', limit: 10 },
  endsAgentStep,
})}
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { query: 'React components layout', fileTypes: ['tsx', 'ts'] },
  endsAgentStep,
})}
`.trim()

export const queryIndexParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.object({
      results: z.array(
        z.object({
          path: z.string(),
          score: z.number(),
          matchedOn: z.array(z.string()),
          symbols: z.array(z.string()).optional(),
          headings: z.array(z.string()).optional(),
        }),
      ),
      totalIndexed: z.number(),
      indexAge: z.number(),
      message: z.string(),
    }),
  ),
} satisfies $ToolParams
