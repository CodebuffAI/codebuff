import type { CodebuffClient, AgentDefinition } from '@codebuff/sdk'
import { withTimeout } from '@codebuff/common/util/promise'
import { getErrorObject } from '@codebuff/common/util/error'
import fs from 'fs'
import path from 'path'

export interface TaskAnalysisData {
  commitSha: string
  prompt: string
  timestamp: string
  overallAnalysis: string
  agentFeedback: Array<{
    agentId: string
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
  }>
  results: Array<{
    agentId: string
    analysis: string
    strengths: string[]
    weaknesses: string[]
    completionScore: number
    codeQualityScore: number
    overallScore: number
    cost: number
    durationMs: number
    error?: string
  }>
}

export interface MetaAnalysisResult {
  overallComparison: string
  agentInsights: Array<{
    agentId: string
    consistentStrengths: string[]
    consistentWeaknesses: string[]
    performanceSummary: string
    recommendations: string[]
  }>
  keyFindings: string[]
}

const metaAnalyzerAgent: AgentDefinition = {
  id: 'buffbench-meta-analyzer',
  displayName: 'Buffbench Meta Analyzer',
  model: 'openai/gpt-5',
  toolNames: ['set_output'],
  inputSchema: {
    prompt: { type: 'string', description: 'The meta-analysis prompt' },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      overallComparison: {
        type: 'string',
        description: 'High-level comparison of all agents across all tasks',
      },
      agentInsights: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agentId: { type: 'string' },
            consistentStrengths: {
              type: 'array',
              items: { type: 'string' },
              description: 'Patterns of strengths across multiple tasks',
            },
            consistentWeaknesses: {
              type: 'array',
              items: { type: 'string' },
              description: 'Patterns of weaknesses across multiple tasks',
            },
            performanceSummary: {
              type: 'string',
              description:
                'Summary of overall performance including scores, cost, and time',
            },
            recommendations: {
              type: 'array',
              items: { type: 'string' },
              description:
                'High-level recommendations for improving this agent based on patterns observed',
            },
          },
          required: [
            'agentId',
            'consistentStrengths',
            'consistentWeaknesses',
            'performanceSummary',
            'recommendations',
          ],
        },
      },
      keyFindings: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Most important insights from the evaluation that should guide development priorities',
      },
    },
    required: ['overallComparison', 'agentInsights', 'keyFindings'],
  },
  systemPrompt: `You are an expert AI system evaluator analyzing patterns across multiple coding tasks and agents.

## Your Role

You will receive:
1. Complete agent definitions showing their configuration, tools, prompts, and capabilities
2. Agent type definitions explaining the available options and structure
3. Trace analyses from multiple tasks showing how agents approached different problems
4. Judge analyses showing the quality of their implementations
5. Performance metrics (scores, costs, times) across all tasks

## Focus on Patterns and Trends

Your analysis should identify consistent patterns across multiple tasks:

Key Analysis Areas:
- **Agent Design Impact**: How does each agent's configuration (tools, model, prompts) affect their behavior and performance?
- **Consistent Behaviors**: What patterns emerge in how each agent approaches problems?
- **Performance Trends**: Which agents consistently score higher/lower? Why?
- **Cost vs Quality Trade-offs**: How do agents balance thoroughness with efficiency?
- **Reliability**: Which agents are more consistent vs variable in their performance?
- **Comparative Analysis**: What are the key differentiators between agents? How do their configurations lead to different outcomes?
- **Prompt Engineering Effectiveness**: Which agents have better-designed prompts that guide behavior effectively?

## Output Format

Provide:
- **Overall Comparison**: High-level assessment comparing all agents' general approaches and performance
- **Agent Insights**: For each agent:
  - Consistent Strengths: Patterns that work well across multiple tasks
  - Consistent Weaknesses: Recurring issues or limitations
  - Performance Summary: Overall scores, costs, times, and reliability
  - Recommendations: What changes would most improve this agent?
- **Key Findings**: 3-5 most actionable insights that should guide development priorities

Focus on actionable patterns that can inform agent improvements, not individual task details.`,
}

