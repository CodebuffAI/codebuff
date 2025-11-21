import * as fs from 'fs'
import * as path from 'path'
import { createTwoFilesPatch } from 'diff'

import { CodebuffClient, AgentDefinition } from '@codebuff/sdk'
import { getUserCredentials } from '@codebuff/npm-app/credentials'
import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { loadLocalAgents } from '@codebuff/npm-app/agents/load-agents'
import { withTestRepo } from './test-repo-utils'

export const evalPlannerAgent = async (params: {
  client: CodebuffClient
  agentId: string
  agentDefinitions: Array<AgentDefinition>
  spec: string
  repoUrl: string
  parentSha: string
  initCommand?: string
  fileStates: Array<{
    path: string
    preContent: string
    postContent: string
  }>
}) => {
  const {
    client,
    agentId,
    agentDefinitions,
    spec,
    repoUrl,
    parentSha,
    initCommand,
    fileStates,
  } = params
  const plannerStartTime = Date.now()
  const result = await withTestRepo(
    { repoUrl, parentSha, initCommand },
    async (cwd) => {
      // Run the agent with the test repository as cwd
      console.log(`Running agent ${agentId} with prompt: ${spec}...`)
      return await client.run({
        agent: agentId,
        prompt: `Please plan a full implementation of the following spec: ${spec}`,
        cwd,
        agentDefinitions,
        handleEvent: (event) => {
          console.log(agentId, JSON.stringify(event, null, 2))
        },
      })
    },
  )
  const plannerLatencyMs = Date.now() - plannerStartTime

  const { output } = result

  const outputString = JSON.stringify(
    'value' in output ? output.value : output.message,
  )

  // Compute file changes and diffs
  const fileChangesSection = fileStates
    .map(({ path, preContent, postContent }) => {
      return `\n### File: ${path}\n\n<pre_content>\n${preContent}\n</pre_content>\n\n<post_content>\n${postContent}\n</post_content>`
    })
    .join('\n')

  const diffsSection = fileStates
    .map(({ path, preContent, postContent }) => {
      const diff = createTwoFilesPatch(
        path,
        path,
        preContent,
        postContent,
        'before',
        'after',
      )
      return `\n### Diff for ${path}:\n\`\`\`diff\n${diff}\n\`\`\``
    })
    .join('\n')

  // Build the judge prompt
  const judgePrompt = `# Implementation Plan Evaluation

## Task Specification

The agent was given the following spec to create an implementation plan:

<spec>
${spec}
</spec>

## Agent's Implementation Plan

<agent_output>
${outputString}
</agent_output>

## Expected Changes from Actual Commit

### File Changes
<expected_changes>${fileChangesSection}
</expected_changes>

### Expected Diffs
<expected_diffs>${diffsSection}
</expected_diffs>

## Your Task

Evaluate how well the implementation plan matches the real commit changes. Consider:
- Coverage of changes from the commit
- Appropriateness and correctness of proposed code changes
- Whether following the plan would achieve the same (or better) behavior
- Any unnecessary proposed changes
- Simplicity and clarity of the plan
- Efficiency of the plan: reuse existing code, touch as few files as possible
`

  const judgeResult = await client.run({
    agent: 'eval-judge',
    prompt: judgePrompt,
    agentDefinitions: [judgeAgent],
    handleEvent: (event) => {
      console.log('eval-judge', JSON.stringify(event, null, 2))
    },
  })
  if (judgeResult.output.type !== 'structuredOutput') {
    console.log(
      'Error running judge agent -- not structured output',
      JSON.stringify(judgeResult.output, null, 2),
    )
    // throw new Error('Error running judge agent')
    return {
      judgingResults: {
        reasoning: 'Error running judge agent -- not structured output',
        pros: '',
        cons: '',
        overallScore: 0,
      },
      agentOutput: outputString,
      plannerLatencyMs,
    }
  }
  const { output: judgeOutput } = judgeResult
  const judgingResults = (judgeOutput.value ?? {}) as {
    reasoning: string
    pros: string
    cons: string
    overallScore: number
  }

  return { judgingResults, agentOutput: outputString, plannerLatencyMs }
}

