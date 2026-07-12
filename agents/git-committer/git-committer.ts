import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { StepText } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'git-committer',
  publisher,
  displayName: 'Mitt the Git Committer',
  spawnerPrompt:
    'Commits code changes to git with a well-crafted commit message, optionally on a new branch. Spawn when you need to stage and commit related changes with an appropriate message, or to start a feature branch and commit on it.',
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
        branch_name: {
          type: 'string',
          description:
            'If set, create and switch to this branch before committing. The git_branch tool refuses to branch when the working tree is dirty; if the tree is dirty and branch_name was provided, commit the existing changes first on the current branch, then create the new branch (or instruct the caller to set branch_switch with allow_dirty).',
        },
        branch_switch: {
          type: 'boolean',
          default: true,
          description:
            'When true (default), create AND switch to the branch. When false, only create the branch without switching. Ignored if branch_name is not provided.',
        },
        allow_dirty_branch: {
          type: 'boolean',
          default: false,
          description:
            'Explicitly allow creating/switching branches while the worktree is dirty. Defaults to false.',
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
    'git_branch',
  ],
  terminalPermissionProfile: 'git-commit',
  spawnableAgents: [],

  systemPrompt: `You are an expert software developer who creates git commits with clear, well-structured commit messages. You analyze changes thoroughly, stage only related changes, and write concise imperative commit messages that explain why the change was made, not just what changed.`,

  instructionsPrompt: `Instructions:
1. Review the git status before branch creation. If branch_name is provided with a dirty tree, proceed only when allow_dirty_branch was explicitly set; otherwise stop with an actionable error. Branch creation uses the git_branch tool. Then review the diff and recent commit log (already run for you) to understand what changed and the project's commit message style.
2. If the changes span multiple unrelated concerns, stage only the files for one logical commit at a time (git add <files>). If all changes are related, stage them together.
3. Read relevant source files with read_files if the diff does not give enough context to write a good message.
4. Draft a commit message in the imperative mood: "Add feature X", "Fix bug Y", not "Added" or "Adds". Keep the subject line under 72 characters. Add a body paragraph if the why is not obvious from the subject.
5. After staging, inspect the staged diff and run the required safety checks before creating a single commit with: git commit -m "subject" -m "optional body". The runtime blocks commit commands when staged content fails whitespace or secret checks.
6. Return a concise summary: the commit hash, the files committed, and the commit message subject.
Do not push to remote. Do not commit secrets, .env files, or credentials. Do not amend or rebase existing commits. If there are no changes to commit, report that and stop.`.trim(),

  handleSteps: function* ({ params }) {
    const { toolResult: statusResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'git status --short' },
    } as ToolCall<'run_terminal_command'>
    const statusValue = statusResult?.find((part) => part.type === 'json')
      ?.value as Record<string, unknown> | undefined
    const statusText =
      typeof statusValue?.stdout === 'string'
        ? statusValue.stdout.trim()
        : typeof statusValue?.message === 'string'
          ? statusValue.message.trim()
          : ''

    if (
      params?.branch_name &&
      statusText &&
      params.allow_dirty_branch !== true
    ) {
      yield {
        type: 'STEP_TEXT',
        text: 'Refusing to create or switch branches with a dirty worktree. Re-run with allow_dirty_branch: true after confirming the current changes should move to the new branch.',
      } satisfies StepText
      return
    }

    if (params?.branch_name) {
      yield {
        toolName: 'git_branch',
        input: {
          branch_name: params.branch_name,
          switch: params.branch_switch ?? true,
          allow_dirty: params.allow_dirty_branch === true,
        },
      } as ToolCall<'git_branch'>
    }

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

      const { toolResult: safetyResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command:
            "git diff --cached --check && ! git diff --cached --name-only | rg -i '(^|/)(\\.env($|\\.)|id_rsa|id_ed25519|credentials\\.(json|ya?ml)|.*\\.(pem|p12|pfx))$' && ! git diff --cached -U0 | rg -i -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}'",
        },
      } as ToolCall<'run_terminal_command'>
      const safetyValue = safetyResult?.find((part) => part.type === 'json')
        ?.value as Record<string, unknown> | undefined
      if (
        typeof safetyValue?.exitCode === 'number' &&
        safetyValue.exitCode !== 0
      ) {
        yield {
          type: 'STEP_TEXT',
          text: [
            'Commit blocked by staged-diff safety checks. Review whitespace errors, secret-like filenames, or private-key/access-key material before committing.',
            typeof safetyValue.stdout === 'string' && safetyValue.stdout
              ? `stdout: ${safetyValue.stdout}`
              : '',
            typeof safetyValue.stderr === 'string' && safetyValue.stderr
              ? `stderr: ${safetyValue.stderr}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        } satisfies StepText
        return
      }
    }

    // Let the AI read context, stage (if not staged above), and commit.
    yield 'STEP_ALL'
  },
}

export default definition
