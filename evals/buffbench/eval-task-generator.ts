import { CodebuffClient, type AgentDefinition } from '@codebuff/sdk'
import fileExplorerDef from '../../.agents/file-explorer/file-explorer'
import findAllReferencerDef from '../../.agents/file-explorer/find-all-referencer'
import { PLACEHOLDER } from '../../.agents/types/secret-agent-definition'

const evalTaskGeneratorAgentDef: AgentDefinition = {
  id: 'eval-task-generator',
  displayName: 'Eval Task Generator',
  model: 'openai/gpt-5',
  toolNames: ['spawn_agents', 'read_files', 'set_output'],
  spawnableAgents: ['file-explorer', 'find-all-referencer'],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Instructions to generate the task spec and prompt',
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description:
          'Short 2-3 word hyphenated task identifier (e.g., "fix-auth-bug", "add-user-profile", "refactor-login-flow")',
      },
      reasoning: {
        type: 'string',
        description: 'Your thoughts about the task, spec, and prompt',
      },
      spec: {
        type: 'string',
        description:
          'Clear specification describing WHAT needs to be implemented (observable behavior/structure, not HOW)',
      },
      prompt: {
        type: 'string',
        description: 'High-level user prompt describing what needs to be done',
      },
      supplementalFiles: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of supplemental file paths',
      },
    },
    required: ['id', 'reasoning', 'spec', 'prompt', 'supplementalFiles'],
  },
  systemPrompt: `You are an expert at analyzing git commits and generating evaluation tasks for AI coding assistants.

You will receive:
- A git diff showing the changes made
- The list of files that were edited
- An optional commit message
- The repository directory where you can explore the codebase

You must generate both a specification (spec) and a user prompt for the task.

${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Your task:
1. Analyze the git diff to understand what changed
2. Spawn the file-explorer and find-all-referencer to explore the codebase and understand context.
3. Read as many files relevant to the changes as possible.
4. Generate the output, including:
- a short, descriptive task ID (2-3 hyphenated words like "fix-auth-bug" or "refactor-login-flow")
- a clear specification describing exactly what needs to be implemented
- a high-level user prompt that describes what needs to be done leaving out details that should be reconstructed by the agent
- supplemental files that would help a judge understand the change (exclude directly edited files)

Key principles for the task ID:
- 2-3 words maximum, hyphenated (e.g., "fix-memory-leak", "add-user-profile", "refactor-auth-flow")
- Descriptive but concise
- Use action verbs when appropriate (fix, add, remove, refactor, update, implement)
- Lowercase with hyphens

Key principles for the spec:
- Prescribe exactly how to make the change with references to the files that need to be changed
- Not include code
- Focus on the observable behavior or structure that needs to be implemented
- Be clear enough that a skilled developer or AI could implement it from scratch
- Be phrased as what needs to be done, not what was already done
- Cover all the changes shown across multiple files

Key principles for the prompt:
- Focus on the high-level functional requirements, not implementation details
- Use natural language: "add user authentication" not "implement authenticateUser function"
- Omit details that should be reconstructed by the agent
- Be clear enough that a skilled developer could implement from scratch
- Consider the commit message as a hint but don't just copy it
`,
}

export async function generateEvalTask({
  client,
  input,
  agentDefinitions,
}: {
  client: CodebuffClient
  input: {
    commitSha: string
    parentSha: string
    diff: string
    editedFilePaths: string[]
    commitMessage?: string
    repoPath: string
  }
  agentDefinitions?: any[]
}): Promise<{
  id: string
  reasoning: string
  spec: string
  prompt: string
  supplementalFiles: string[]
}> {
  const { diff, editedFilePaths, commitMessage, repoPath } = input

  const allAgentDefinitions = [
    evalTaskGeneratorAgentDef,
    fileExplorerDef,
    findAllReferencerDef,
    ...(agentDefinitions || []),
  ]

  const generatorResult = await client.run({
    agent: 'eval-task-generator',
    prompt:
      'Generate a task specification and user prompt based on the git diff and codebase exploration',
    params: {
      diff,
      editedFilePaths,
      commitMessage,
    },
    cwd: repoPath,
    agentDefinitions: allAgentDefinitions,
    handleEvent: (event) => {
      if (event.type === 'subagent_start') {
        console.log(`[Agent] Starting: ${event.displayName}`)
      } else if (event.type === 'tool_call') {
        console.log(`[Tool] ${event.toolName}`)
      } else if (event.type === 'text') {
        console.log(`[Text] ${event.text}...`)
      }
    },
  })

  if (
    generatorResult.output.type !== 'structuredOutput' ||
    !generatorResult.output.value
  ) {
    throw new Error('Failed to generate structured task output')
  }

  return generatorResult.output.value as {
    id: string
    reasoning: string
    spec: string
    prompt: string
    supplementalFiles: string[]
  }
}
