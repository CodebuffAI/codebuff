import type { AgentStep } from './agent-runner'
import type { JudgingResult } from './judge'
import type { AgentDefinition } from '../../sdk/src'
import type { CodebuffClient } from '../../sdk/src/client'

export interface AgentTraceData {
  agentId: string
  commitSha: string
  prompt: string
  trace: AgentStep[]
  diff: string
  judgeResult: JudgingResult
  cost: number
  durationMs: number
  error?: string
  timestamp: string
}

function truncateTrace(trace: AgentStep[]): AgentStep[] {
  return trace.map((step) => ({
    ...step,
    toolResults: step.toolResults.map((result) => {
      // Truncate read_files, run_terminal_command, and code_search results to save tokens
      if (result.toolName === 'read_files' && result.output) {
        const output = Array.isArray(result.output)
          ? result.output
          : [result.output]
        const truncatedOutput = output.map((item: any) => {
          if (item.type === 'json' && Array.isArray(item.value)) {
            // Truncate file contents in read_files results
            return {
              ...item,
              value: item.value.map((file: any) => {
                if (file.path && file.content) {
                  return {
                    path: file.path,
                    content: '[TRUNCATED - file was read]',
                    referencedBy: file.referencedBy,
                  }
                }
                return file
              }),
            }
          }
          return item
        })
        return {
          ...result,
          output: truncatedOutput,
        }
      }

      // Truncate run_terminal_command results (keep first 500 chars)
      if (result.toolName === 'run_terminal_command' && result.output) {
        const output = Array.isArray(result.output)
          ? result.output
          : [result.output]
        const truncatedOutput = output.map((item: any) => {
          if (item.type === 'json' && item.value?.stdout) {
            return {
              ...item,
              value: {
                ...item.value,
                stdout:
                  item.value.stdout.length > 500
                    ? item.value.stdout.slice(0, 500) + '... [TRUNCATED]'
                    : item.value.stdout,
              },
            }
          }
          return item
        })
        return {
          ...result,
          output: truncatedOutput,
        }
      }

      // Truncate code_search results (keep first 500 chars)
      if (result.toolName === 'code_search' && result.output) {
        const output = Array.isArray(result.output)
          ? result.output
          : [result.output]
        const truncatedOutput = output.map((item: any) => {
          if (item.type === 'json' && item.value?.stdout) {
            return {
              ...item,
              value: {
                ...item.value,
                stdout:
                  item.value.stdout.length > 500
                    ? item.value.stdout.slice(0, 500) + '... [TRUNCATED]'
                    : item.value.stdout,
              },
            }
          }
          return item
        })
        return {
          ...result,
          output: truncatedOutput,
        }
      }

      return result
    }),
  }))
}

const traceAnalyzerAgent: AgentDefinition = {
  id: 'git-evals2-trace-analyzer',
  displayName: 'Git Evals2 Trace Analyzer',
  model: 'openai/gpt-5',
  toolNames: ['set_output'],
  inputSchema: {
    prompt: { type: 'string', description: 'The analysis prompt' },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      overallAnalysis: {
        type: 'string',
        description: 'Overall comparison of all agents',
      },
      agentFeedback: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agentId: { type: 'string' },
            strengths: {
              type: 'array',
              items: { type: 'string' },
            },
            weaknesses: {
              type: 'array',
              items: { type: 'string' },
            },
            recommendations: {
              type: 'array',
              items: { type: 'string' },
              description: 'Recommendations for improving this agent and it\'s process. Note: do not include recommendations for improving the code in this task',
            },
          },
          required: ['agentId', 'strengths', 'weaknesses', 'recommendations'],
        },
      },
    },
    required: ['overallAnalysis', 'agentFeedback'],
  },
  systemPrompt: `You are an expert AI agent evaluator analyzing how different coding agents approach problems and make decisions.

## Your Role

You will receive:
1. A task specification (for context only)
2. Full traces from each agent showing their step-by-step process
3. Performance metrics (scores, cost, time, errors)

## Focus on Agent Processes

Your analysis should focus on how agents work, not what they accomplished:

Key Analysis Areas:
- Problem-Solving Approach: How did each agent break down and approach the problem?
- Tool Usage Patterns: Which tools did they use, in what sequence, and why?
- Decision-Making Strategy: What information did they gather before acting? How did they validate assumptions?
- Workflow Efficiency: Did they follow a systematic process or jump around? Were steps logically ordered?
- Context Gathering: How thoroughly did they explore the codebase before making changes?
- Iterative Refinement: Did they test, verify, or refine their work? How?

## Output Format

Provide:
- Overall Analysis: Compare agent workflows, highlighting different process strategies
- Agent Feedback: For each agent:
  - Strengths: Process steps that worked well (e.g., thoroughly explored codebase before editing)
  - Weaknesses: Process gaps or inefficiencies (e.g., made changes without reading related files)
  - Relative Performance: How this agent's process compared to others
- Recommendations: Generalizable improvements to agent workflows and decision-making processes

Important: Focus on the agent's process and methodology, not on the object-level content of the code changes. We want to understand how to improve the agent's approach to any problem.

Note: read_files tool results show [TRUNCATED] for file contents to save space.`,
}

export async function analyzeAgentTraces({
  client,
  traces,
  spec,
}: {
  client: CodebuffClient
  traces: AgentTraceData[]
  spec: string
}): Promise<{
  overallAnalysis: string
  agentFeedback: Array<{
    agentId: string
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
  }>
}> {
  const truncatedTraces = traces.map((t) => ({
    agentId: t.agentId,
    trace: truncateTrace(t.trace),
    judgeResult: t.judgeResult,
    cost: t.cost,
    durationMs: t.durationMs,
    error: t.error,
  }))

  const prompt = `## Task Specification (for context)
${spec}

## Agent Traces and Results
${JSON.stringify(truncatedTraces, null, 2)}

Analyze how these agents approached the problem, focusing on their processes and workflows rather than the specific task:

1. Overall Process Comparison: How did agents differ in their problem-solving approach?
   - What was their overall strategy/workflow?
   - How did they sequence their actions?
   - What patterns emerged in how they gathered context vs. taking action?

2. Per-Agent Process Analysis: For each agent, identify:
   - Process strengths: What systematic steps or decisions worked well?
   - Process weaknesses: Where did their workflow have gaps or inefficiencies?
   - Key differences: How did this agent's process differ from others?

3. Generalizable Recommendations: Suggest improvements to agent workflows that would help on any task:
   - Better context-gathering strategies
   - More effective tool usage patterns
   - Improved decision-making processes
   - Workflow optimizations

Focus on the HOW, not the WHAT: We want to understand and improve how agents work, not evaluate their specific code output.`

  const agentOutput: string[] = []
  const analyzerResult = await client.run({
    agent: 'git-evals2-trace-analyzer',
    prompt,
    agentDefinitions: [traceAnalyzerAgent],
    handleEvent: (event) => {
      if (event.type === 'text') {
        agentOutput.push(event.text)
      } else if (event.type === 'tool_call') {
        agentOutput.push(JSON.stringify(event, null, 2))
      } else if (event.type === 'error') {
        console.warn('[Trace Analyzer] Error event:', event.message)
      }
    },
  })

  const { output } = analyzerResult

  if (output.type !== 'structuredOutput' || output.value === null) {
    console.error(
      'Error running trace analyzer - not structured output',
      JSON.stringify(output, null, 2),
    )
    console.error('Trace analyzer output trace:', agentOutput.join(''))
    return {
      overallAnalysis: 'Error running trace analyzer - not structured output',
      agentFeedback: [],
    }
  }

  return output.value as any
}