const judgeAgent: AgentDefinition = {
  id: 'eval-judge',
  displayName: 'Eval Judge',
  model: 'openai/gpt-5.1',
  toolNames: ['set_output'],
  inputSchema: {
    prompt: { type: 'string', description: 'The prompt to judge' },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      reasoning: { type: 'string' },
      pros: { type: 'string' },
      cons: { type: 'string' },
      overallScore: {
        type: 'number',
        description: 'A score between 0 and 100, where 100 is the best score',
      },
    },
    required: ['reasoning', 'pros', 'cons', 'overallScore'],
  },
  systemPrompt: `You are an expert judge evaluating implementation plans created by AI agents.

## Context

You will receive:
1. A spec describing what changes should be made
2. An implementation plan created by an agent based on that spec
3. The actual file changes and diffs from a real git commit

## Your Role

Grade how well the implementation plan matches the actual implementation. The plan doesn't need to be identical - slight differences are acceptable if the behavior would be equivalent. Sometimes the plan might even propose improvements over the actual commit.

## Evaluation Criteria

- **Coverage**: Does the plan address all key changes from the commit?
- **Correctness**: Are the proposed code changes appropriate and accurate?
- **Behavioral equivalence**: Would following the plan achieve the same outcome?
- **Completeness**: Are any critical changes missing?
- **Efficiency**: Does it avoid unnecessary changes?
- **Simplicity**: Is the plan simple and easy to understand?

You should be harsh if the plan makes superflous changes, fails to reuse existing code, or is otherwise not as simple as it could be.
`,
}

type EvalData = {
  repoUrl: string
  initCommand?: string
  evalCommits: Array<{
    sha: string
    parentSha: string
    spec: string
    fileStates: Array<{
      path: string
      preContent: string
      postContent: string
    }>
  }>
}

