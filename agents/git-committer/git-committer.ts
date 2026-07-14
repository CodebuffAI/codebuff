import { publisher } from '../constants'

import type { ToolCall } from '../types/agent-definition'
import type { StepText } from '../types/agent-definition'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'git-committer',
  publisher,
  displayName: 'Mitt the Git Committer',
  spawnerPrompt:
    'Safely delivers task-owned changes through git: inspect repository/worktree state, stage only related paths, commit with a repository-style message, and optionally push a non-default feature branch when the user explicitly requested it.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What changes to commit. Describe the feature/bugfix/refactor and the scope of changes so the agent can write a good commit message.',
    },
    params: {
      type: 'object',
      properties: {
        owned_paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Exact task-owned paths eligible for staging. Required. The agent must not stage paths outside this allowlist.',
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
        push: {
          type: 'boolean',
          default: false,
          description:
            'Push the resulting current feature branch only when the user explicitly requested a push. Default false.',
        },
        remote: {
          type: 'string',
          default: 'origin',
          description: 'Remote used for fetch/push. Defaults to origin.',
        },
      },
      required: ['owned_paths'],
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

  systemPrompt: `You are a conservative git delivery specialist. You inspect repository, upstream, and worktree state; stage only task-owned changes; create clear commits; and push only when the structured invocation explicitly authorizes it. Shared-repository safety is more important than convenience.`,

  instructionsPrompt: `Instructions:
1. Treat the repository as shared. Inspect branch, upstream, remote/default branch, worktree membership, dirty/staged/untracked files, and in-progress merge/rebase/cherry-pick state before staging. Never alter git config.
2. If branch_name is provided with a dirty tree, proceed only when allow_dirty_branch was explicitly set; otherwise stop. Create it through the git_branch tool. Existing worktrees are valid: report the current worktree and branch, but do not create/remove worktrees in this version.
3. Stage only task-owned paths. owned_paths is required and is a hard allowlist. Never use git add -A, git add ., or broad globs. If a file mixes unrelated user and task changes and safe hunk staging is unavailable, stop and report it rather than claiming ownership.
4. If the changes span unrelated concerns, create only the logical commit requested by the caller and leave the rest untouched.
5. Read relevant source files if the diff is insufficient. Match recent repository commit message style; default to an imperative subject under 72 characters and a body explaining why.
6. Before committing, inspect git diff --cached, run whitespace/secret checks, and verify every staged path is task-owned. Do not amend, rebase, merge, reset, stash, or resolve conflicts.
7. Push only when params.push is true. Fetch the selected remote first. Never force-push or use a refspec. Direct default-branch pushes are denied by this agent; use a feature branch. Refuse when the branch is behind or diverged; report that synchronization requires a separately authorized rebase/merge workflow and fresh validation/review.
8. Return the worktree path, branch, commit hash/message, committed paths, remote synchronization state, and push result.
Do not commit secrets, .env files, credentials, generated artifacts without their source, or unrelated changes. If there are no eligible changes, report that and stop.`.trim(),

  handleSteps: function* ({ params }) {
    const { toolResult: statusResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'git status --short --branch' },
    } as ToolCall<'run_terminal_command'>
    const statusValue = statusResult?.find((part) => part.type === 'json')
      ?.value as Record<string, unknown> | undefined
    const statusText =
      typeof statusValue?.stdout === 'string'
        ? statusValue.stdout.trim()
        : typeof statusValue?.message === 'string'
          ? statusValue.message.trim()
          : ''
    const dirtyStatusLines = statusText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('##'))

    if (
      params?.branch_name &&
      dirtyStatusLines.length > 0 &&
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
      input: { command: 'git rev-parse --show-toplevel' },
    } as ToolCall<'run_terminal_command'>

    yield {
      toolName: 'run_terminal_command',
      input: { command: 'git rev-parse --git-common-dir' },
    } as ToolCall<'run_terminal_command'>

    yield {
      toolName: 'run_terminal_command',
      input: { command: 'git branch --show-current' },
    } as ToolCall<'run_terminal_command'>

    yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}',
      },
    } as ToolCall<'run_terminal_command'>

    yield {
      toolName: 'run_terminal_command',
      input: { command: 'git diff HEAD' },
    } as ToolCall<'run_terminal_command'>

    yield {
      toolName: 'run_terminal_command',
      input: { command: 'git log --oneline -10' },
    } as ToolCall<'run_terminal_command'>

    const ownedPaths = Array.isArray(params?.owned_paths)
      ? params.owned_paths.filter(
          (value: unknown): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : []
    if (ownedPaths.length > 0) {
      yield {
        toolName: 'run_terminal_command',
        input: {
          command: `git add -- ${ownedPaths.map((path: string) => JSON.stringify(path)).join(' ')}`,
        },
      } as ToolCall<'run_terminal_command'>

      const { toolResult: safetyResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command: 'git diff --cached --check',
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
            'Commit blocked by staged-diff whitespace checks.',
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
      yield {
        toolName: 'run_terminal_command',
        input: { command: 'git diff --cached --name-only' },
      } as ToolCall<'run_terminal_command'>
      yield {
        toolName: 'run_terminal_command',
        input: { command: 'git diff --cached -U0' },
      } as ToolCall<'run_terminal_command'>
    }

    // Let the model inspect context, stage only eligible paths when an
    // allowlist was not provided, and create the commit.
    yield 'STEP_ALL'

    if (params?.push === true) {
      const remote =
        typeof params.remote === 'string' &&
        /^[A-Za-z0-9._/-]+$/.test(params.remote)
          ? params.remote
          : 'origin'
      const { toolResult: branchResult } = yield {
        toolName: 'run_terminal_command',
        input: { command: 'git branch --show-current' },
      } as ToolCall<'run_terminal_command'>
      const branchValue = branchResult?.find((part) => part.type === 'json')
        ?.value as Record<string, unknown> | undefined
      const branch =
        typeof branchValue?.stdout === 'string' ? branchValue.stdout.trim() : ''
      if (!branch) {
        yield {
          type: 'STEP_TEXT',
          text: 'Push refused: HEAD is detached or the current branch could not be determined.',
        } satisfies StepText
        return
      }
      yield {
        toolName: 'run_terminal_command',
        input: { command: `git fetch --prune ${remote}` },
      } as ToolCall<'run_terminal_command'>
      const { toolResult: defaultResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command: `git rev-parse --abbrev-ref ${remote}/HEAD`,
        },
      } as ToolCall<'run_terminal_command'>
      const defaultValue = defaultResult?.find((part) => part.type === 'json')
        ?.value as Record<string, unknown> | undefined
      const defaultRef =
        typeof defaultValue?.stdout === 'string'
          ? defaultValue.stdout.trim()
          : ''
      const defaultBranch = defaultRef.split('/').at(-1) ?? ''
      if (branch === defaultBranch) {
        yield {
          type: 'STEP_TEXT',
          text: `Push refused: '${branch}' is the detected default branch. Create and push a feature branch instead.`,
        } satisfies StepText
        return
      }
      const { toolResult: countsResult } = yield {
        toolName: 'run_terminal_command',
        input: {
          command: `git rev-list --left-right --count ${remote}/${branch}...HEAD`,
        },
      } as ToolCall<'run_terminal_command'>
      const countsValue = countsResult?.find((part) => part.type === 'json')
        ?.value as Record<string, unknown> | undefined
      const counts =
        typeof countsValue?.stdout === 'string'
          ? countsValue.stdout.trim().split(/\s+/).map(Number)
          : []
      if (counts.length === 2 && counts[0] > 0) {
        yield {
          type: 'STEP_TEXT',
          text: `Push refused: ${remote}/${branch} is ahead by ${counts[0]} commit(s). Rebase or merge requires separate authorization and must be followed by fresh validation/review.`,
        } satisfies StepText
        return
      }
      yield {
        toolName: 'run_terminal_command',
        input: { command: `git push -u ${remote} ${branch}` },
      } as ToolCall<'run_terminal_command'>
    }
  },
}

export default definition
