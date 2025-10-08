import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'glob'
export const globTool = {
  toolName,
  description: `
Example:
${getToolCallString(toolName, {
  pattern: '**/*.test.ts',
})}

Purpose: Search for files matching a glob pattern to discover files by name patterns rather than content.
Use cases:
- Find all files with a specific extension (e.g., "*.js", "*.test.ts")
- Locate files in specific directories (e.g., "src/**/*.ts")
- Find files with specific naming patterns (e.g., "**/test_*.go", "**/*-config.json")
- Discover test files, configuration files, or other files with predictable naming

Glob patterns support:
- * matches any characters except /
- ** matches any characters including /
- ? matches a single character
- [abc] matches one of the characters in brackets
- {a,b} matches one of the comma-separated patterns

This tool is fast and works well for discovering files by name patterns.
      `.trim(),
} satisfies ToolDescription
