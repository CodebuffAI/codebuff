import fs from 'fs'
import path from 'path'

import { getErrorObject } from '@codebuff/common/util/error'
import { withTimeout } from '@codebuff/common/util/promise'

import { parseProposals, type Proposal } from './proposals'
import { truncateTrace } from './trace-utils'

import type { AgentStep } from './agent-runner'
import type { JudgingResult } from './judge'
import type { FileDiff } from './types'
import type { AgentDefinition, OpenbuffClient } from '@openbuff/sdk'

export interface Lesson {
  whatWentWrong: string
  whatShouldHaveBeenDone: string
}

type ExtractAgentLessonsInput = {
  client: OpenbuffClient
  localAgentDefinitions: any[]
  prompt: string
  groundTruthFileDiffs: FileDiff[]
  contextFiles: Record<string, string>
  agentDiff: string
  agentTrace: AgentStep[]
  judgeResult?: JudgingResult
  error?: string
}

const lessonsExtractorAgent: AgentDefinition = {
  id: 'buffbench-lessons-extractor',
  displayName: 'Buffbench Lessons Extractor',
  model: 'openai/gpt-5',
  toolNames: ['spawn_agents', 'read_files', 'set_output'],
  spawnableAgents: ['file-picker', 'find-all-referencer'],
  inputSchema: {
    prompt: { type: 'string', description: 'Lessons extraction prompt' },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      lessons: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            whatWentWrong: { type: 'string' },
            whatShouldHaveBeenDone: { type: 'string' },
          },
          required: ['whatWentWrong', 'whatShouldHaveBeenDone'],
        },
        description:
          'Lessons learned from this task. Each lesson should identify what went wrong and what should have been done instead.',
      },
      proposals: {
        type: 'array',
        description:
          'Structured, machine-applicable config-change proposals derived from the lessons. Each proposal targets a specific agent and describes one mechanical change. Only emit proposals that are directly supported by the lessons — do not speculate. Use kind "append_system_prompt_guidance" for behavioral guidance, "add_tool"/"remove_tool" for tool access, "set_model" for model changes, "set_budget" for cost/token caps. Leave the array empty if no safe, well-supported proposal exists.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: [
                'append_system_prompt_guidance',
                'add_tool',
                'remove_tool',
                'set_model',
                'set_budget',
              ],
              description: 'The proposal kind.',
            },
            target: {
              type: 'object',
              properties: {
                agentId: { type: 'string' },
              },
              required: ['agentId'],
              description: 'The agent id to modify (must match an id in the provided agent definitions).',
            },
            guidance: {
              type: 'string',
              description: 'For append_system_prompt_guidance: the guidance text to append.',
            },
            toolName: {
              type: 'string',
              description: 'For add_tool/remove_tool: the tool name.',
            },
            model: {
              type: 'string',
              description: 'For set_model: the new model id.',
            },
            maxCostCents: {
              type: ['integer', 'null'],
              description: 'For set_budget: per-run cost cap in US cents, or null to leave unchanged.',
            },
            maxTokensPerTurn: {
              type: ['integer', 'null'],
              description: 'For set_budget: per-turn token cap, or null to leave unchanged.',
            },
            rationale: {
              type: 'string',
              description: 'Why this proposal is being made (references the lesson it addresses).',
            },
          },
          required: ['kind', 'target', 'rationale'],
        },
      },
    },
    required: ['lessons'],
  },
  systemPrompt: `You are a Lesson Extractor. Your job: analyze agent performance and extract actionable lessons AND structured, machine-applicable config-change proposals.

Context you receive:
- User prompt (what the coding agent was asked)
- Context files from parent commit (relevant code/config from the repo)
- Ground truth diffs (one valid solution path)
- The agent's diffs (what they actually changed)
- A truncated agent trace showing HOW they worked (tools, order, decisions)
- Optional judge summary (scores, weaknesses)

Use tools to gather more context if needed.

You must output TWO things:

## 1. Lessons (array)
Each lesson has two parts:

1. **whatWentWrong**: What the agent did incorrectly, misunderstood, or failed to do on this task
   - Be specific about the mistake or gap in understanding
   - Reference specific files, functions, or patterns when relevant
   - Focus on concrete, observable issues

2. **whatShouldHaveBeenDone**: The correct approach the agent should have taken
   - Provide actionable guidance that would have led to a better result
   - Be specific and prescriptive
   - Make it something the agent could apply in the future

## 2. Proposals (array)
Structured, machine-applicable config-change proposals derived from the lessons. Each proposal targets a specific agent (by id) and describes ONE mechanical change. Only emit proposals that are DIRECTLY supported by the lessons — do not speculate.

Supported proposal kinds:
- "append_system_prompt_guidance": append guidance text to the target agent's systemPrompt (target, guidance, rationale)
- "add_tool": add a tool to the target agent's toolNames (target, toolName, rationale)
- "remove_tool": remove a tool from the target agent's toolNames (target, toolName, rationale)
- "set_model": change the target agent's model (target, model, rationale)
- "set_budget": set maxCostCents and/or maxTokensPerTurn on the target agent (target, maxCostCents, maxTokensPerTurn, rationale — use null for the field you don't want to change)

Proposal rules:
- The target.agentId MUST match an id in the provided agent definitions.
- Each proposal must include a rationale referencing the lesson it addresses.
- Prefer "append_system_prompt_guidance" for behavioral corrections — it is the safest kind.
- Only propose "set_model" or "set_budget" when there is clear evidence the model/budget was the problem.
- Leave the proposals array empty if no safe, well-supported proposal exists. Do not pad with low-confidence proposals.

Rules (lessons):
- Each lesson should be a complete learning unit (problem + solution)
- Keep lessons terse but precise (aim for ~140 chars per field if possible)
- Do not include things the agent already did correctly
- Focus on gaps that, if filled, would have improved the outcome
- Don't include repeat lessons or ones that are similar to each other`,
}

