import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'create_task_checklist'
const endsAgentStep = false
export const createTaskChecklistParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      userRequest: z
        .string()
        .min(1, 'User request cannot be empty')
        .describe('The complete user request to analyze and break down'),
      projectContext: z
        .object({
          hasTests: z.boolean().describe('Whether the project has existing tests'),
          hasSchema: z.boolean().describe('Whether the project has schema files'),
          hasMigrations: z.boolean().describe('Whether the project uses database migrations'),
          hasChangelog: z.boolean().describe('Whether the project maintains a changelog'),
          framework: z.string().optional().describe('Main framework (React, Vue, etc.)'),
          buildTool: z.string().optional().describe('Build tool (webpack, vite, etc.)'),
        })
        .describe('Context about the project structure and requirements'),
      complexity: z
        .enum(['simple', 'moderate', 'complex'])
        .describe('Complexity level of the request'),
    })
    .describe(
      'Break down a user request into a comprehensive checklist of all requirements that must be completed.',
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        checklist: z.object({
          id: z.string(),
          userRequest: z.string(),
          createdAt: z.string(),
          items: z.array(z.object({
            id: z.string(),
            title: z.string(),
            description: z.string(),
            category: z.enum(['implementation', 'testing', 'documentation', 'validation', 'cleanup']),
            priority: z.enum(['critical', 'high', 'medium', 'low']),
            estimatedComplexity: z.enum(['simple', 'moderate', 'complex']),
            dependencies: z.array(z.string()),
            completed: z.boolean(),
            notes: z.string().optional(),
          })),
          totalItems: z.number(),
          completedItems: z.number(),
          progress: z.number(),
        }).nullable(),
        message: z.string(),
      }),
    }),
  ]),
} satisfies $ToolParams
