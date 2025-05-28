import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

import { promptAiSdkStructured } from 'backend/src/llm-apis/vercel-ai-sdk/ai-sdk'
import { claudeModels } from 'common/src/constants'
import { generateCompactId } from 'common/util/string'
import { setProjectRoot, setWorkingDirectory } from 'npm-app/project-files'
import { recreateShell } from 'npm-app/utils/terminal'
import { judgeEvalRun } from './judge-git-eval'
import { setupTestRepo, extractRepoNameFromUrl } from './setup-test-repo'
import {
  AgentDecision,
  AgentDecisionSchema,
  CodebuffTrace,
  CommitFileState,
  EvalCommit,
  EvalRunJudged,
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
import { withTimeout } from 'common/util/promise'

async function runSingleEval(
  evalCommit: EvalCommit,
  projectPath: string,
  clientSessionId: string,
  fingerprintId: string
): Promise<EvalRunJudged> {
  const startTime = new Date()
  const trace: CodebuffTrace[] = []
  let error: string | undefined

  // Add process-level error handlers for this eval
  const originalUncaughtHandler = process.listeners('uncaughtException')
  const originalUnhandledHandler = process.listeners('unhandledRejection')

  let processError: string | undefined

  const uncaughtHandler = (err: Error) => {
    console.error('Uncaught exception during eval:', err)
    processError = `Uncaught exception: ${err.message}\n${err.stack}`
  }

  const unhandledHandler = (reason: any, promise: Promise<any>) => {
    console.error('Unhandled rejection during eval:', reason)
    processError = `Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`
  }

  process.on('uncaughtException', uncaughtHandler)
  process.on('unhandledRejection', unhandledHandler)

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
      // Check for process-level errors
      if (processError) {
        throw new Error(processError)
      }

      const renderedTrace = trace
        .map(
          ({ prompt, steps }) =>
            `You: ${prompt}\n\nCodebuff:${steps.map(({ response, toolCalls, toolResults }) => `${response}\n\nTool calls: ${JSON.stringify(toolCalls)}\n\nTool results: ${JSON.stringify(toolResults)}`).join('\n\n')}`
        )
        .join('\n\n')

      // Get next prompt from Sonnet agent with timeout
      let agentResponse: any
      try {
        agentResponse = await promptAiSdkStructured(
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
            timeout: 5 * 60_000, // 5 minute timeout
          }
        )
      } catch (agentError) {
        throw new Error(
          `Agent decision failed: ${agentError instanceof Error ? agentError.message : String(agentError)}`
        )
      }

      console.log('Agent decision:', agentResponse.decision)
      console.log('Agent reasoning:', agentResponse.reasoning)

      if (agentResponse.decision === 'continue' && !agentResponse.next_prompt) {
        throw new Error('Agent decided to continue but provided no next_prompt')
      }

      // If continuing, run CodeBuff with the agent's prompt
      if (agentResponse.decision === 'continue') {
        const prompt = agentResponse.next_prompt!

        // Use loopMainPrompt with timeout wrapper
        const codeBuffResult = await withTimeout(
          loopMainPrompt({
            agentState,
            prompt,
            projectPath,
            maxIterations: 20,
            options: {
              costMode: 'normal',
            },
          }),
          // Timeout after 30 minutes
          60_000 * 30
        )

        agentState = codeBuffResult.agentState
        trace.push({ prompt, steps: codeBuffResult.steps })
      }

      currentDecision = agentResponse.decision
      attempts++
    }
  } catch (e) {
    console.error('Error in runSingleEval:', e)
    error =
      e instanceof Error
        ? `${e.message}\n${e.stack}`
        : `Unknown error: ${String(e)}`
  } finally {
    // Clean up process-level error handlers
    process.removeListener('uncaughtException', uncaughtHandler)
    process.removeListener('unhandledRejection', unhandledHandler)

    // Restore original handlers
    originalUncaughtHandler.forEach((handler) => {
      if (typeof handler === 'function') {
        process.on('uncaughtException', handler)
      }
    })
    originalUnhandledHandler.forEach((handler) => {
      if (typeof handler === 'function') {
        process.on('unhandledRejection', handler)
      }
    })
  }

  // If we caught a process-level error, use that
  if (processError && !error) {
    error = processError
  }

  const endTime = new Date()
  const durationMs = endTime.getTime() - startTime.getTime()

  const fileStates = getCodebuffFileStates(trace, evalCommit.sha, projectPath)

  const evalRun: EvalRunLog = {
    eval_commit: evalCommit,
    trace,
    error,
    fileStates,
    durationMs,
  }

  // Add judging results even for failed runs
  try {
    const judgingResults = await judgeEvalRun(evalRun)
    console.log('Judging results:', judgingResults)
    return {
      ...evalRun,
      judging_results: judgingResults,
    }
  } catch (judgingError) {
    console.error('Error in judging:', judgingError)
    // Return without judging results if judging fails
    return {
      ...evalRun,
      judging_results: {
        analysis: 'Judging failed due to error',
        strengths: [],
        weaknesses: ['Judging process encountered an error'],
        metrics: {
          completionScore: 0,
          efficiencyScore: 0,
          codeQualityScore: 0,
          overallScore: 0,
        },
      },
    }
  }
}

