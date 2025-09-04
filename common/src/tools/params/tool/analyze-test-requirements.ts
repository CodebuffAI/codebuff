import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'analyze_test_requirements'
const endsAgentStep = false
export const analyzeTestRequirementsParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      changeDescription: z
        .string()
        .min(1, 'Change description cannot be empty')
        .describe('Description of the code change or feature being implemented'),
      affectedFiles: z
        .array(z.string())
        .min(1, 'Must specify at least one affected file')
        .describe('List of files that will be modified'),
      changeType: z
        .enum(['feature', 'bugfix', 'refactor', 'performance', 'breaking'])
        .describe('Type of change being made'),
      testStrategy: z
        .enum(['unit', 'integration', 'e2e', 'all'])
        .optional()
        .default('unit')
        .describe('Preferred testing strategy'),
    })
    .describe(
      'Analyze what tests are needed for a code change and identify existing test patterns.',
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        requirements: z.array(z.object({
          type: z.enum(['unit', 'integration', 'e2e']),
          description: z.string(),
          targetFile: z.string(),
          testFile: z.string(),
          priority: z.enum(['critical', 'high', 'medium', 'low']),
          exists: z.boolean(),
          needsUpdate: z.boolean(),
        })),
        framework: z.object({
          framework: z.enum(['jest', 'vitest', 'mocha', 'playwright', 'cypress', 'unknown']),
          configFiles: z.array(z.string()),
          testPatterns: z.array(z.string()),
          runCommand: z.string(),
          setupFiles: z.array(z.string()),
        }),
        existingPatterns: z.object({
          mockPatterns: z.array(z.string()),
          assertionStyles: z.array(z.string()),
          testStructure: z.string(),
        }),
        recommendations: z.array(z.string()),
        criticalGaps: z.array(z.string()),
        message: z.string(),
      }),
    }),
  ]),
} satisfies $ToolParams
