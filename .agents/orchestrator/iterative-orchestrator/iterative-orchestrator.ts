import { publisher } from '../../constants'

import type { ToolCall, AgentState } from '../../types/agent-definition'
import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

type SpawnResult = { agentType: string; value: any }

type StepInfo = {
  title: string
  prompt: string
  type: 'implementation' | 'decision'
  filesToReadHints?: string[]
}

const definition: SecretAgentDefinition = {
  id: 'iterative-orchestrator',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Iterative Orchestrator',
  spawnerPrompt:
    'Orchestrates the completion of a large task through batches of independent steps.',
  outputMode: 'structured_output',
  toolNames: ['spawn_agents', 'set_output'],
  spawnableAgents: ['iterative-orchestrator-step', 'base2-with-files-input'],

  inputSchema: {
    prompt: { type: 'string', description: 'Overall task to complete' },
  },

  handleSteps: function* ({ prompt, params, logger }) {
    const overallGoal = prompt || 'No prompt provided'

    const progress: {
      iteration: number
      steps: StepInfo[]
      plannerNotes: string
    }[] = []
    let completed = false
    let iteration = 0
    const maxIterations = 15

    while (!completed && iteration < maxIterations) {
      const remainingIterations = maxIterations - iteration
      iteration++
      // 1) Plan next step
      const planningBundle = [
        'Overall Goal:',
        overallGoal,
        '',
        'Progress so far:',
        JSON.stringify(progress, null, 2),
      ].join('\n')

      const { toolResult } = yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'iterative-orchestrator-step',
              prompt: planningBundle,
            },
          ],
        },
      } satisfies ToolCall<'spawn_agents'>
      const spawnResults =
        (toolResult ?? [])
          .filter((r) => r.type === 'json')
          .map((r) => r.value as SpawnResult[])[0] ?? []
      const stepOutput = spawnResults.find(
        (r) => r.agentType === 'iterative-orchestrator-step',
      )?.value?.value

      logger.debug({ stepOutput }, 'step output')

      if (!stepOutput) {
        logger.warn('No iterative-orchestrator-step result; aborting early.')
        break
      }
      if (stepOutput.isDone) {
        completed = true
        progress.push({
          iteration,
          steps: [],
          plannerNotes: stepOutput.notes || '',
        })
        break
      }

      const steps: StepInfo[] = stepOutput.nextSteps || []
      if (steps.length === 0) {
        logger.warn(
          'No next steps returned by iterative-orchestrator-step; aborting early.',
        )
        break
      }

      const reminder =
        remainingIterations <= 5
          ? `<reminder>You are approaching the MAXIMUM NUMBER OF ITERATIONS! You have ${remainingIterations} iterations left to complete the task, or at least get it into a working state. You must try to wrap up the task in the remaining iterations or be cut off!</system_remender>`
          : `<reminder>You have ${remainingIterations} steps left to complete the task.</reminder>`

      // 3) Execute all steps in parallel
      const executionAgents = steps.map((step) => {
        if (step.type === 'decision') {
          return {
            agent_type: 'base2-with-files-input',
            prompt: `DECISION TASK: ${step.prompt}\n\nThis is a decision-making step, not an implementation step. Your job is to research options, analyze trade-offs, and make a clear recommendation with rationale. Write out your decision in the last message. Do not create a file with your decision. ${reminder}`,
            params: { filesToRead: step.filesToReadHints || [] },
          }
        } else {
          return {
            agent_type: 'base2-with-files-input',
            prompt: `${step.prompt}\n\n${reminder}`,
            params: { filesToRead: step.filesToReadHints || [] },
          }
        }
      })

      const { toolResult: executionToolResult } = yield {
        toolName: 'spawn_agents',
        input: { agents: executionAgents },
      } satisfies ToolCall<'spawn_agents'>

      const executionResults =
        (executionToolResult ?? [])
          .filter((r) => r.type === 'json')
          .map((r) => r.value as SpawnResult[])[0] ?? []

      logger.debug({ executionResults }, 'execution results')

      // 5) Record progress for all steps
      progress.push({
        iteration,
        steps: steps.map((step, idx: number) => ({
          ...step,
          executionSummary: executionResults[idx]?.value || {},
        })),
        plannerNotes: stepOutput.notes || '',
      })
    }

    // 6) Final output
    yield {
      toolName: 'set_output',
      input: {
        completed,
        iterations: iteration,
        progress,
      },
    } satisfies ToolCall<'set_output'>

    function getSpawnResults(agentState: AgentState): SpawnResult[] {
      const toolMsgs = agentState.messageHistory.filter(
        (m: any) => m.role === 'tool' && m.content?.toolName === 'spawn_agents',
      )
      const flat = toolMsgs.flatMap((m: any) => m.content.output || [])
      return flat
        .filter((o: any) => o?.type === 'json')
        .map((o: any) => o.value)[0] as SpawnResult[]
    }
  },
}

export default definition