async function main() {
  // Load the eval file
  const evalFilePath = path.join(
    __dirname,
    '..',
    'git-evals',
    'eval-codebuff2.json',
  )
  const evalData: EvalData = JSON.parse(fs.readFileSync(evalFilePath, 'utf-8'))

  const { repoUrl, initCommand, evalCommits } = evalData

  const client = new CodebuffClient({
    apiKey: process.env[API_KEY_ENV_VAR] || getUserCredentials()?.authToken,
  })

  const agentsPath = path.join(__dirname, '../../.agents')
  const localAgentDefinitions = Object.values(
    await loadLocalAgents({
      agentsPath,
    }),
  )

  const allResults = [] as Array<{
    sha: string
    spec: string
    agentOutput: string
    judgingResults: {
      reasoning: string
      pros: string
      cons: string
      overallScore: number
    }
    plannerLatencyMs: number
  }>

  // Track statistics
  const stats = {
    total: evalCommits.length,
    completed: 0,
    failed: 0,
    scores: [] as number[],
    plannerLatencies: [] as number[],
  }

  // Loop through each eval task
  for (const evalCommit of evalCommits) {
    const { sha, parentSha, spec, fileStates } = evalCommit

    console.log(`\n=== Running eval for commit ${sha} ===`)
    console.log(`Spec: ${spec.substring(0, 100)}...\n`)

    try {
      const result = await evalPlannerAgent({
        client,
        agentId: 'implementation-planner',
        agentDefinitions: localAgentDefinitions,
        spec,
        repoUrl,
        parentSha,
        initCommand,
        fileStates,
      })

      const { judgingResults, agentOutput, plannerLatencyMs } = result
      allResults.push({
        sha,
        spec,
        agentOutput,
        judgingResults,
        plannerLatencyMs,
      })

      fs.writeFileSync(
        path.join(__dirname, 'eval-planner-results.json'),
        JSON.stringify(allResults, null, 2),
      )

      const { reasoning, pros, cons, overallScore } = judgingResults

      console.log(`\n${'='.repeat(80)}`)
      console.log(`✓ Eval completed for commit ${sha}`)
      console.log(`${'='.repeat(80)}\n`)

      console.log('📊 EVALUATION RESULTS')
      console.log('─'.repeat(80))

      console.log('\n🧠 REASONING:')
      console.log(reasoning)

      console.log('\n✅ PROS:')
      console.log(pros)

      console.log('\n❌ CONS:')
      console.log(cons)

      console.log('\n📈 OVERALL SCORE:')
      const scoreBar = '█'.repeat(Math.floor(overallScore / 10))
      const emptyBar = '░'.repeat(10 - Math.floor(overallScore / 10))
      console.log(`${scoreBar}${emptyBar} ${overallScore}/100`)

      console.log('\n⏱️  LATENCY:')
      console.log(`  ${(plannerLatencyMs / 1000).toFixed(2)}s`)

      console.log('\n' + '='.repeat(80) + '\n')

      stats.completed++
      stats.scores.push(overallScore)
      stats.plannerLatencies.push(plannerLatencyMs)
    } catch (error) {
      console.log(`\n${'='.repeat(80)}`)
      console.error(`✗ Failed eval for commit ${sha}`)
      console.log(`${'='.repeat(80)}\n`)
      console.error('Error details:', error)
      console.log('\n' + '='.repeat(80) + '\n')

      stats.failed++
    }
  }

  // Display summary statistics
  console.log('\n' + '='.repeat(80))
  console.log('📊 SUMMARY STATISTICS')
  console.log('='.repeat(80) + '\n')

  console.log(`Total Evals: ${stats.total}`)
  console.log(
    `Completed: ${stats.completed} (${((stats.completed / stats.total) * 100).toFixed(1)}%)`,
  )
  console.log(
    `Failed: ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)\n`,
  )

  if (stats.scores.length > 0) {
    const avgScore =
      stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
    const minScore = Math.min(...stats.scores)
    const maxScore = Math.max(...stats.scores)
    const medianScore = stats.scores.sort((a, b) => a - b)[
      Math.floor(stats.scores.length / 2)
    ]

    console.log('Score Statistics:')
    console.log(`  Average: ${avgScore.toFixed(1)}/100`)
    console.log(`  Median:  ${medianScore}/100`)
    console.log(`  Min:     ${minScore}/100`)
    console.log(`  Max:     ${maxScore}/100\n`)

    const scoreBar = '█'.repeat(Math.floor(avgScore / 10))
    const emptyBar = '░'.repeat(10 - Math.floor(avgScore / 10))
    console.log(
      `Average Score: ${scoreBar}${emptyBar} ${avgScore.toFixed(1)}/100\n`,
    )
  }

  if (stats.plannerLatencies.length > 0) {
    const avgPlannerLatency =
      stats.plannerLatencies.reduce((a, b) => a + b, 0) /
      stats.plannerLatencies.length
    const minPlannerLatency = Math.min(...stats.plannerLatencies)
    const maxPlannerLatency = Math.max(...stats.plannerLatencies)
    const medianPlannerLatency = stats.plannerLatencies.sort((a, b) => a - b)[
      Math.floor(stats.plannerLatencies.length / 2)
    ]

    console.log('Latency Statistics:')
    console.log(`  Average: ${(avgPlannerLatency / 1000).toFixed(2)}s`)
    console.log(`  Median:  ${(medianPlannerLatency / 1000).toFixed(2)}s`)
    console.log(`  Min:     ${(minPlannerLatency / 1000).toFixed(2)}s`)
    console.log(`  Max:     ${(maxPlannerLatency / 1000).toFixed(2)}s\n`)
  }

  console.log('='.repeat(80))
}

// Run main if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
