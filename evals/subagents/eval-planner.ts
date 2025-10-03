import { execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createTwoFilesPatch } from 'diff'

import { CodebuffClient } from '../../sdk/src/client'
import { AgentDefinition } from '../../sdk/src'
import { getUserCredentials } from '@codebuff/npm-app/credentials'
import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import implementationPlannerAgent from '../../.agents/implementation-planner/implementation-planner'

/**
 * Helper function to manage test repository lifecycle
 * Sets up a test repo, runs a function with the repo cwd, then cleans up
 */
export const withTestRepo = async <T>(
  repoConfig: {
    repoUrl: string
    commitSha: string
    initCommand?: string
  },
  fn: (cwd: string) => Promise<T>,
): Promise<T> => {
  const { repoUrl, commitSha, initCommand } = repoConfig

  // Create a temporary directory for the test repo
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-eval-'))
  const repoDir = path.join(tempDir, 'repo')

  try {
    // Clone the repository
    console.log(`Cloning repository ${repoUrl} to ${repoDir}...`)
    execSync(`git clone ${repoUrl} ${repoDir}`, { stdio: 'ignore' })

    // Checkout the specific commit
    console.log(`Checking out commit ${commitSha}...`)
    execSync(`git checkout ${commitSha}`, { cwd: repoDir, stdio: 'ignore' })

    // Run initialization command if provided
    if (initCommand) {
      console.log(`Running init command: ${initCommand}...`)
      execSync(initCommand, { cwd: repoDir, stdio: 'ignore' })
    }

    // Run the provided function with the repo directory
    return await fn(repoDir)
  } finally {
    // Clean up the temporary directory
    console.log(`Cleaning up temporary directory ${tempDir}...`)
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Failed to clean up temporary directory: ${error}`)
    }
  }
}

export const evalPlannerAgent = async (params: {
  spec: string
  repoUrl: string
  commitSha: string
  initCommand?: string
  fileStates: Array<{
    path: string
    preContent: string
    postContent: string
  }>
}) => {
  const { spec, repoUrl, commitSha, initCommand, fileStates } = params
  const getLocalAuthToken = () => {
    return getUserCredentials()?.authToken
  }
  const client = new CodebuffClient({
    apiKey: process.env[API_KEY_ENV_VAR] || getLocalAuthToken(),
  })

  const result = await withTestRepo(
    { repoUrl, commitSha, initCommand },
    async (cwd) => {
      // Run the agent with the test repository as cwd
      console.log(
        `Running agent ${implementationPlannerAgent.id} with prompt: ${spec}...`,
      )
      return await client.run({
        agent: implementationPlannerAgent.id,
        prompt: `Please plan a full implementation of the following spec: ${spec}`,
        cwd,
        agentDefinitions: [implementationPlannerAgent],
        handleEvent: (event) => {
          console.log('Codebuff Event', JSON.stringify(event, null, 2))
        },
      })
    },
  )

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
- Coverage of key changes from the commit
- Appropriateness and correctness of proposed code changes
- Whether following the plan would achieve the same (or better) behavior
- Any missing critical changes
- Any unnecessary proposed changes`

  const judgeResult = await client.run({
    agent: 'eval-judge',
    prompt: judgePrompt,
    agentDefinitions: [judgeAgent],
  })
  if (judgeResult.output.type !== 'structuredOutput') {
    throw new Error('Error running judge agent')
  }
  const { output: judgeOutput } = judgeResult
  const judgingResults = judgeOutput.value ?? {}

  return { judgingResults, agentOutput: outputString }
}

const judgeAgent: AgentDefinition = {
  id: 'eval-judge',
  displayName: 'Eval Judge',
  model: 'x-ai/grok-4-fast:free',
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
- **Efficiency**: Does it avoid unnecessary changes?`,
}

type EvalData = {
  repoUrl: string
  initCommand?: string
  evalCommits: Array<{
    sha: string
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

  // Loop through each eval task
  for (const evalCommit of evalCommits) {
    const { sha, spec, fileStates } = evalCommit

    console.log(`\n=== Running eval for commit ${sha} ===`)
    console.log(`Spec: ${spec.substring(0, 100)}...\n`)

    try {
      const result = await evalPlannerAgent({
        spec,
        repoUrl,
        commitSha: sha,
        initCommand,
        fileStates,
      })

      const { judgingResults } = result
      const { reasoning, pros, cons, overallScore } = judgingResults

      console.log(`\n${'='.repeat(80)}`)
      console.log(`✓ Eval completed for commit ${sha}`)
      console.log(`${'='.repeat(80)}\n`)

      console.log('📊 EVALUATION RESULTS')
      console.log('─'.repeat(80))

      if (reasoning) {
        console.log('\n🧠 REASONING:')
        console.log(reasoning)
      }

      if (pros) {
        console.log('\n✅ PROS:')
        console.log(pros)
      }

      if (cons) {
        console.log('\n❌ CONS:')
        console.log(cons)
      }

      if (typeof overallScore === 'number') {
        console.log('\n📈 OVERALL SCORE:')
        const scoreBar = '█'.repeat(Math.floor(overallScore / 10))
        const emptyBar = '░'.repeat(10 - Math.floor(overallScore / 10))
        console.log(`${scoreBar}${emptyBar} ${overallScore}/100`)
      }

      console.log('\n' + '='.repeat(80) + '\n')
    } catch (error) {
      console.log(`\n${'='.repeat(80)}`)
      console.error(`✗ Failed eval for commit ${sha}`)
      console.log(`${'='.repeat(80)}\n`)
      console.error('Error details:', error)
      console.log('\n' + '='.repeat(80) + '\n')
    }

    console.log('breaking for now')
    break
  }

  console.log('\n=== All evals completed ===')
}

// Run main if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
