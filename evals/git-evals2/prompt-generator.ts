import { CodebuffClient } from '../../sdk/src/client'
import type { AgentDefinition } from '../../sdk/src'
import fileExplorerDef from '../../.agents/file-explorer/file-explorer'
import findAllReferencerDef from '../../.agents/file-explorer/find-all-referencer'
import { PLACEHOLDER } from '../../.agents/types/secret-agent-definition'

const promptGeneratorAgentDef: AgentDefinition = {
  id: 'git-evals2-prompt-generator',
  displayName: 'Git Evals2 Prompt Generator',
  model: 'openai/gpt-5',
  toolNames: ['spawn_agents', 'read_files', 'set_output'],
  spawnableAgents: ['file-explorer', 'find-all-referencer'],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Instructions to generate the prompt',
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
        description: 'Your thoughts about what should be in the prompt',
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
      confidence: {
        type: 'number',
        description: 'Confidence score 0-1 in the quality of the prompt',
      },
    },
    required: ['id', 'prompt', 'supplementalFiles', 'reasoning', 'confidence'],
  },
  systemPrompt: `You are an expert at analyzing git commits and generating high-level user prompts.

You will receive:
- A git diff showing the changes made
- The list of files that were edited
- An optional commit message
- The repository directory where you can explore the codebase

${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Your task:
1. Analyze the git diff to understand what changed
2. Use your tools (read_files, spawn_agents) to explore the codebase and understand context
3. Generate a short, descriptive task ID (2-3 hyphenated words like "fix-auth-bug" or "refactor-login-flow")
4. Identify supplemental files that would help a judge understand the change (exclude directly edited files)
5. Generate a high-level user prompt that describes WHAT needs to be done (not HOW)

Key principles for the task ID:
- 2-3 words maximum, hyphenated (e.g., "fix-memory-leak", "add-user-profile", "refactor-auth-flow")
- Descriptive but concise
- Use action verbs when appropriate (fix, add, remove, refactor, update, implement)
- Lowercase with hyphens

Key principles for the prompt:
- Focus on the functional requirement, not implementation details
- Use natural language: "add user authentication" not "implement authenticateUser function"
- Omit details that should be reconstructed by the agent
- Be clear enough that a skilled developer could implement from scratch
- Consider the commit message as a hint but don't just copy it
`,
}

export async function generatePromptFromCommit({
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
  prompt: string
  supplementalFiles: string[]
  confidence: number
  reasoning: string
}> {
  const { diff, editedFilePaths, commitMessage, repoPath } = input

  const allAgentDefinitions = [
    promptGeneratorAgentDef,
    fileExplorerDef,
    findAllReferencerDef,
    ...(agentDefinitions || []),
  ]

  const generatorResult = await client.run({
    agent: 'git-evals2-prompt-generator',
    prompt:
      'Generate a high-level user prompt based on the git diff and codebase exploration',
    params: {
      diff,
      editedFilePaths,
      commitMessage,
    },
    cwd: repoPath,
    agentDefinitions: allAgentDefinitions,
  })

  if (
    generatorResult.output.type !== 'structuredOutput' ||
    !generatorResult.output.value
  ) {
    throw new Error('Failed to generate structured prompt output')
  }

  return generatorResult.output.value as {
    id: string
    prompt: string
    supplementalFiles: string[]
    reasoning: string
    confidence: number
  }
}
