import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'find_files_matching_content'
const endsAgentStep = true
const inputSchema = z
  .object({
    pattern: z
      .string()
      .min(1, 'Pattern cannot be empty')
      .describe(
        `Regex pattern (ripgrep syntax) to match file content against.`,
      ),
    flags: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        `Optional safe ripgrep flags as one string or argv tokens. Allowed: -i/--ignore-case, -S/--smart-case, -s/--case-sensitive, -w/--word-regexp, -F/--fixed-strings, -U/--multiline, --multiline-dotall, -g/--glob, -t/--type, -T/--type-not. Examples: "-g *.ts -g *.tsx" or ["-g", "*.ts", "-g", "*.tsx"]. Do not quote the entire expression inside the JSON string.`,
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        `Optional working directory to search within, relative to the project root. Defaults to the project root.`,
      ),
    maxFiles: z
      .number()
      .int()
      .positive()
      .optional()
      .default(100)
      .describe(`Maximum number of unique files to return. Defaults to 100.`),
    groupBySymbol: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        `When true, also return the names of the top-level symbols (functions, classes, methods, exports, constants) that contain each match, plus the per-file match count. Symbol extraction is heuristic and works best for JS/TS/Python/Go/Rust source files; languages without a recognized declaration shape produce an empty symbols list.`,
      ),
    timeoutSeconds: z
      .number()
      .int()
      .positive()
      .max(600)
      .optional()
      .default(15)
      .describe(
        'Maximum seconds to let ripgrep run before returning partial results. Defaults to 15.',
      ),
  })
  .describe(
    `List unique file paths whose content matches a pattern, with optional symbol grouping. Built on top of ripgrep (rg).`,
  )

const description = `
Purpose: Return the unique set of files whose content matches a pattern, without dumping every matching line. Useful when you only want the file list (e.g., to feed into read_files or another tool) instead of the line-oriented output produced by code_search.

Use cases:
1. Determine which files reference a function/class/identifier across the repo.
2. Find every file that imports a specific module.
3. Locate the files that need to change for a refactor before doing per-file reads.
4. Quickly answer "which files contain X?" without scrolling through many match lines.

When to use this vs. code_search:
- Prefer find_files_matching_content when you only need the file list (counts, refactor planning, follow-up reads).
- Prefer code_search when you need to see the matching lines with surrounding context or need advanced ripgrep flags beyond this tool's safe allowlist.

Supported flags:
- Allowed no-value flags: -i/--ignore-case, -S/--smart-case, -s/--case-sensitive, -w/--word-regexp, -F/--fixed-strings, -U/--multiline, --multiline-dotall.
- Allowed value flags: -g/--glob, -t/--type, -T/--type-not.

Symbol grouping (groupBySymbol: true):
- For each matching file, returns the names of the top-level symbols that contain at least one match, plus the total match count.
- Symbol extraction is heuristic, language-agnostic, and conservative: it scans the file for common declaration patterns (function/class/const/let/var/export, def, struct/impl/fn). Matches that fall outside any recognized declaration produce no symbol entry.

Examples:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: { pattern: 'requestClientToolCall' },
  endsAgentStep,
})}
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    pattern: 'from "react"',
    flags: '-F -g *.ts -g *.tsx',
  },
  endsAgentStep,
})}
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    pattern: 'handleCodeSearch',
    cwd: 'packages/agent-runtime/src',
    groupBySymbol: true,
  },
  endsAgentStep,
})}
`.trim()

export const findFilesMatchingContentParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        files: z
          .array(z.string())
          .describe('Unique file paths matching the pattern'),
        count: z.number().describe('Number of unique files matched'),
        truncated: z
          .boolean()
          .optional()
          .describe(
            'True when the result was capped by maxFiles, an internal safety limit, or timeoutSeconds',
          ),
        groups: z
          .array(
            z.object({
              file: z.string(),
              matchCount: z.number(),
              symbols: z.array(z.string()),
            }),
          )
          .optional()
          .describe(
            'Per-file symbol grouping. Present only when groupBySymbol=true.',
          ),
        message: z.string(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
