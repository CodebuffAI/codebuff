import fs from 'fs'
import path from 'path'

import { promptAiSdkStructured } from 'backend/src/llm-apis/vercel-ai-sdk/ai-sdk'
import { claudeModels } from 'common/src/constants'
import { generateCompactId } from 'common/util/string'
import { setProjectRoot, setWorkingDirectory } from 'npm-app/project-files'
import { recreateShell } from 'npm-app/utils/terminal'
import { judgeEvalRun } from './judge-git-eval'
import {
  AgentDecision,
  AgentDecisionSchema,
  CodebuffTrace,
  EvalCommit,
  EvalRunLog,
  FullEvalLog,
  GitRepoEvalData,
} from './types'
import {
  createFileReadingMock,
  loopMainPrompt,
  resetRepoToCommit,
} from '../scaffolding'
import {
  createInitialAgentState,
  setupTestEnvironmentVariables,
} from '../test-setup'

async function runSingleEval(
  evalCommit: EvalCommit,
  projectPath: string,
  clientSessionId: string,
  fingerprintId: string
): Promise<EvalRunLog> {
  const trace: CodebuffTrace[] = []
  let error: string | undefined
  try {
    // Reset to the commit before the target commit
    resetRepoToCommit(projectPath, `${evalCommit.sha}^`)

    // Initialize agent state
    createFileReadingMock(projectPath)
    let agentState = await createInitialAgentState(projectPath)

    let currentDecision: AgentDecision = 'continue'
    let attempts = 0
    const MAX_ATTEMPTS = 5

    while (currentDecision === 'continue' && attempts < MAX_ATTEMPTS) {
      const renderedTrace = trace
        .map(
          ({ prompt, steps }) =>
            `You: ${prompt}\n\nCodebuff:${steps.map(({ response, toolCalls, toolResults }) => `${response}\n\nTool calls: ${JSON.stringify(toolCalls)}\n\nTool results: ${JSON.stringify(toolResults)}`).join('\n\n')}`
        )
        .join('\n\n')
      // Get next prompt from Sonnet agent
      const agentResponse = await promptAiSdkStructured(
        [
          {
            role: 'user',
            content: `You are an expert software engineer tasked with implementing a specification using CodeBuff, an AI coding assistant. Your goal is to prompt CodeBuff to implement the spec correctly. You are in a conversation with this coding agent.

Current spec to implement:
<spec>${evalCommit.spec}</spec>

Your conversation with Codebuff so far:
<conversation>${renderedTrace}</conversation>

You must decide whether to:
1. 'continue' - Generate a follow-up prompt for Codebuff
2. 'complete' - The implementation is done and satisfies the spec
3. 'halt' - The implementation is off track and unlikely to be completed within ${MAX_ATTEMPTS - attempts} more attempts

If deciding to continue, include a clear, focused prompt for Codebuff in next_prompt.
Explain your reasoning in detail.`,
          },
        ],
        {
          schema: AgentDecisionSchema,
          model: claudeModels.sonnet,
          clientSessionId,
          fingerprintId,
          userInputId: generateCompactId(),
          userId: undefined,
        }
      )

      console.log('Agent decision:', agentResponse.decision)
      console.log('Agent reasoning:', agentResponse.reasoning)

      if (agentResponse.decision === 'continue' && !agentResponse.next_prompt) {
        throw new Error('Agent decided to continue but provided no next_prompt')
      }

      // If continuing, run CodeBuff with the agent's prompt
      if (agentResponse.decision === 'continue') {
        const prompt = agentResponse.next_prompt!
        // Use loopMainPrompt instead of runMainPrompt + runToolCalls
        const codeBuffResult = await loopMainPrompt({
          agentState,
          prompt,
          projectPath,
          maxIterations: 20,
        })

        agentState = codeBuffResult.agentState
        trace.push({ prompt, steps: codeBuffResult.steps })
      }

      currentDecision = agentResponse.decision
      attempts++
    }
  } catch (e) {
    error = e instanceof Error ? e.message + e.stack : 'Unknown error'
  }

  const evalRun = {
    eval_commit: evalCommit,
    trace,
    error,
  }

  // Add judging results even for failed runs
  const judgingResults = await judgeEvalRun(evalRun)
  return {
    ...evalRun,
    judging_results: judgingResults,
  }
}

export async function runGitEvals(
  evalDataPath: string,
  outputPath: string
): Promise<FullEvalLog> {
  const evalData = JSON.parse(
    fs.readFileSync(evalDataPath, 'utf-8')
  ) as GitRepoEvalData

  const { testRepoName } = evalData
  const projectPath = path.join(__dirname, '../test-repos', testRepoName)
  setupTestEnvironmentVariables()
  createFileReadingMock(projectPath)
  recreateShell(projectPath, true)
  setProjectRoot(projectPath)
  setWorkingDirectory(projectPath)

  const clientSessionId = generateCompactId()
  const fingerprintId = generateCompactId()

  const evalRuns: EvalRunLog[] = []
  for (const evalCommit of evalData.evalCommits) {
    console.log(`Running eval for commit ${evalCommit.sha}...`)
    const evalRun = await runSingleEval(
      evalCommit,
      projectPath,
      clientSessionId,
      fingerprintId
    )
    evalRuns.push(evalRun)
  }

  // Calculate overall metrics
  const overallMetrics = {
    average_completion:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results?.metrics.completionScore || 0),
        0
      ) / evalRuns.length,
    average_efficiency:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results?.metrics.efficiencyScore || 0),
        0
      ) / evalRuns.length,
    average_code_quality:
      evalRuns.reduce(
        (sum, run) =>
          sum + (run.judging_results?.metrics.codeQualityScore || 0),
        0
      ) / evalRuns.length,
    average_overall:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results?.metrics.overallScore || 0),
        0
      ) / evalRuns.length,
    total_runs: evalRuns.length,
    successful_runs: evalRuns.filter((run) => !run.error).length,
    failed_runs: evalRuns.filter((run) => run.error).length,
  }

  const result: FullEvalLog = {
    test_repo_name: testRepoName,
    generation_date: new Date().toISOString(),
    eval_runs: evalRuns,
    overall_metrics: overallMetrics,
  }

  // Write results to file
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))

  console.log('All evals complete!')
  console.log(`Results written to ${outputPath}`)

  return result
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error('Usage: bun run run-git-eval <eval-data-path> [output-path]')
    process.exit(1)
  }

  const evalDataPath = args[0]
  const outputPath = args[1] || 'eval-trace.json'

  runGitEvals(evalDataPath, outputPath)
    .then(() => {
      console.log('Done!')
      process.exit(0)
    })
    .catch((err) => {
      console.error('Error running evals:', err)
      process.exit(1)
    })
}
