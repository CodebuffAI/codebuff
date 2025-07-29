import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'think_deeply'
export const thinkDeeplyTool = {
  toolName,
  description: `
Use when user request:
- Explicitly asks for deep planning.
- Requires multi-file changes or complex logic.
- Involves significant architecture or potential edge cases.

Avoid for simple changes (e.g., single functions, minor edits).

This tool does not generate a tool result.

Example:
${getToolCallString(toolName, {
  thought: [
    '1. Check current user authentication',
    '2. Refactor auth logic into module',
    '3. Update imports across project',
    '4. Add tests for new module',
  ].join('\n'),
})}
    `.trim(),
} satisfies ToolDescription
