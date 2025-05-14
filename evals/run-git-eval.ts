import fs from 'fs'
import { z } from 'zod'

import { promptAiSdkStructured } from 'backend/src/llm-apis/vercel-ai-sdk/ai-sdk'
import { claudeModels } from 'common/src/constants'
import { EvalCommit, GitRepoEvalData } from './git-eval-generator/types'
import {
  createFileReadingMock,
  loopMainPrompt,
  resetRepoToCommit,
} from './scaffolding'
import {
  createInitialAgentState,
  setupTestEnvironmentVariables,
} from './test-setup'
import { generateCompactId } from 'common/util/string'
import { recreateShell } from 'npm-app/utils/terminal'
import { setProjectRoot, setWorkingDirectory } from 'npm-app/project-files'
import path from 'path'

// Types for the Sonnet agent's decision making
type AgentDecision = 'continue' | 'complete' | 'halt'

interface AgentInteraction {
  prompt: string
  codebuff_input: string
  codebuff_output: string
  agent_decision: AgentDecision
  agent_reasoning: string
}

interface EvalRunLog {
  eval_commit: EvalCommit
  interactions: AgentInteraction[]
  final_status: AgentDecision
  error?: string
}

interface FullEvalLog {
  repo_path: string
  generation_date: string
  eval_runs: EvalRunLog[]
}

// Schema for Sonnet agent's structured output
const AgentDecisionSchema = z.object({
  decision: z.enum(['continue', 'complete', 'halt']),
  reasoning: z.string(),
  next_prompt: z.string().optional(),
})

async function runSingleEval(
  evalCommit: EvalCommit,
  projectPath: string,
  clientSessionId: string,
  fingerprintId: string
): Promise<EvalRunLog> {
  try {
    // Reset to the commit before the target commit
    resetRepoToCommit(projectPath, `${evalCommit.sha}^`)

    // Initialize agent state
    createFileReadingMock(projectPath)
    let agentState = await createInitialAgentState(projectPath)

    const interactions: AgentInteraction[] = []
    let currentDecision: AgentDecision = 'continue'
    let attempts = 0
    const MAX_ATTEMPTS = 3

    while (currentDecision === 'continue' && attempts < MAX_ATTEMPTS) {
      // Get next prompt from Sonnet agent
      const agentResponse = await promptAiSdkStructured(
        [
          {
            role: 'user', // Changed from 'system' to 'user' to ensure Anthropic API compatibility
            content: `You are an expert software engineer tasked with implementing a specification using CodeBuff, an AI coding assistant. Your goal is to generate prompts for CodeBuff that will help it implement the spec correctly.

Current spec to implement:
${evalCommit.spec}

Previous interactions with CodeBuff:
${interactions
  .map(
    (i, idx) => `
Attempt ${idx + 1}:
Your prompt: ${i.codebuff_input}
CodeBuff output: ${i.codebuff_output}
Your decision: ${i.agent_decision}
Your reasoning: ${i.agent_reasoning}
`
  )
  .join('\n')}

You must decide whether to:
1. 'continue' - Generate another prompt for CodeBuff
2. 'complete' - The implementation is done and satisfies the spec
3. 'halt' - The implementation is unlikely to be completed within ${
              MAX_ATTEMPTS - attempts
            } more attempts

If deciding to continue, include a clear, focused prompt for CodeBuff in next_prompt.
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

      if (agentResponse.decision === 'continue' && !agentResponse.next_prompt) {
        throw new Error('Agent decided to continue but provided no next_prompt')
      }

      // If continuing, run CodeBuff with the agent's prompt
      if (agentResponse.decision === 'continue') {
        // Use loopMainPrompt instead of runMainPrompt + runToolCalls
        const codeBuffResult = await loopMainPrompt({
          agentState,
          prompt: agentResponse.next_prompt!,
          projectPath,
          maxIterations: 20,
        })

        agentState = codeBuffResult.agentState

        // Get the last assistant message as the output of the entire CodeBuff interaction
        const lastAssistantMessage = agentState.messageHistory
          .filter((m) => m.role === 'assistant')
          .pop()
        const codebuffOutputContent = lastAssistantMessage
          ? typeof lastAssistantMessage.content === 'string'
            ? lastAssistantMessage.content
            : JSON.stringify(lastAssistantMessage.content)
          : 'No assistant message found'

        interactions.push({
          prompt: agentResponse.next_prompt!,
          codebuff_input: agentResponse.next_prompt!,
          codebuff_output: codebuffOutputContent,
          agent_decision: agentResponse.decision,
          agent_reasoning: agentResponse.reasoning,
        })
      } else {
        // Record the final decision
        interactions.push({
          prompt: '',
          codebuff_input: '',
          codebuff_output: '',
          agent_decision: agentResponse.decision,
          agent_reasoning: agentResponse.reasoning,
        })
      }

      currentDecision = agentResponse.decision
      attempts++
    }

    return {
      eval_commit: evalCommit,
      interactions,
      final_status: currentDecision,
    }
  } catch (error) {
    return {
      eval_commit: evalCommit,
      interactions: [],
      final_status: 'halt',
      error:
        error instanceof Error ? error.message + error.stack : 'Unknown error',
    }
  }
}

export async function runGitEvals(evalDataPath: string, outputPath: string) {
  const evalData = JSON.parse(
    fs.readFileSync(evalDataPath, 'utf-8')
  ) as GitRepoEvalData

  const { repoPath } = evalData
  const projectPath = path.join(__dirname, repoPath)
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
      evalData.repoPath,
      clientSessionId,
      fingerprintId
    )
    evalRuns.push(evalRun)

    // Write intermediate results
    const fullLog: FullEvalLog = {
      repo_path: evalData.repoPath,
      generation_date: new Date().toISOString(),
      eval_runs: evalRuns,
    }
    fs.writeFileSync(outputPath, JSON.stringify(fullLog, null, 2))
  }

  console.log('All evals complete!')
  console.log(`Results written to ${outputPath}`)
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