export async function extractAgentLessons(
  input: ExtractAgentLessonsInput,
): Promise<{
  lessons: Lesson[]
  proposals: Proposal[]
}> {
  try {
    const {
      client,
      localAgentDefinitions,
      prompt,
      groundTruthFileDiffs,
      contextFiles,
      agentDiff,
      agentTrace,
      judgeResult,
      error,
    } = input

    const groundTruthDiffs = groundTruthFileDiffs
      .map(({ path, diff }) => `### ${path}\n\`\`\`diff\n${diff}\n\`\`\``)
      .join('\n\n')

    const contextFilesContent = Object.entries(contextFiles)
      .map(
        ([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``,
      )
      .join('\n\n')

    const truncated = truncateTrace(agentTrace)
    const truncatedTraceJson = JSON.stringify(truncated, null, 2)

    const judgeSummary = judgeResult
      ? `Overall: ${judgeResult.overallScore}/10, Completion: ${judgeResult.completionScore}/10, Code Quality: ${judgeResult.codeQualityScore}/10
Weaknesses: ${judgeResult.weaknesses?.join(' | ') || '(none)'}`
      : '(no judge summary)'

    const lessonsPrompt = `## User Prompt
${prompt}

## Context Files (from parent commit)
${contextFilesContent || '(No context files)'}

## Ground Truth Changes (One valid implementation)
${groundTruthDiffs || '(No ground truth diffs)'}

## Agent's Changes
\`\`\`diff
${agentDiff || '(No changes made)'}
\`\`\`

## Agent Trace (truncated)
\`\`\`json
${truncatedTraceJson}
\`\`\`

## Judge Summary
${judgeSummary}
${error ? `\n## Agent Error\n${error}\n` : ''}

Task: Analyze what went wrong and what should have been done. For each mistake or gap, provide a lesson with both parts: whatWentWrong and whatShouldHaveBeenDone. Output the lessons array as specified. Additionally, emit structured proposals for any lesson that maps to a safe, mechanical config change (append system-prompt guidance, add/remove tool, set model, set budget). Leave the proposals array empty if no safe proposal exists.`

    const agentOutput: string[] = []
    const result = await withTimeout(
      client.run({
        agent: 'buffbench-lessons-extractor',
        prompt: lessonsPrompt,
        agentDefinitions: [lessonsExtractorAgent, ...localAgentDefinitions],
        handleEvent: (event) => {
          if (event.type === 'text') agentOutput.push(event.text)
          else if (event.type === 'tool_call')
            agentOutput.push(JSON.stringify(event))
        },
      }),
      20 * 60 * 1000,
      'Lessons extractor timed out after 20 minutes',
    )

    if (result.output.type !== 'structuredOutput' || !result.output.value) {
      console.warn(
        'Lessons extractor did not return structured output:\n',
        JSON.stringify(result.output, null, 2),
      )
      return { lessons: [], proposals: [] }
    }

    console.log('Agent output:', agentOutput.join('\n'))

    const { lessons, proposals: rawProposals } = result.output.value as {
      lessons: Lesson[]
      proposals?: unknown
    }
    const parsed = parseProposals(rawProposals)
    if (!parsed.valid) {
      console.warn(
        `Lessons extractor emitted ${rawProposals ? 'invalid' : 'no'} proposals; skipping proposals:`,
        parsed.errors.join('; '),
      )
    }
    return { lessons, proposals: parsed.proposals }
  } catch (error) {
    console.error('Failed to extract agent lessons:', getErrorObject(error))
    return { lessons: [], proposals: [] }
  }
}

export function saveAgentLessons(params: {
  agentId: string
  commitId: string
  commitSha: string
  prompt: string
  lessons: Lesson[]
  lessonsDir: string
}): void {
  const { agentId, commitId, commitSha, prompt, lessons, lessonsDir } = params

  try {
    const safeAgentId = agentId.replace(/[^a-zA-Z0-9-]/g, '_')
    if (!fs.existsSync(lessonsDir)) {
      fs.mkdirSync(lessonsDir, { recursive: true })
    }
    const lessonsFile = path.join(lessonsDir, `${safeAgentId}.md`)

    if (!fs.existsSync(lessonsFile)) {
      fs.writeFileSync(
        lessonsFile,
        `# Agent Lessons: ${agentId}\n\nLessons accumulated across buffbench runs. Each lesson identifies what went wrong and what should have been done instead.\n\n`,
        'utf-8',
      )
    }

    if (lessons.length > 0) {
      const header = `## ${new Date().toISOString()} — ${commitId} (${commitSha.slice(0, 7)})\n`
      let content = `\n### Original Agent Prompt\n${prompt}\n`

      content += '\n### Lessons\n'
      content += lessons
        .map((lesson) => {
          return `- **What went wrong:** ${lesson.whatWentWrong}\n  **What should have been done:** ${lesson.whatShouldHaveBeenDone}`
        })
        .join('\n\n')
      content += '\n'

      fs.appendFileSync(lessonsFile, `${header}${content}\n`, 'utf-8')
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e))
    console.warn(
      `Failed to append agent lessons for ${agentId}:`,
      error.message,
    )
  }
}
