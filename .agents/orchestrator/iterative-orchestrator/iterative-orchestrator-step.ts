import { publisher } from '../../constants'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'iterative-orchestrator-step',
  publisher,
  model: 'openai/gpt-5',
  displayName: 'Iterative Orchestrator Step',
  spawnerPrompt:
    'Orchestrates the completion of a large task through batches of independent steps.',
  toolNames: ['spawn_agents', 'read_files', 'set_output'],
  spawnableAgents: [
    'file-picker-max',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'researcher-web',
    'researcher-docs',
    'commander',
  ],
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Context bundle including: overall goal, progress summary so far, constraints.',
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      isDone: { type: 'boolean' },
      nextSteps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            prompt: { type: 'string' },
            type: { type: 'string', enum: ['implementation', 'decision'] },
            successCriteria: { type: 'array', items: { type: 'string' } },
            filesToReadHints: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'prompt', 'type'],
        },
      },
      notes: { type: 'string' },
    },
    required: ['isDone', 'nextSteps', 'notes'],
  },
  systemPrompt: `You are an expert orchestrator that orchestrates the completion of a large task. You spawn the batches of independent steps (implementation or decision-making) that can be executed in parallel and iteratively progresses until the task is complete. Give this task your absolute best shot!
  
Important: you *must* make at least one tool call, via <codebuff_tool_call> syntax, in every response message! If you do not, you will be cut off prematurely before the task is complete.`,
  instructionsPrompt: `You decide the next batch of independent steps that can be executed in parallel for a large task.
- Each step should be small, focused, and objectively verifiable.
- Steps can be either:
  1. Implementation steps (coding tasks)
  2. Decision-making steps (e.g., "Decide which authentication framework to use", "How should we architecture this feature?")
- Only return steps that are truly independent and can be done concurrently.
- If only one step is needed next, return a single-item array.
- Mark isDone=true only when the overall task is truly complete.

Return JSON via set_output with:
{
  isDone: boolean,
  nextSteps: [
    {
      title: string,
      prompt: string,           // exact prompt to give to the implementor or decision maker
      type: 'implementation' | 'decision',  // whether this is a coding task or decision
      successCriteria?: string[] // 3-6 bullet checks that show this step is done
      filesToReadHints?: string[] // optional globs/paths hints
    }
  ],
  notes: string             // short rationale for these steps
}
`,
  stepPrompt: `Important: you *must* make at least one tool call, via <codebuff_tool_call> syntax, in every response message!`,
}

export default definition
