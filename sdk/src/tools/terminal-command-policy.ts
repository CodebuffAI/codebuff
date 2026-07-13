import path from 'node:path'

export type TerminalPermissionProfile =
  | 'read-only'
  | 'librarian-read-only'
  | 'git-commit'
  | 'dependency-mutation'
  | 'tmux-test'
  | 'workspace-write'
  | 'full-access'

export type TerminalPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

const READ_ONLY_COMMANDS = [
  /^(?:pwd|ls|dir|find|fd|rg|grep|sed|head|tail|cat|stat|wc|tree|which|where|type)\b/i,
  /^git\s+(?:status|diff|log|show|rev-parse|ls-files|branch\s+--show-current)\b/i,
  /^(?:bun|npm|pnpm|yarn)\s+(?:test|run\s+(?:test|typecheck|lint|check|build)|x\s+tsc\s+--noEmit)\b/i,
  /^(?:cargo\s+(?:test|check|clippy)|go\s+test|pytest|python\s+-m\s+pytest|make\s+(?:test|check|lint))\b/i,
  /^(?:tsc|eslint|prettier)\b/i,
]

const WORKSPACE_DENY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:sudo|su)\b/i, 'privilege escalation is not allowed'],
  [
    /\bgit\s+(?:push|commit|rebase|reset|clean|tag|am|cherry-pick)\b/i,
    'git history or remote mutation requires an explicit full-access workflow',
  ],
  [
    /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|publish|link)\b/i,
    'dependency or package mutation requires explicit approval',
  ],
  [
    /\b(?:pip|pip3|uv)\s+(?:install|uninstall|sync)\b/i,
    'environment or dependency mutation requires explicit approval',
  ],
  [
    /\b(?:apt|apt-get|dnf|yum|pacman|brew|choco|winget)\b/i,
    'system package management is not allowed',
  ],
  [
    /\b(?:curl|wget|ssh|scp|sftp|ftp|telnet|nc|ncat)\b/i,
    'arbitrary network commands require explicit approval',
  ],
  [
    /\b(?:kubectl|helm|terraform|tofu|ansible|aws|gcloud|az|flyctl|vercel|heroku)\b/i,
    'infrastructure or production commands require explicit approval',
  ],
  [
    /\b(?:docker|podman)\s+(?:push|login|run|compose\s+up|system\s+prune)\b/i,
    'container side effects require explicit approval',
  ],
  [
    /\bgh\s+(?:api|pr|release|repo|workflow)\b/i,
    'remote GitHub mutation requires explicit approval',
  ],
  [/\brm\s+-[^\n]*r[^\n]*\s+\/(?:\s|$)/i, 'root deletion is forbidden'],
]

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

