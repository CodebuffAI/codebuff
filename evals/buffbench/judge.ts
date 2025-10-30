import { z } from 'zod/v4'

import type { FileDiff } from './types'
import type { AgentDefinition } from '../../sdk/src'
import type { CodebuffClient } from '../../sdk/src/client'
import { withTimeout } from '@codebuff/common/util/promise'

export const JudgingResultSchema = z.object({
  analysis: z
    .string()
    .describe('Detailed analysis comparing agent changes to ground truth'),
  strengths: z
    .array(z.string())
    .describe('Key strengths of the implementation'),
  weaknesses: z.array(z.string()).describe('Key weaknesses or issues found'),
  completionScore: z
    .number()
    .min(0)
    .max(10)
    .describe('How completely the prompt was addressed'),
  codeQualityScore: z
    .number()
    .min(0)
    .max(10)
    .describe('Code structure and maintainability'),
  overallScore: z.number().min(0).max(10).describe('Combined assessment'),
})

export type JudgingResult = z.infer<typeof JudgingResultSchema>

const judgeAgent: AgentDefinition = {
  id: 'judge',
  displayName: 'Judge',
  model: 'openai/gpt-5',
  toolNames: ['set_output'],
  inputSchema: {
    prompt: { type: 'string', description: 'The evaluation prompt' },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      analysis: {
        type: 'string',
        description:
          'Detailed analysis comparing agent changes to ground truth',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key strengths of the implementation',
      },
      weaknesses: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key weaknesses or issues found',
      },
      completionScore: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'How completely the prompt was addressed',
      },
      codeQualityScore: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'Code structure and maintainability',
      },
      overallScore: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: 'Combined assessment',
      },
    },
    required: [
      'analysis',
      'strengths',
      'weaknesses',
      'completionScore',
      'codeQualityScore',
      'overallScore',
    ],
  },
  systemPrompt: `You are an expert software engineer evaluating AI-generated code changes with empathy for the task given.

## Your Role

You will receive:
1. The user prompt that the coding agent was given
2. Context files from the codebase
3. The ground truth changes (expected outcome)
4. The agent's actual changes

## Evaluation Philosophy

**Judge based on what the agent was asked to do, not on perfection.**

- If the prompt is vague or high-level (e.g., "add authentication"), be lenient and accept any reasonable implementation that achieves the goal
- If the prompt is specific and detailed, expect the implementation to match those details more closely
- Focus on whether the agent understood and addressed the user's intent
- Consider that there are often multiple valid ways to implement the same feature

## Evaluation Criteria

- **Completion** (0-10): How well did the agent address what was asked in the prompt? Consider the specificity of the prompt.
- **Code Quality** (0-10): How well-structured and maintainable is the code?
- **Overall** (0-10): Combined assessment of whether the agent successfully completed the task as requested

## Ground Truth

The ground truth shows ONE valid implementation, but it's not the only correct answer. The agent's implementation should be judged on:
- Does it achieve the same functional outcome?
- Is it a reasonable approach given the prompt?
- Does it maintain code quality?

Provide detailed analysis, strengths, weaknesses, and numerical scores.`,
}

interface JudgeCommitResultInput {
  client: CodebuffClient
  prompt: string
  groundTruthFileDiffs: FileDiff[]
  contextFiles: Record<string, string>
  agentDiff: string
  error?: string
  finalCheckOutputs?: string
}

export async function judgeCommitResult(
  input: JudgeCommitResultInput,
): Promise<JudgingResult> {
  const {
    client,
    prompt,
    groundTruthFileDiffs,
    contextFiles,
    agentDiff,
    error,
    finalCheckOutputs,
  } = input

  const groundTruthDiffs = groundTruthFileDiffs
    .map(({ path, diff }) => {
      return `### ${path}\n\`\`\`diff\n${diff}\n\`\`\``
    })
    .join('\n\n')

  const contextFilesContent = Object.entries(contextFiles)
    .map(([filePath, content]) => {
      return `### ${filePath}\n\`\`\`\n${content}\n\`\`\``
    })
    .join('\n\n')

  const judgePrompt = `## User Prompt (What the agent was asked to do)
${prompt}

## Context Files (from parent commit)
${contextFilesContent || '(No context files)'}

## Ground Truth Changes (One valid implementation)
${groundTruthDiffs}

## Agent's Changes (What the agent actually did)
\`\`\`diff
${agentDiff || '(No changes made)'}
\`\`\`
${error ? `\n## Error Encountered\n${error}` : ''}
${finalCheckOutputs ? `\n## Final Check Command Outputs\n${finalCheckOutputs}` : ''}`

  const agentOutput: string[] = []
  const judgeResult = await withTimeout(
    client.run({
      agent: 'judge',
      prompt: judgePrompt,
      agentDefinitions: [judgeAgent],
      handleEvent: (event) => {
        if (event.type === 'text') {
          agentOutput.push(event.text)
        } else if (event.type === 'tool_call') {
          agentOutput.push(JSON.stringify(event, null, 2))
        } else if (event.type === 'error') {
          console.warn('[Judge] Error event:', event.message)
        }
      },
    }),
    20 * 60 * 1000,
    'Judge agent timed out after 20 minutes',
  )

  if (judgeResult.output.type !== 'structuredOutput') {
    console.error(
      'Error running judge agent - not structured output',
      JSON.stringify(judgeResult.output, null, 2),
    )
    console.error('Judge agent output trace:', agentOutput.join(''))
    return {
      analysis: 'Error running judge agent - not structured output',
      strengths: [],
      weaknesses: ['Judge failed to provide structured output'],
      completionScore: 0,
      codeQualityScore: 0,
      overallScore: 0,
    }
  }

  return judgeResult.output.value as JudgingResult
}
