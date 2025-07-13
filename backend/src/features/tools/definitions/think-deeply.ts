import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'
import { CodebuffToolDef } from '../constants'

export const thinkDeeplyTool = {
  toolName: 'think_deeply',
  endsAgentStep: false,
  parameters: z
    .object({
      thought: z
        .string()
        .min(1, 'Thought cannot be empty')
        .describe(
          `Detailed step-by-step analysis. Initially keep each step concise (max ~5-7 words per step).`
        ),
    })
    .describe(
      `Deeply consider complex tasks by brainstorming approaches and tradeoffs step-by-step.`
    ),
  description: `
Use when user request:
- Explicitly asks for deep planning.
- Requires multi-file changes or complex logic.
- Involves significant architecture or potential edge cases.

Avoid for simple changes (e.g., single functions, minor edits).

This tool does not generate a tool result.

Example:
${getToolCallString('think_deeply', {
  thought: [
    '1. Check current user authentication',
    '2. Refactor auth logic into module',
    '3. Update imports across project',
    '4. Add tests for new module',
  ].join('\n'),
})}
    `.trim(),
} satisfies CodebuffToolDef
