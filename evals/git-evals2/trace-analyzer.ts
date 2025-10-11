import type { AgentStep } from './agent-runner'
import type { JudgingResult } from './judge'
import type { AgentDefinition } from '../../sdk/src'
import type { CodebuffClient } from '../../sdk/src/client'

export interface AgentTraceData {
  agentId: string
  commitSha: string
  spec: string
  trace: AgentStep[]
  diff: string
  judgeResult: JudgingResult
  cost: number
  durationMs: number
  error?: string
  timestamp: string
}

interface AgentComparison {
  overallAnalysis: string
  agentFeedback: Array<{
    agentId: string
    strengths: string[]
    weaknesses: string[]
    relativePerformance: string
  }>
  recommendations: string[]
}

function truncateTrace(trace: AgentStep[]): AgentStep[] {
  return trace.map((step) => ({
    ...step,
    toolResults: step.toolResults.map((result) => {
      // Truncate read_files, run_terminal_command, and code_search results to save tokens
      if (result.toolName === 'read_files' && result.output) {
        const output = Array.isArray(result.output) ? result.output : [result.output]
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
        const output = Array.isArray(result.output) ? result.output : [result.output]
        const truncatedOutput = output.map((item: any) => {
          if (item.type === 'json' && item.value?.stdout) {
            return {
              ...item,
              value: {
                ...item.value,
                stdout: item.value.stdout.length > 500 
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
        const output = Array.isArray(result.output) ? result.output : [result.output]
        const truncatedOutput = output.map((item: any) => {
          if (item.type === 'json' && item.value?.stdout) {
            return {
              ...item,
              value: {
                ...item.value,
                stdout: item.value.stdout.length > 500
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
  model: 'anthropic/claude-3.5-sonnet',
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
            relativePerformance: {
              type: 'string',
              description: 'How this agent performed relative to others',
            },
          },
          required: [
            'agentId',
            'strengths',
            'weaknesses',
            'relativePerformance',
          ],
        },
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Recommendations for improving agents',
      },
    },
    required: ['overallAnalysis', 'agentFeedback', 'recommendations'],
  },
  systemPrompt: `You are an expert AI agent evaluator comparing multiple coding agents on the same task.

## Your Role

You will receive:
1. A task specification
2. Full traces from each agent showing their approach and execution
3. Results including:
   - Judge results (completion score, code quality score, overall score, analysis, strengths, weaknesses)
   - Cost efficiency
   - Time efficiency
   - Whether they produced valid diffs
   - Any errors encountered
   - Number of trace steps taken

## Analysis Criteria

Provide:
- **Overall Analysis**: Compare how agents performed on this task, analyzing their different approaches
- **Agent Feedback**: For each agent, list:
  - Strengths: What this agent did well (specific actions from trace)
  - Weaknesses: What this agent struggled with (specific issues from trace)
  - Relative Performance: How this agent compared to others
- **Recommendations**: Actionable suggestions for improving the agents based on observed behavior

Focus on comparative insights - how agents differ in their approaches, tool usage patterns, efficiency, and results.
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
}): Promise<AgentComparison> {
  const truncatedTraces = traces.map((t) => ({
    agentId: t.agentId,
    trace: truncateTrace(t.trace),
    judgeResult: t.judgeResult,
    cost: t.cost,
    durationMs: t.durationMs,
    error: t.error,
  }))

  const prompt = `## Task Specification
${spec}

## Agent Traces and Results
${JSON.stringify(truncatedTraces, null, 2)}

Please compare these agents and provide:
1. An overall analysis of how the agents performed, including differences in their approaches
2. Specific feedback for each agent including strengths, weaknesses, and how they performed relative to others
3. Recommendations for improving the agents

Focus on:
- Judge results (completion score, code quality score, overall score, analysis, strengths, weaknesses)
- Approach and tool usage patterns from the traces
- Cost efficiency
- Time efficiency
- Whether they produced valid diffs
- Any errors encountered`

  const analyzerResult = await client.run({
    agent: 'git-evals2-trace-analyzer',
    prompt,
    agentDefinitions: [traceAnalyzerAgent],
  })

  if (analyzerResult.output.type !== 'structuredOutput') {
    console.error(
      'Error running trace analyzer - not structured output',
      JSON.stringify(analyzerResult.output, null, 2),
    )
    return {
      overallAnalysis: 'Error running trace analyzer - not structured output',
      agentFeedback: [],
      recommendations: ['Trace analyzer failed to provide structured output'],
    }
  }

  return analyzerResult.output.value as AgentComparison
}
