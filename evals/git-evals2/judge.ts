import { createTwoFilesPatch } from 'diff'
import { z } from 'zod/v4'

import type { FileState } from './types'
import type { AgentDefinition } from '../../sdk/src'
import type { CodebuffClient } from '../../sdk/src/client'

export const JudgingResultSchema = z.object({
  analysis: z
    .string()
    .describe('Detailed analysis comparing agent changes to ground truth'),
  strengths: z.array(z.string()).describe('Key strengths of the implementation'),
  weaknesses: z
    .array(z.string())
    .describe('Key weaknesses or issues found'),
  completionScore: z
    .number()
    .min(0)
    .max(10)
    .describe('How completely the spec was implemented'),
  codeQualityScore: z
    .number()
    .min(0)
    .max(10)
    .describe('Code structure and maintainability'),
  overallScore: z.number().min(0).max(10).describe('Combined assessment'),
})

export type JudgingResult = z.infer<typeof JudgingResultSchema>

const judgeAgent: AgentDefinition = {
  id: 'git-evals2-judge',
  displayName: 'Git Evals2 Judge',
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
        description: 'Detailed analysis comparing agent changes to ground truth',
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
        description: 'How completely the spec was implemented',
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
  systemPrompt: `You are an expert software engineer evaluating AI-generated code changes.

## Your Role

You will receive:
1. A spec describing what changes should be made
2. The ground truth changes (expected)
3. The agent's actual changes

## Evaluation Criteria

- **Completion** (0-10): How completely was the spec implemented?
- **Code Quality** (0-10): How well-structured and maintainable is the code?
- **Overall** (0-10): Combined quality assessment

Focus on behavioral equivalence - the implementation doesn't need to be identical to ground truth, but should achieve the same outcome. Valid alternative approaches are acceptable.

Provide detailed analysis, strengths, weaknesses, and numerical scores.`,
}

interface JudgeCommitResultInput {
  client: CodebuffClient
  spec: string
  groundTruthFileStates: FileState[]
  agentDiff: string
  error?: string
}

export async function judgeCommitResult(
  input: JudgeCommitResultInput,
): Promise<JudgingResult> {
  const { client, spec, groundTruthFileStates, agentDiff, error } = input

  const groundTruthDiffs = groundTruthFileStates
    .map(({ path, preContent, postContent }) => {
      const diff = createTwoFilesPatch(
        path,
        path,
        preContent,
        postContent,
        'before',
        'after',
      )
      return `### ${path}\n\`\`\`diff\n${diff}\n\`\`\``
    })
    .join('\n\n')

  const judgePrompt = `## Task Specification
${spec}

## Ground Truth Changes (Expected)
${groundTruthDiffs}

## Agent's Changes (Actual)
\`\`\`diff
${agentDiff || '(No changes made)'}
\`\`\`
${error ? `\n## Error Encountered\n${error}` : ''}`

  const judgeResult = await client.run({
    agent: 'git-evals2-judge',
    prompt: judgePrompt,
    agentDefinitions: [judgeAgent],
  })

  if (judgeResult.output.type !== 'structuredOutput') {
    console.error(
      'Error running judge agent - not structured output',
      JSON.stringify(judgeResult.output, null, 2),
    )
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