function findTraversalPath(command: string): string | undefined {
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  for (const rawToken of tokens) {
    const token = rawToken.replace(/^["']|["',);]+$/g, '')
    if (token.split(/[=\\/]+/).includes('..')) return rawToken
  }
  return undefined
}

function findReadOnlyMutation(command: string): string | undefined {
  if (/[<>]/.test(command)) return 'shell redirection is not read-only'
  if (
    /^find\b[\s\S]*(?:-delete\b|-exec(?:dir)?\b|-ok(?:dir)?\b|-fprint(?:f)?\b)/i.test(
      command,
    )
  ) {
    return 'find mutation and command-execution actions are not read-only'
  }
  if (
    /^sed\b[\s\S]*(?:--in-place(?:=|\s|$)|(?:^|\s)-i(?:\s|$|[^\s]))/i.test(
      command,
    )
  ) {
    return 'in-place sed edits are not read-only'
  }
  if (/^sed\b[\s\S]*(?:["']|[;\s])(?:w|W|e)\s+/.test(command)) {
    return 'sed write and execute commands are not read-only'
  }
  return undefined
}

function findOutsideAbsolutePath(
  command: string,
  projectRoot: string,
): string | undefined {
  const root = path.resolve(projectRoot)
  const tokens = [
    ...command.matchAll(
      /(?:^|[\s"'=(])((?:[A-Za-z]:\\|\/(?!\/))[^\s"'|;&)]*)/g,
    ),
  ].map((match) => match[1])
  for (const rawToken of tokens) {
    const token = rawToken.replace(/[),.:]+$/, '')
    if (token.startsWith('/dev/null')) continue
    if (token.startsWith('/bin/') || token.startsWith('/usr/bin/')) continue
    const resolved = path.resolve(token)
    const tempRoot = path.resolve('/tmp')
    const relativeToTemp = path.relative(tempRoot, resolved)
    if (
      token.startsWith('/tmp/') &&
      !relativeToTemp.startsWith('..') &&
      !path.isAbsolute(relativeToTemp)
    ) {
      continue
    }
    const relative = path.relative(root, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return token
  }
  return undefined
}

export function evaluateTerminalCommandPolicy(params: {
  command: string
  mode: 'assistant' | 'user'
  permissionProfile: TerminalPermissionProfile
  projectRoot: string
}): TerminalPolicyDecision {
  if (params.mode === 'user') return { allowed: true }
  const command = normalizeCommand(params.command)
  let isLibrarianClone = false

  if (params.permissionProfile !== 'full-access') {
    const traversalPath = findTraversalPath(command)
    if (traversalPath) {
      return {
        allowed: false,
        reason: `path traversal is not allowed: ${traversalPath}`,
      }
    }
  }

  if (params.permissionProfile === 'tmux-test') {
    const workspaceWriteSyntax = [
      /(?:^|[;&|]\s*)\b(?:rm|mv|cp|mkdir|touch|truncate|install)\b(?![^\n]*\/tmp\/)/i,
      /\bsed\s+-i\b/i,
      /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|publish)\b/i,
      /\bgit\s+(?:commit|push|reset|clean|checkout|switch|merge|rebase)\b/i,
      /(?:^|\s)(?:>|>>)\s*(?!\/tmp\/|\/dev\/null|&\d)/,
    ]
    if (workspaceWriteSyntax.some((pattern) => pattern.test(command))) {
      return {
        allowed: false,
        reason:
          'tmux-test agents may write only explicit /tmp fixtures and captures, not workspace files',
      }
    }
  }

  if (params.permissionProfile === 'git-commit') {
    if (/[;&|]{1,2}|\$\(|`/.test(command)) {
      return {
        allowed: false,
        reason: 'git-commit commands cannot use shell composition or substitution',
      }
    }
    const isAllowedGitCommand =
      /^git\s+(?:status|diff|log|show|rev-parse|rev-list|ls-files)\b/i.test(command) ||
      /^git\s+fetch(?:\s+--prune)?(?:\s+[A-Za-z0-9._/-]+)?$/i.test(command) ||
      /^git\s+branch\s+--show-current\b/i.test(command) ||
      /^git\s+add\s+(?!.*(?:^|\s)--(?:intent-to-add|chmod)\b).+/i.test(command) ||
      (!/(?:^|\s)--amend\b/i.test(command) &&
        /^git\s+commit\s+(?=.*-m(?:\s|$)).+/i.test(command)) ||
      /^git\s+push\s+(?!.*(?:--force|-f\b|--delete\b|:))(?:-u\s+|--set-upstream\s+)?[A-Za-z0-9._/-]+\s+(?!main$|master$)[A-Za-z0-9._/-]+$/i.test(
        command,
      )
    if (!isAllowedGitCommand) {
      return {
        allowed: false,
        reason:
          'git-commit agents may only inspect/fetch git state, stage paths, create a non-amend commit, and perform an explicit non-force branch push',
      }
    }
    const outsidePath = findOutsideAbsolutePath(command, params.projectRoot)
    if (outsidePath) {
      return {
        allowed: false,
        reason: `absolute path is outside the project: ${outsidePath}`,
      }
    }
    return { allowed: true }
  }

  if (params.permissionProfile === 'dependency-mutation') {
    if (/[;&|]{1,2}|\$\(|`|\r|\n/.test(command)) {
      return {
        allowed: false,
        reason: 'dependency-mutation commands cannot use shell composition or substitution',
      }
    }
    if (/(?:^|\s)(?:-g|--global|--system|--user)(?:\s|$)/i.test(command)) {
      return {
        allowed: false,
        reason: 'global or user-level dependency mutation is not allowed',
      }
    }
    const dependencyCommands = [
      /^(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update)(?:\s|$)/i,
      /^pnpm\s+--filter\s+(?:'[^']+'|"[^"]+"|\S+)\s+(?:install|add|remove|update)(?:\s|$)/i,
      /^yarn\s+workspace\s+(?:'[^']+'|"[^"]+"|\S+)\s+(?:add|remove|upgrade)(?:\s|$)/i,
      /^bun\s+--filter\s+(?:'[^']+'|"[^"]+"|\S+)\s+(?:install|add|remove|update)(?:\s|$)/i,
      /^(?:uv|poetry)\s+(?:add|remove|sync|install|update)(?:\s|$)/i,
      /^pip(?:3)?\s+(?:install|uninstall)(?:\s|$)/i,
      /^cargo\s+(?:add|rm|remove|fetch|update)(?:\s|$)/i,
      /^go\s+(?:get|mod\s+(?:tidy|download))(?:\s|$)/i,
      /^dotnet\s+(?:add|remove)\s+package(?:\s|$)/i,
      /^dotnet\s+restore(?:\s|$)/i,
      /^(?:bundle|bundler)\s+(?:add|remove|install|update)(?:\s|$)/i,
      /^composer\s+(?:require|remove|install|update)(?:\s|$)/i,
      /^swift\s+package\s+(?:resolve|update)(?:\s|$)/i,
      /^(?:dart|flutter)\s+pub\s+(?:add|remove|get|upgrade)(?:\s|$)/i,
      /^mix\s+deps\.(?:get|update)(?:\s|$)/i,
      /^(?:mvn|mvnw|\.\/mvnw)\s+(?:dependency:resolve|dependency:go-offline)(?:\s|$)/i,
      /^(?:gradle|gradlew|\.\/gradlew)\s+(?:dependencies|buildEnvironment)(?:\s|$)/i,
    ]
    const isDependencyCommand = dependencyCommands.some((pattern) =>
      pattern.test(command),
    )
    if (!isDependencyCommand) {
      return {
        allowed: false,
        reason:
          'dependency-manager commands must match a supported ecosystem dependency operation',
      }
    }
    const outsidePath = findOutsideAbsolutePath(command, params.projectRoot)
    if (outsidePath) {
      return {
        allowed: false,
        reason: `absolute path is outside the project: ${outsidePath}`,
      }
    }
    return { allowed: true }
  }

  if (
    params.permissionProfile === 'read-only' ||
    params.permissionProfile === 'librarian-read-only'
  ) {
    if (/[;&|]{1,2}|\$\(|`/.test(command)) {
      return {
        allowed: false,
        reason:
          'read-only commands cannot use shell composition or substitution',
      }
    }
    const readOnlyMutation = findReadOnlyMutation(command)
    if (readOnlyMutation) {
      return { allowed: false, reason: readOnlyMutation }
    }
    isLibrarianClone =
      params.permissionProfile === 'librarian-read-only' &&
      /^git clone --depth 1 'https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?\/?' '\/tmp\/librarian-[A-Za-z0-9._-]+-[0-9]+'$/.test(
        command,
      )
    if (
      !isLibrarianClone &&
      !READ_ONLY_COMMANDS.some((pattern) => pattern.test(command))
    ) {
      return {
        allowed: false,
        reason:
          'command is not in the read-only validation/inspection allowlist',
      }
    }
    if (isLibrarianClone) return { allowed: true }
  }

  if (
    params.permissionProfile !== 'full-access' &&
    params.permissionProfile !== 'tmux-test'
  ) {
    if (/\b(?:eval|source)\b|\b(?:bash|sh|zsh|fish)\s+-c\b/i.test(command)) {
      return {
        allowed: false,
        reason: 'shell indirection requires an explicit full-access workflow',
      }
    }
    for (const [pattern, reason] of WORKSPACE_DENY_PATTERNS) {
      if (pattern.test(command)) return { allowed: false, reason }
    }
    const outsidePath = findOutsideAbsolutePath(command, params.projectRoot)
    if (outsidePath) {
      return {
        allowed: false,
        reason: `absolute path is outside the project: ${outsidePath}`,
      }
    }
  }

  return { allowed: true }
}
