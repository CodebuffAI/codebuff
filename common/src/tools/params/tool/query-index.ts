import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'query_index'
const endsAgentStep = true

const inputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .default('')
      .describe(
        `Natural language query or keyword terms describing the files you are looking for. Optional for graph modes when from/to paths are provided. For example: "authentication", "database migrations", "editor proposal logic", "React components".`,
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
    mode: z
      .enum(['search', 'neighbors', 'path', 'explain', 'commands', 'references'])
      .optional()
      .default('search')
      .describe(
        'Query mode. search returns ranked files, explain includes ranking rationale, neighbors returns adjacent graph files, path returns a graph path between files, commands prioritizes package scripts, CI workflows, task runners, and validation docs, and references returns files that import or call into a seed file (blast-radius analysis before editing an exported symbol).',
      ),
    from: z
      .string()
      .optional()
      .describe(
        'Optional source file path for neighbors, path, and references modes.',
      ),
    to: z
      .string()
      .optional()
      .describe('Optional target file path for path mode.'),
  })
  .superRefine((input, ctx) => {
    const mode = input.mode ?? 'search'
    if ((mode === 'search' || mode === 'explain') && input.query.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['query'],
        message: 'query is required for search and explain modes',
      })
    }
    if (mode === 'neighbors' && !input.from && input.query.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'from or query is required for neighbors mode',
      })
    }
    if (mode === 'path' && (!input.from || !input.to) && input.query.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['query'],
        message: 'query or both from/to paths are required for path mode',
      })
    }
    if (mode === 'references' && !input.from && input.query.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'from or query is required for references mode',
      })
    }
  })
  .describe(
    `Query the local codebase graph index to find relevant files ranked by symbol names, imports, headings, paths, doc concepts, and graph relationships. The index is built automatically on startup.`,
  )

const description = `
Purpose: Query the local codebase graph index to find relevant files ranked by their relevance to your query. Use this as your first step when looking for files related to a concept, feature, or module.

The index tracks:
- File paths and extensions
- Exported/defined symbol names (functions, classes, types, constants)
- Import paths and dependencies
- Markdown headings and doc concepts (for .md/.mdx files)
- Package scripts, CI workflow commands, task-runner files, and command/config concepts
- Graph edges between files, symbols, imports, calls, headings, and concepts

Query tips:
- Use descriptive natural language: "user authentication", "database connection", "react hooks"
- Use camelCase or PascalCase terms to find symbols: "createUser", "AuthProvider"
- Combine concept + type: "editor agent typescript", "test utilities"
- For docs: use topic keywords that would appear in headings: "quick start", "provider configuration"
- For project commands or validation suites, use mode: "commands" or queries like "run validation suite" to prioritize package.json, CI, and testing docs

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
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { query: 'broader validation suite', mode: 'commands' },
  endsAgentStep,
})}
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { mode: 'references', from: 'src/auth.ts', limit: 15 },
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
          matchedSnippets: z.array(z.string()).optional(),
          matchedSnippetsOmittedForLength: z.literal(true).optional(),
          relatedFiles: z
            .array(
              z.object({
                path: z.string(),
                score: z.number(),
                reason: z.string(),
                via: z.string().optional(),
              }),
            )
            .optional(),
          relatedFilesOmittedForLength: z.literal(true).optional(),
          explanation: z.string().optional(),
        }),
      ),
      totalIndexed: z.number(),
      indexAge: z.number(),
      message: z.string(),
    }),
  ),
} satisfies $ToolParams
