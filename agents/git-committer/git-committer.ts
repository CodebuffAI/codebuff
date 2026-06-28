import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'git-committer',
  publisher,
  displayName: 'Mitt the Git Committer',
  spawnerPrompt:
    'Commits code changes to git with a well-crafted commit message. Spawn when you need to stage and commit related changes with an appropriate message.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What changes to commit. Describe the feature/bugfix/refactor and the scope of changes so the agent can write a good commit message.',
    },
    params: {
      type: 'object',
      properties: {
        stage_all: {
          type: 'boolean',
          description:
            'If true, stage all changes (git add -A) before committing. If false (default), the agent decides which files to stage based on the diff analysis.',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'read_files',
    'read_outline',
    'code_search',
    'run_terminal_command',
    'git_status',
  ],
  spawnableAgents: [],

  systemPrompt: `You are an expert software developer who creates git commits with clear, well-structured commit messages. You analyze changes thoroughly, stage only related changes, and write concise imperative commit messages that explain why the change was made, not just what changed.`,

  instructionsPrompt: `Instructions:
1. Review the git status, diff, and recent commit log (already run for you) to understand what changed and the project's commit message style.
2. If the changes span multiple unrelated concerns, stage only the files for one logical commit at a time (git add <files>). If all changes are related, stage them together.
3. Read relevant source files with read_files if the diff does not give enough context to write a good message.
4. Draft a commit message in the imperative mood: "Add feature X", "Fix bug Y", not "Added" or "Adds". Keep the subject line under 72 characters. Add a body paragraph if the why is not obvious from the subject.
5. Create a single commit with: git commit -m "subject" -m "optional body" -m "🤖 Generated with Openbuff"
6. Return a concise summary: the commit hash, the files committed, and the commit message subject.
Do not push to remote. Do not commit secrets, .env files, or credentials. Do not amend or rebase existing commits. If there are no changes to commit, report that and stop.`.trim(),

  handleSteps: function* ({ params }) {
    // Show the AI the current dirty-tree state, the full diff, and recent
    // commit message style so it can craft a message that fits the project.
    yield {
      toolName: 'run_terminal_command',
      input: { command: 'git status --short' },
    } as ToolCall<'run_terminal_command'>

    yield {
      toolName: 'run_terminal_command',
      input: { command: 'git diff HEAD' },
    } as ToolCall<'run_terminal_command'>

    yield {
      toolName: 'run_terminal_command',
      input: { command: 'git log --oneline -10' },
    } as ToolCall<'run_terminal_command'>

    // Optional: stage all changes upfront if the caller requested it.
    if (params?.stage_all) {
      yield {
        toolName: 'run_terminal_command',
        input: { command: 'git add -A' },
      } as ToolCall<'run_terminal_command'>
    }

    // Let the AI read context, stage (if not staged above), and commit.
    yield 'STEP_ALL'
  },
}

export default definition