export async function analyzeAllTasks(params: {
  client: CodebuffClient
  logsDir: string
  agents: string[]
  analyzerContext: {
    agentDefinitions: any[]
    agentTypeDefinition: string
    testedAgentIds: string[]
  }
}): Promise<MetaAnalysisResult> {
  const { client, logsDir, agents, analyzerContext } = params

  try {
    // Read all ANALYSIS files from logs directory
    const files = fs.readdirSync(logsDir)
    const analysisFiles = files.filter((f) => f.includes('ANALYSIS'))

    const allTaskAnalyses: TaskAnalysisData[] = []
    for (const file of analysisFiles) {
      const filePath = path.join(logsDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const data: TaskAnalysisData = JSON.parse(content)
      allTaskAnalyses.push(data)
    }

    if (allTaskAnalyses.length === 0) {
      console.warn('No analysis files found in logs directory')
      return {
        overallComparison: 'No analysis data available',
        agentInsights: [],
        keyFindings: [],
      }
    }

    // Create a concise summary for each task (without full agent traces)
    const taskSummaries = allTaskAnalyses.map((task) => ({
      prompt: task.prompt,
      traceAnalysis: {
        overallAnalysis: task.overallAnalysis,
        agentFeedback: task.agentFeedback,
      },
      judgeResults: task.results.map((r) => ({
        agentId: r.agentId,
        overallScore: r.overallScore,
        completionScore: r.completionScore,
        codeQualityScore: r.codeQualityScore,
        cost: r.cost,
        durationMs: r.durationMs,
        strengths: r.strengths,
        weaknesses: r.weaknesses,
        error: r.error,
      })),
    }))

    // Filter agent definitions to only include tested agents
    const filteredAgentDefinitions = analyzerContext.agentDefinitions.filter(
      (def) => analyzerContext.testedAgentIds.includes(def.id),
    )

    const prompt = `## Agent Definitions Being Evaluated

Below are the complete agent definitions for the agents being tested. Use this to understand their configuration, tools, prompts, and overall design.

${JSON.stringify(filteredAgentDefinitions, null, 2)}

## Agent Type Definition Reference

For reference, here is the TypeScript type definition that agents use:

\`\`\`typescript
${analyzerContext.agentTypeDefinition}
\`\`\`

## All Task Analyses

You are analyzing ${allTaskAnalyses.length} tasks evaluated across ${agents.length} agent(s): ${agents.join(', ')}

${JSON.stringify(taskSummaries, null, 2)}

Analyze these results to identify:

1. **Overall Comparison**: How do the agents compare in general? What are the key differentiators?

2. **Per-Agent Patterns**: For each agent, identify:
   - What strengths appear consistently across tasks?
   - What weaknesses or issues recur?
   - How does their performance (scores, cost, time) compare?
   - What patterns emerge in how they approach problems?

3. **Actionable Insights**: What are the 3-5 most important findings that should guide development?
   - Which improvements would have the biggest impact?
   - What trade-offs are agents making?
   - Are there reliability concerns?

Focus on patterns across multiple tasks, not individual task details.`

    const agentOutput: string[] = []
    const analyzerResult = await withTimeout(
      client.run({
        agent: 'buffbench-meta-analyzer',
        prompt,
        agentDefinitions: [metaAnalyzerAgent],
        handleEvent: (event) => {
          if (event.type === 'text') {
            agentOutput.push(event.text)
          } else if (event.type === 'tool_call') {
            agentOutput.push(JSON.stringify(event, null, 2))
          } else if (event.type === 'error') {
            console.warn('[Meta Analyzer] Error event:', event.message)
          }
        },
      }),
      30 * 60 * 1000,
      'Meta analyzer agent timed out after 30 minutes',
    )

    const { output } = analyzerResult

    if (output.type !== 'structuredOutput' || output.value === null) {
      console.error(
        'Error running meta analyzer - not structured output',
        JSON.stringify(output, null, 2),
      )
      console.error('Meta analyzer output trace:', agentOutput.join(''))
      return {
        overallComparison:
          'Error running meta analyzer - not structured output',
        agentInsights: [],
        keyFindings: [],
      }
    }

    return output.value as MetaAnalysisResult
  } catch (error) {
    console.error(`Failed to analyze all tasks:`, getErrorObject(error))
    return {
      overallComparison: `Error running meta analyzer: ${getErrorObject(error).message}`,
      agentInsights: [],
      keyFindings: [],
    }
  }
}