function getCodebuffFileStates(
  trace: CodebuffTrace[],
  evalCommitSha: string,
  projectPath: string
): CommitFileState[] {
  const codebuffWrittenFilePaths = new Set<string>()
  if (trace) {
    // trace might be undefined or empty if error occurred very early
    for (const traceEntry of trace) {
      for (const step of traceEntry.steps) {
        if (step.toolCalls) {
          for (const toolCall of step.toolCalls) {
            if (toolCall.name === 'write_file' && toolCall.parameters.path) {
              codebuffWrittenFilePaths.add(toolCall.parameters.path as string)
            }
          }
        }
      }
    }
  }

  const fileStates: CommitFileState[] = []

  if (codebuffWrittenFilePaths.size > 0) {
    for (const filePath of codebuffWrittenFilePaths) {
      // Capture "after" state
      const fullPath = path.join(projectPath, filePath)
      let postContent: string
      try {
        postContent = fs.existsSync(fullPath)
          ? fs.readFileSync(fullPath, 'utf-8')
          : '[FILE_NOT_FOUND_POST_RUN]'
      } catch (e) {
        console.error(`Error reading file ${fullPath} for after state:`, e)
        postContent = '[ERROR_READING_AFTER_STATE]'
      }

      // Capture "before" state
      let preContent: string
      try {
        preContent = execSync(`git show ${evalCommitSha}^:"${filePath}"`, {
          cwd: projectPath,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).toString()
      } catch (e) {
        preContent = '[FILE_DID_NOT_EXIST_PRIOR_TO_CODEBUFF_CHANGES]'
      }

      fileStates.push({ path: filePath, preContent, postContent })
    }
  }
  return fileStates
}

export async function runGitEvals(
  evalDataPath: string,
  outputPath: string
): Promise<FullEvalLog> {
  const evalData = JSON.parse(
    fs.readFileSync(evalDataPath, 'utf-8')
  ) as GitRepoEvalData

  const { repoUrl } = evalData
  
  // Extract repo name from URL or use provided testRepoName as fallback
  const testRepoName = evalData.testRepoName || extractRepoNameFromUrl(repoUrl)
  
  // Setup the test repository using the generic function
  console.log(`Setting up test repository from: ${repoUrl}`)
  const actualRepoName = await setupTestRepo(repoUrl, testRepoName)
  
  const projectPath = path.join(__dirname, '../test-repos', actualRepoName)
  setupTestEnvironmentVariables()
  createFileReadingMock(projectPath)
  recreateShell(projectPath, true)
  setProjectRoot(projectPath)
  setWorkingDirectory(projectPath)

  const clientSessionId = generateCompactId()
  const fingerprintId = generateCompactId()

  // Generate unique trace ID for this run
  const traceId = generateCompactId()
  console.log(`Starting eval run with trace ID: ${traceId}`)

  // Create partial filename with trace ID (single file that gets overwritten)
  const outputDir = path.dirname(outputPath)
  const outputBasename = path.basename(outputPath, path.extname(outputPath))
  const outputExt = path.extname(outputPath)
  const partialOutputPath = path.join(
    outputDir,
    `${outputBasename}-${traceId}-partial${outputExt}`
  )

  let completedCount = 0
  const evalRuns: EvalRunJudged[] = []

  console.log(
    `Running ${evalData.evalCommits.length} evaluations sequentially...`
  )

  // Run evaluations sequentially
  for (let index = 0; index < evalData.evalCommits.length; index++) {
    const evalCommit = evalData.evalCommits[index]

    console.log(
      `Starting eval ${index + 1}/${evalData.evalCommits.length} for commit ${evalCommit.message}...`
    )

    const evalRun = await runSingleEval(
      evalCommit,
      projectPath,
      clientSessionId,
      fingerprintId
    )

    completedCount++
    console.log(
      `Completed eval ${index + 1}/${evalData.evalCommits.length} for commit ${evalCommit.message} (${completedCount}/${evalData.evalCommits.length} total)`
    )

    evalRuns.push(evalRun)

    // Save partial results after each completion
    const partialResult: FullEvalLog = {
      test_repo_name: actualRepoName,
      generation_date: new Date().toISOString(),
      eval_runs: [...evalRuns],
      overall_metrics: calculateOverallMetrics(evalRuns),
    }

    fs.writeFileSync(partialOutputPath, JSON.stringify(partialResult, null, 2))
    console.log(
      `Partial results saved to ${partialOutputPath} (${completedCount}/${evalData.evalCommits.length} complete)`
    )
  }

  // Calculate final overall metrics
  const overallMetrics = calculateOverallMetrics(evalRuns)

  const result: FullEvalLog = {
    test_repo_name: actualRepoName,
    generation_date: new Date().toISOString(),
    eval_runs: evalRuns,
    overall_metrics: overallMetrics,
  }

  // Create final filename with trace ID
  const finalOutputPath = path.join(
    outputDir,
    `${outputBasename}-${traceId}${outputExt}`
  )

  // Write final results to file
  fs.writeFileSync(finalOutputPath, JSON.stringify(result, null, 2))

  console.log('All evals complete!')
  console.log(`Final results written to ${finalOutputPath}`)

  return result
}

function calculateOverallMetrics(evalRuns: EvalRunJudged[]) {
  return {
    average_completion:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.completionScore || 0),
        0
      ) / evalRuns.length,
    average_efficiency:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.efficiencyScore || 0),
        0
      ) / evalRuns.length,
    average_code_quality:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.codeQualityScore || 0),
        0
      ) / evalRuns.length,
    average_overall:
      evalRuns.reduce(
        (sum, run) => sum + (run.judging_results.metrics.overallScore || 0),
        0
      ) / evalRuns.length,
    average_duration_ms:
      evalRuns.reduce((sum, run) => sum + run.durationMs, 0) / evalRuns.length,
    total_runs: evalRuns.length,
    successful_runs: evalRuns.filter((run) => !run.error).length,
    failed_runs: evalRuns.filter((run) => run.error).length,
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)
  console.info('Usage: bun run run-git-eval [eval-data-path] [output-path]')

  const evalDataPath = args[0] || 'git-evals/git-evals.json'
  const outputPath = args[1] || 'git-evals/eval-trace.json'

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
