import path from 'node:path'

export type TerminalPermissionProfile =
  | 'read-only'
  | 'librarian-read-only'
  | 'git-commit'
  | 'dependency-mutation'
  | 'validation-diagnosis'
  | 'tmux-test'
  | 'workspace-write'
  | 'full-access'

export type TerminalPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

const WORKSPACE_DENY_PATTERNS: Array<[RegExp, string]> = [
  [/^(?:sudo|su)\b/i, 'privilege escalation is not allowed'],
  [
    /^(?:apt|apt-get|dnf|yum|pacman|brew|choco|winget)\b/i,
    'system package management is not allowed',
  ],
  [/\brm\s+-[^\n]*r[^\n]*\s+\/(?:\s|$)/i, 'root deletion is forbidden'],
  [
    /^(?:env|printenv|set|export)(?:\s|$)/i,
    'dumping the inherited process environment is not allowed',
  ],
  [
    /^git\s+push\b[\s\S]*(?:--force(?:-with-lease)?|-f\b|--delete\b)/i,
    'force and delete pushes are not allowed',
  ],
]

const DEPENDENCY_MUTATION_COMMANDS = [
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

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

/** Detect shell operators only when they are active syntax, not quoted data. */
function hasUnquotedShellSyntax(command: string): boolean {
  let quote: "'" | '"' | null = null
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else if (quote === '"') {
        // Inside double quotes, $( and backtick are still active shell syntax.
        if (char === '`') return true
        if (char === '$' && command[index + 1] === '(') return true
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (
      char === ';' ||
      char === '|' ||
      char === '&' ||
      char === '`' ||
      char === '<' ||
      char === '>'
    ) {
      return true
    }
    if (char === '$' && command[index + 1] === '(') return true
  }
  return false
}

/**
 * Raw-string active-syntax guard for the git-commit profile. Deliberately
 * NOT quote-aware: `runTerminalCommand` executes via `bash -c`, which expands
 * substitution and redirection even inside quotes, and git-commit read-only
 * commands never need redirection or substitution. Rejects the command if
 * `$(`, a backtick, `<`, or `>` appears anywhere in the raw string.
 */
function hasActiveShellSyntaxAnywhere(command: string): boolean {
  return /\$\(|`|<|>/.test(command)
}

/** Detect command substitution/backticks that execute outside single quotes. */
function hasActiveCommandSubstitution(command: string): boolean {
  let quote: "'" | '"' | null = null
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else if (quote === '"' && (char === '`' || (char === '$' && command[index + 1] === '('))) return true
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === '`' || (char === '$' && command[index + 1] === '(')) return true
  }
  return false
}

/** Detect active parameter expansion outside single-quoted literal data. */
function hasActiveParameterExpansion(command: string): boolean {
  let quote: "'" | '"' | null = null
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else if (quote === '"' && char === '$') {
        return true
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === '$') return true
  }
  return false
}

/** Detect active shell compound/control syntax outside quoted literal data. */
function hasActiveTmuxCompoundShellSyntax(command: string): boolean {
  const keywords = new Set([
    'if',
    'then',
    'fi',
    'for',
    'while',
    'until',
    'case',
    'esac',
    'do',
    'done',
  ])
  let quote: "'" | '"' | null = null
  let escaped = false
  let token = ''

  const flushToken = (): boolean => {
    if (keywords.has(token)) return true
    token = ''
    return false
  }

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"') {
      if (flushToken()) return true
      quote = char
      continue
    }
    if (char === '{' || char === '}' || char === '(' || char === ')') {
      return true
    }
    if (/[A-Za-z0-9_]/.test(char)) {
      token += char
      continue
    }
    if (flushToken()) return true
  }
  return flushToken()
}

const TMUX_UNSAFE_EXECUTABLES = new Set([
  // Execution wrappers can conceal a prohibited command behind option parsing
  // and must fail closed after env/command resolver normalization.
  'nice',
  'nohup',
  'stdbuf',
  'timeout',
  'time',
  'setsid',
  'chrt',
  'ionice',
  'flock',
  'unshare',
  // Direct writers and archive extractors can mutate arbitrary workspace paths.
  // Deny them by normalized executable so quoted flags and wrapper forms cannot evade it.
  'sed',
  'tar',
  'unzip',
  'patch',
  'rsync',
  'cpio',
  '7z',
  'unrar',
  'awk',
  'bash',
  'busybox',
  'bun',
  'chgrp',
  'chmod',
  'chown',
  'dash',
  'dd',
  'deno',
  'eval',
  'find',
  'fish',
  'ln',
  'lua',
  'make',
  'node',
  'nodejs',
  'perl',
  'php',
  'python',
  'python3',
  'ruby',
  'sh',
  'shred',
  'source',
  'tee',
  'xargs',
  'zsh',
  '__unsafe-tmux-wrapper__',
])

type TmuxCommand = {
  executable: string
  arguments: string[]
}

type TmuxShellWord = {
  raw: string
  value: string
}

/** Tokenize shell words while applying quote removal and executable escapes. */
function tokenizeTmuxShellWords(segment: string): TmuxShellWord[] | undefined {
  const tokens: TmuxShellWord[] = []
  let raw = ''
  let value = ''
  let quote: "'" | '"' | null = null
  let hasWord = false

  const flushWord = (): void => {
    if (!hasWord) return
    tokens.push({ raw, value })
    raw = ''
    value = ''
    hasWord = false
  }

  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index]
    if (!quote && /\s/.test(char)) {
      flushWord()
      continue
    }
    hasWord = true
    raw += char
    if (char === "'" && quote !== '"') {
      quote = quote === "'" ? null : "'"
      continue
    }
    if (char === '"' && quote !== "'") {
      quote = quote === '"' ? null : '"'
      continue
    }
    if (char === '\\' && quote !== "'") {
      const escaped = segment[index + 1]
      if (escaped === undefined) return undefined
      if (!quote || /[$`"\\\n]/.test(escaped)) {
        raw += escaped
        value += escaped
        index += 1
        continue
      }
    }
    value += char
  }

  if (quote) return undefined
  flushWord()
  return tokens
}

/**
 * Resolves the executable at the start of a shell segment after consuming
 * leading POSIX assignment words and unwrapping `env` assignments/options and
 * `command` options. Shell quote removal and backslash escaping are applied
 * only to resolver-controlled words; arguments retain their raw quoting as
 * inert data. Unsupported, unresolved, or malformed executables fail closed.
 */
function resolveTmuxCommand(segment: string): TmuxCommand | undefined {
  const tokens = tokenizeTmuxShellWords(segment)
  if (!tokens) return { executable: '__unsafe-tmux-wrapper__', arguments: [] }
  let index = 0

  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]?.value ?? '')) {
    index += 1
  }

  while (index < tokens.length) {
    const token = tokens[index]
    const executable = token.value
      .split('/')
      .filter(Boolean)
      .at(-1)
      ?.toLowerCase()
    if (!executable || !/^[a-z0-9._+-]+$/.test(executable)) {
      return { executable: '__unsafe-tmux-wrapper__', arguments: [] }
    }

    if (executable === 'env') {
      index += 1
      let optionsEnded = false
      while (index < tokens.length) {
        const argument = tokens[index].value
        if (!optionsEnded && argument === '--') {
          optionsEnded = true
          index += 1
        } else if (!optionsEnded && (argument === '-i' || argument === '--ignore-environment')) {
          index += 1
        } else if (!optionsEnded && (argument === '-u' || argument === '--unset')) {
          if (!tokens[index + 1]) {
            return { executable: '__unsafe-tmux-wrapper__', arguments: [] }
          }
          index += 2
        } else if (!optionsEnded && argument.startsWith('--unset=')) {
          index += 1
        } else if (!optionsEnded && argument.startsWith('-')) {
          return { executable: '__unsafe-tmux-wrapper__', arguments: [] }
        } else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argument)) {
          index += 1
        } else {
          break
        }
      }
      continue
    }
    if (executable === 'command') {
      index += 1
      if (tokens[index]?.value === '--') index += 1
      else if ((tokens[index]?.value ?? '').startsWith('-')) {
        return { executable: '__unsafe-tmux-wrapper__', arguments: [] }
      }
      continue
    }
    return {
      executable,
      arguments: tokens.slice(index + 1).map((argument) => argument.raw),
    }
  }
  return { executable: '__unsafe-tmux-wrapper__', arguments: [] }
}

function getTmuxExecutable(segment: string): string | undefined {
  return resolveTmuxCommand(segment)?.executable
}

function hasUnsafeTmuxExecutable(command: string): boolean {
  const segments = splitReadOnlyShellSegments(command)
  return (
    segments?.some((segment) => {
      const executable = getTmuxExecutable(segment)
      return (
        executable === '__unsafe-tmux-wrapper__' ||
        (executable !== undefined && TMUX_UNSAFE_EXECUTABLES.has(executable))
      )
    }) ?? false
  )
}

function hasShellInterpreterEscape(command: string): boolean {
  return /^(?:eval\b|source\b|\.\s+)/i.test(command.trim())
}

function findTraversalPath(command: string): string | undefined {
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  for (const rawToken of tokens) {
    const token = rawToken.replace(/^["']|["',);]+$/g, '')
    if (token.split(/[=\\/]+/).includes('..')) return rawToken
  }
  return undefined
}

function splitReadOnlyShellSegments(command: string): string[] | undefined {
  const segments: string[] = []
  let quote: "'" | '"' | null = null
  let escaped = false
  let start = 0
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === '`' || (char === '$' && command[index + 1] === '(')) {
      return undefined
    }
    if (
      char === '&' &&
      command[index - 1] === '>' &&
      /[012]/.test(command[index + 1] ?? '')
    ) {
      continue
    }
    if (char === '&' && command[index + 1] !== '&') {
      return undefined
    }
    if (char === '|' || char === ';' || char === '&') {
      segments.push(command.slice(start, index).trim())
      if (command[index + 1] === char) index += 1
      start = index + 1
    }
  }
  segments.push(command.slice(start).trim())
  return segments.every(Boolean) ? segments : undefined
}

function stripSafeReadOnlyRedirections(segment: string): string | undefined {
  const withoutNullRedirects = segment.replace(
    /(?:^|\s)[012]?>\s*\/dev\/null(?=\s|$)/g,
    ' ',
  )
  const withoutDescriptorRedirects = withoutNullRedirects.replace(
    /(?:^|\s)[012]?>&[012](?=\s|$)/g,
    ' ',
  )
  if (/[<>]/.test(withoutDescriptorRedirects)) return undefined
  return normalizeCommand(withoutDescriptorRedirects)
}

/**
 * tmux-test commands execute through a shell, so a policy-time path check
 * cannot safely authorize a later filesystem open. Only output discarded to
 * /dev/null is permitted; fixture writes require a dedicated executor that
 * owns an atomically-created private directory.
 */
function hasUnsafeTmuxWriteRedirection(command: string): boolean {
  let quote: "'" | '"' | null = null
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char !== '>') continue

    let targetStart = index + 1
    if (command[targetStart] === '>' || command[targetStart] === '|') targetStart += 1
    while (/\s/.test(command[targetStart] ?? '')) targetStart += 1
    if (
      command[targetStart] === '&' &&
      /[012]/.test(command[targetStart + 1] ?? '')
    ) {
      continue
    }
    const target = command.slice(targetStart).match(/^\S+/)?.[0] ?? ''
    if (target !== '/dev/null') return true
  }
  return false
}

function hasUnsafeTmuxSedInPlace(command: string): boolean {
  const segments = splitReadOnlyShellSegments(command)
  return (
    segments?.some((segment) => {
      const resolved = resolveTmuxCommand(segment)
      return (
        resolved?.executable === 'sed' &&
        resolved.arguments.some(
          (argument) =>
            argument === '--in-place' ||
            argument.startsWith('--in-place=') ||
            /^-[A-Za-z]*i[A-Za-z]*(?:\..*)?$/.test(argument),
        )
      )
    }) ?? false
  )
}

/**
 * A shell command can replace a checked /tmp path before opening it. Deny all
 * file mutation commands until fixture creation is owned by a no-follow,
 * directory-FD-relative terminal executor.
 */
function hasUnsafeTmuxFileMutation(command: string): boolean {
  const mutationExecutables = new Set([
    'rm',
    'mv',
    'cp',
    'mkdir',
    'touch',
    'truncate',
    'install',
  ])
  const segments = splitReadOnlyShellSegments(command)
  return (
    segments?.some((segment) => {
      const resolved = resolveTmuxCommand(segment)
      return Boolean(resolved && mutationExecutables.has(resolved.executable))
    }) ?? false
  )
}

/**
 * Traversal guard for the validation-diagnosis profile: rejects only `..`
 * tokens whose path resolves outside the project root, so diagnostic repros
 * may reference in-project siblings such as `../src/languages` from a package
 * subdirectory. Absolute tokens are resolved directly; relative tokens are
 * resolved against the project root, which is conservative for in-project
 * working directories (a false rejection is possible for `../..` from a
 * deeply nested cwd that still lands inside the root). Absolute paths that
 * escape the project are also rejected by findOutsideAbsolutePath.
 */
function findEscapingTraversalPath(
  command: string,
  projectRoot: string,
): string | undefined {
  const root = path.resolve(projectRoot)
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  for (const rawToken of tokens) {
    const token = rawToken.replace(/^["']|["',);]+$/g, '')
    if (!token.split(/[=\\/]+/).includes('..')) continue
    const resolved = path.isAbsolute(token)
      ? path.resolve(token)
      : path.resolve(root, token)
    const relative = path.relative(root, resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return rawToken
    }
  }
  return undefined
}

/**
 * Write-target guard for the validation-diagnosis profile: only plain,
 * unquoted, expansion-free paths that resolve inside the project root are
 * allowed (e.g. `cat > repro/fixture.log <<'EOF'`). Absolute targets must
 * stay inside the project, and targets with `..` segments must not resolve
 * outside it; anything else (tilde/variable/backtick expansion or shell
 * escaping) is unsafe and keeps the command blocked.
 */
function isDiagnosticWriteTargetSafe(
  target: string,
  projectRoot: string,
): boolean {
  // The shell removes backslashes before resolving a redirect target. Reject
  // them before containment checks so `\../outside` cannot escape projectRoot.
  if (target.length === 0 || /[\\"'`~$]/.test(target)) return false
  const root = path.resolve(projectRoot)
  const resolved = path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(root, target)
  const relative = path.relative(root, resolved)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * validation-diagnosis variant of stripSafeReadOnlyRedirections: on top of
 * the base /dev/null and descriptor redirects, it also strips heredoc
 * operators and `>`/`>>` writes whose targets are safe project-relative (or
 * in-project absolute) paths. Any other `<`/`>` — input redirections,
 * process substitution, or writes outside the project — still returns
 * undefined so the command is rejected as an unsafe shell redirection.
 */
function stripDiagnosticRedirections(
  segment: string,
  projectRoot: string,
): string | undefined {
  const withoutHeredocs = segment.replace(/<<-?\s*(?:'[^']*'|"[^"]*"|\\?\S+)/g, ' ')
  let safe = true
  const withoutWrites = withoutHeredocs.replace(
    /(^|\s)[012]?>>?(?![&0-9])\s*([^\s<>|;&]*)/g,
    (match, leading: string, rawTarget: string) => {
      if (!isDiagnosticWriteTargetSafe(rawTarget, projectRoot)) {
        safe = false
        return match
      }
      return leading
    },
  )
  if (!safe) return undefined
  return stripSafeReadOnlyRedirections(withoutWrites)
}

/**
 * Accept one bounded, literal heredoc only for the diagnostic `cat > file`
 * shape. Its quoted delimiter makes the body inert shell data; stripping it
 * before general normalization prevents body text from being treated as shell
 * syntax or a second command. The full-string match rejects a missing or
 * trailing command after the terminator.
 */
function stripBoundedDiagnosticHeredoc(command: string): string | undefined {
  const match = command.match(
    /^\s*cat\s+>\s*([^\s<>|;&]+)\s*<<\s*'([A-Za-z_][A-Za-z0-9_]*)'\s*\r?\n([\s\S]*)\r?\n\2\s*$/,
  )
  if (
    !match ||
    match[3].length > 65_536 ||
    match[3].includes('\0') ||
    match[3].split(/\r?\n/).includes(match[2])
  ) {
    return undefined
  }
  return `cat > ${match[1]}`
}

function findReadOnlyDanger(command: string): string | undefined {
  const mutation = findReadOnlyMutation(command)
  if (mutation) return mutation

  if (
    /^tee\b/i.test(command) &&
    !/^tee(?:\s+(?:-a\s+)?(?:\/tmp\/[^\s]+|\/dev\/null))?$/i.test(command)
  ) {
    return 'tee may only write diagnostic output under /tmp in read-only mode'
  }
  if (DEPENDENCY_MUTATION_COMMANDS.some((pattern) => pattern.test(command))) {
    return 'dependency mutation is not allowed in read-only mode'
  }

  const dangerousCommands: Array<[RegExp, string]> = [
    [
      /^(?:(?:env\s+)?(?:command\s+)?(?:bash|sh|zsh|dash|fish)|eval|source)\b/i,
      'shell indirection requires an explicit full-access workflow',
    ],
    [/^(?:sudo|su)\b/i, 'privilege escalation is not allowed'],
    [
      /^(?:env|printenv|set|export)(?:\s|$)/i,
      'dumping or mutating the process environment is not allowed',
    ],
    [
      /^(?:perl|awk|sed|ruby)\b[\s\S]*?(?:--in-place(?:=|\s|$)|\s-[a-zA-Z]*i(?:\.[^\s]*)?(?=\s|$))/i,
      'in-place file edits are not allowed in read-only mode',
    ],
    [
      /^(?:python(?:3)?|node|bun|deno|ruby|perl)\s+(?:--?(?:eval|print)\b|-[a-zA-Z]*[cep][a-zA-Z]*)[\s\S]*(?:process\s*\.\s*env|os\s*\.\s*environ|\bENV\b|\bgetenv\b)/i,
      'interpreter one-liners that read the process environment are not allowed in read-only mode',
    ],
    [
      /^(?:rm|mv|cp|mkdir|rmdir|touch|truncate|install|ln|chmod|chown|chgrp|dd|shred)\b/i,
      'filesystem mutation is not allowed in read-only mode',
    ],
    [
      /^git\s+(?:add|commit|push|reset|clean|checkout|switch|merge|rebase|restore|stash|cherry-pick|tag|branch\s+-(?:d|D))\b/i,
      'Git mutation is not allowed in read-only mode',
    ],
    [
      /^(?:git\s+clone|curl\b[\s\S]*(?:\s-X\s*(?:POST|PUT|PATCH|DELETE)\b|\s(?:-d|--data(?:-raw)?|-T|--upload-file)\b)|wget\b[\s\S]*(?:\s-O\b|\s--output-document\b))/i,
      'network mutation is not allowed in read-only mode',
    ],
    [
      /^(?:apt|apt-get|dnf|yum|pacman|brew|choco|winget|make\s+install)\b/i,
      'package or system mutation is not allowed in read-only mode',
    ],
    [
      /^(?:kubectl|terraform|helm|docker|podman)\s+(?:apply|create|delete|destroy|exec|run|push|build)\b/i,
      'deployment or container mutation is not allowed in read-only mode',
    ],
    [
      /^(?:kubectl)\s+(?:patch|replace|scale|rollout\s+restart|set|label|annotate)\b/i,
      'deployment mutation is not allowed in read-only mode',
    ],
    [
      /^gh\s+(?:pr\s+(?:create|merge|close|reopen|ready|review)|release\s+(?:create|delete|edit|upload)|workflow\s+run|repo\s+(?:create|delete))\b/i,
      'GitHub mutation is not allowed in read-only mode',
    ],
    [
      /^(?:xargs|find)\b[\s\S]*\b(?:rm|mv|cp|mkdir|touch|chmod|chown|install|bash|sh|python|node)\b/i,
      'indirect command execution or filesystem mutation is not allowed in read-only mode',
    ],
    [
      /^(?:kill|pkill|killall|shutdown|reboot|poweroff|mount|umount)\b/i,
      'process or system mutation is not allowed in read-only mode',
    ],
    [
      /^(?:(?:python(?:3)?|node|bun|deno|ruby|perl)\s+(?:-c|-e)|blender\b[\s\S]*--python(?:-expr)?\b)[\s\S]*(?:open\s*\(|write\s*\(|unlink\s*\(|rmdir\s*\(|mkdir\s*\(|subprocess|child_process|exec\s*\(|system\s*\(|remove\s*\()/i,
      'embedded script writes or executes subprocesses in read-only mode',
    ],
  ]
  return dangerousCommands.find(([pattern]) => pattern.test(command))?.[1]
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

/**
 * Remove -m/--message arguments from a git commit command so the message
 * body (inert data to git) is not scanned for absolute paths. Handles
 * double-quoted, single-quoted, and bare-word message values, including
 * multiline quoted strings.
 */
function stripCommitMessageArgs(command: string): string {
  return command
    .replace(
      /(?:^|\s)(?:-m|--message)(?:=(?:"[^"]*"|'[^']*'|[^\s"']+)|\s+(?:"[^"]*"|'[^']*'|[^\s"']+))/g,
      ' ',
    )
    .trim()
}

function hasUnsafeReadOnlyGitOption(command: string): boolean {
  return /(?:^|\s)--(?:output|exec-path)(?:=|\s|$)/i.test(command) ||
    /(?:^|\s)--(?:ext-diff|textconv)(?:\s|$)/i.test(command) ||
    /(?:^|\s)-o(?:\s|$)/i.test(command)
}

/**
 * Read-only git inspection commands for the git-commit profile: the
 * ancestry/branch/remote inspectors unioned with the existing inspect verbs.
 * These are the only git commands allowed as segments of shell composition
 * (`|`/`;`/`&&`); add/commit/push stay single-command-only. A segment with
 * active shell syntax (a redirection, or substitution hidden inside quotes)
 * never counts as read-only.
 */
function isReadOnlyGitCommand(command: string): boolean {
  if (hasActiveShellSyntaxAnywhere(command)) return false
  if (hasUnquotedShellSyntax(command)) return false
  if (hasUnsafeReadOnlyGitOption(command)) return false
  // `\b` after `show` treats `show-ref` as `show` + `-ref` (`-` is a word
  // boundary), which let `git show-ref --delete refs/heads/x` pass as a bare
  // `show`. Require whitespace (or end) after the verb so `show` cannot match
  // `show-ref` and `branch` cannot match `branch-...`; args still allowed.
  return (
    /^git\s+(?:status|diff|log|show|rev-parse|rev-list|ls-files)(?:\s|$)/i.test(
      command,
    ) ||
    /^git\s+fetch(?:\s+--prune)?(?:\s+[A-Za-z0-9._/-]+)?$/i.test(command) ||
    /^git\s+branch\s+--show-current(?:\s|$)/i.test(command) ||
    /^git\s+merge-base(?:\s+--(?:is-ancestor|all|octopus|independent|fork-point))?(?:\s+[A-Za-z0-9._/^-]+)*\s*$/i.test(
      command,
    ) ||
    /^git\s+ls-remote(?:\s+--(?:heads|tags|refs|exit-code|get-url|symref|sort=\S+))?(?:\s+[A-Za-z0-9._/^*-]+)*\s*$/i.test(
      command,
    ) ||
    /^git\s+branch(?:\s+-[rva]+|\s+--list)+(?:\s+[A-Za-z0-9._/^*-]+)*\s*$/i.test(
      command,
    ) ||
    /^git\s+remote\s+(?:-v|show\s+[A-Za-z0-9._/-]+|get-url\s+[A-Za-z0-9._/-]+)\s*$/i.test(
      command,
    ) ||
    /^git\s+show-ref(?:\s+--(?:heads|tags|head|hash(?:=\d+)?|abbrev(?:=\d+)?))+\s*$|^git\s+show-ref\s*$/i.test(
      command,
    ) ||
    /^git\s+describe(?:\s+--(?:tags|all|long|always|dirty|abbrev=\d+|match=\S+))?(?:\s+[A-Za-z0-9._/^-]+)*\s*$/i.test(
      command,
    ) ||
    /^git\s+name-rev(?:\s+--(?:name-only|tags|always|no-undefined))?(?:\s+[A-Za-z0-9._/^-]+)*\s*$/i.test(
      command,
    ) ||
    /^git\s+config\s+--get(?:-regexp)?\s+[A-Za-z0-9._/-]+\s*$/i.test(
      command,
    ) ||
    /^git\s+cat-file\s+-(?:t|s|p|e)\s+[A-Za-z0-9._/^-]+\s*$/i.test(command)
  )
}

/** tmux-test permits non-fetch Git commands only through the inspection allowlist. */
function hasUnsafeTmuxGitCommand(command: string): boolean {
  const segments = splitReadOnlyShellSegments(command)
  return (
    segments?.some((segment) => {
      const resolved = resolveTmuxCommand(segment)
      return (
        resolved?.executable === 'git' &&
        (resolved.arguments[0]?.toLowerCase() === 'fetch' ||
          !isReadOnlyGitCommand(`git ${resolved.arguments.join(' ')}`))
      )
    }) ?? false
  )
}

function findOutsideAbsolutePath(
  command: string,
  projectRoot: string,
): string | undefined {
  const root = path.resolve(projectRoot)
  const shellTokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  const outsideShellToken = shellTokens.find((rawToken) => {
    const token = rawToken.replace(/^["']|["',);]+$/g, '')
    return (
      token === '~' ||
      token.startsWith('~/') ||
      token === '$HOME' ||
      token.startsWith('$HOME/') ||
      token.startsWith('${HOME}/')
    )
  })
  if (outsideShellToken) return outsideShellToken
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
  allowedPaths?: string[]
}): TerminalPolicyDecision {
  if (params.mode === 'user') return { allowed: true }
  const hasRawNewline = /\r|\n/.test(params.command)
  const heredocCommand =
    params.permissionProfile === 'validation-diagnosis' && hasRawNewline
      ? stripBoundedDiagnosticHeredoc(params.command)
      : undefined
  if (
    params.permissionProfile !== 'full-access' &&
    hasRawNewline &&
    !heredocCommand
  ) {
    return {
      allowed: false,
      reason: 'terminal commands cannot contain raw newlines',
    }
  }
  const command = normalizeCommand(heredocCommand ?? params.command)
  let isLibrarianClone = false

  if (params.permissionProfile !== 'full-access') {
    // validation-diagnosis (the debugger profile) and workspace-write may
    // reference paths with `..` segments that still resolve inside the project
    // (e.g. a repro pointing at `../src/languages` from a package subdirectory).
    // They still reject segments that escape the project root, and absolute
    // paths outside the project stay blocked by findOutsideAbsolutePath below.
    // Base read-only and librarian-read-only keep the blanket `..` ban.
    const traversalPath =
      params.permissionProfile === 'validation-diagnosis' ||
      params.permissionProfile === 'workspace-write'
        ? findEscapingTraversalPath(command, params.projectRoot)
        : findTraversalPath(command)
    if (traversalPath) {
      return {
        allowed: false,
        reason: `path traversal is not allowed: ${traversalPath}`,
      }
    }
  }

  if (params.permissionProfile === 'tmux-test') {
    const workspaceWriteSyntax = [
      // Command substitution remains active outside single quotes, including
      // inside double quotes, and can mutate the workspace before tmux starts.
      hasActiveCommandSubstitution(command),
      hasActiveParameterExpansion(command),
      hasActiveTmuxCompoundShellSyntax(command),
      hasUnsafeTmuxFileMutation(command),
      hasUnsafeTmuxSedInPlace(command),
      hasUnsafeTmuxExecutable(command),
      hasUnsafeTmuxGitCommand(command),
      /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|publish)\b/i,
      /\bgit\s+(?:commit|push|reset|clean|checkout|switch|merge|rebase)\b/i,
      hasUnsafeTmuxWriteRedirection(command),
      hasShellInterpreterEscape(command),
    ]
    if (
      workspaceWriteSyntax.some(
        (pattern) => pattern === true || (pattern instanceof RegExp && pattern.test(command)),
      )
    ) {
      return {
        allowed: false,
        reason:
          'tmux-test commands cannot write fixtures through the shell; use a dedicated terminal executor with private fixture creation',
      }
    }
  }

  if (params.permissionProfile === 'git-commit') {
    if (hasShellInterpreterEscape(command)) {
      return {
        allowed: false,
        reason:
          'git-commit commands cannot use shell composition or substitution',
      }
    }
    // Fail-closed raw guard: `bash -c` expands substitution and redirection
    // even inside quotes, so reject `$(`, backtick, `<`, and `>` anywhere in
    // the command before any single-command or composed-segment validation.
    if (hasActiveShellSyntaxAnywhere(command)) {
      return {
        allowed: false,
        reason:
          'git-commit commands cannot use shell composition or substitution',
      }
    }
    if (hasUnquotedShellSyntax(command)) {
      // Shell composition is allowed only between allowlisted read-only git
      // commands; staging, committing, and pushing stay single-command-only.
      // Substitution, background `&`, and malformed input make the splitter
      // bail out, and any mutating or non-git segment fails the predicate.
      const segments = splitReadOnlyShellSegments(command)
      if (!segments || !segments.every(isReadOnlyGitCommand)) {
        return {
          allowed: false,
          reason:
            'git-commit commands cannot use shell composition or substitution',
        }
      }
    } else {
      const isGitAdd = /^git\s+add\b/i.test(command)
      if (isGitAdd) {
        const rawPaths =
          command
            .replace(/^git\s+add\s+/i, '')
            .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
        const stagedPaths = rawPaths
          .map((value) =>
            value.replace(/^["']|["']$/g, '').replace(/^\.\//, ''),
          )
          .filter((value) => value !== '--')
        if (
          stagedPaths.length === 0 ||
          stagedPaths.some(
            (value) =>
              value === '.' ||
              value === '-A' ||
              value === '--all' ||
              value.startsWith('-') ||
              /[*?\[\]{}]/.test(value),
          )
        ) {
          return {
            allowed: false,
            reason:
              'git-commit staging requires explicit owned file paths; broad flags, dot staging, options, and globs are forbidden',
          }
        }
        const allowedPaths = new Set(
          (params.allowedPaths ?? []).map((value) =>
            value.replace(/\\/g, '/').replace(/^\.\//, ''),
          ),
        )
        if (
          allowedPaths.size === 0 ||
          stagedPaths.some(
            (value) => !allowedPaths.has(value.replace(/\\/g, '/')),
          )
        ) {
          return {
            allowed: false,
            reason:
              'git add paths must be an exact subset of the spawn-bound owned_paths allowlist',
          }
        }
      }
      const isAllowedGitCommand =
        isReadOnlyGitCommand(command) ||
        /^git\s+add\s+(?!.*(?:^|\s)--(?:intent-to-add|chmod)\b).+/i.test(
          command,
        ) ||
        (!/(?:^|\s)--amend\b/i.test(command) &&
          /^git\s+commit\s+(?=.*-m(?:\s|$)).+/i.test(command)) ||
        /^git\s+push\s+(?!.*(?:--force|-f\b|--delete\b|:))(?:-u\s+|--set-upstream\s+)?[A-Za-z0-9._/-]+\s+[A-Za-z0-9._/-]+$/i.test(
          command,
        )
      if (!isAllowedGitCommand) {
        return {
          allowed: false,
          reason:
            'git-commit agents may only inspect/fetch git state, stage paths, create a non-amend commit, and perform an explicit non-force branch push',
        }
      }
    }
    const outsidePath = findOutsideAbsolutePath(
      stripCommitMessageArgs(command),
      params.projectRoot,
    )
    if (outsidePath) {
      return {
        allowed: false,
        reason: `absolute path is outside the project: ${outsidePath}`,
      }
    }
    return { allowed: true }
  }

  if (params.permissionProfile === 'dependency-mutation') {
    if (
      hasUnquotedShellSyntax(command) ||
      hasShellInterpreterEscape(command) ||
      /\r|\n/.test(command)
    ) {
      return {
        allowed: false,
        reason:
          'dependency-mutation commands cannot use shell composition or substitution',
      }
    }
    if (/(?:^|\s)(?:-g|--global|--system|--user)(?:\s|$)/i.test(command)) {
      return {
        allowed: false,
        reason: 'global or user-level dependency mutation is not allowed',
      }
    }
    const isDependencyCommand = DEPENDENCY_MUTATION_COMMANDS.some((pattern) =>
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

  // Base read-only and librarian-read-only stay fully strict. The
  // validation-diagnosis profile (debugger agent) additionally tolerates
  // in-project `..` references (handled by the traversal gate above) and
  // `>`/`>>`/heredoc writes to project-relative paths, so diagnostic repro
  // fixtures can be captured without opening workspace-write authority.
  if (
    params.permissionProfile === 'read-only' ||
    params.permissionProfile === 'librarian-read-only' ||
    params.permissionProfile === 'validation-diagnosis'
  ) {
    isLibrarianClone =
      params.permissionProfile === 'librarian-read-only' &&
      /^git clone --depth 1 'https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?\/?' '\/tmp\/librarian-[A-Za-z0-9._-]+-[0-9]+'$/.test(
        command,
      )
    if (isLibrarianClone) return { allowed: true }
    const pipeline = splitReadOnlyShellSegments(command)
    if (hasShellInterpreterEscape(command) || !pipeline) {
      return {
        allowed: false,
        reason:
          'read-only commands cannot use shell interpreter escapes or malformed shell composition',
      }
    }
    for (const segment of pipeline) {
      const normalizedSegment =
        params.permissionProfile === 'validation-diagnosis'
          ? stripDiagnosticRedirections(segment, params.projectRoot)
          : stripSafeReadOnlyRedirections(segment)
      if (!normalizedSegment) {
        return {
          allowed: false,
          reason:
            params.permissionProfile === 'validation-diagnosis'
              ? 'validation-diagnosis commands may only redirect writes to project-relative paths inside the project'
              : 'read-only commands cannot use unsafe shell redirection',
        }
      }
      const danger = findReadOnlyDanger(normalizedSegment)
      if (danger) return { allowed: false, reason: danger }
    }
  }

  if (params.permissionProfile !== 'full-access') {
    // tmux-test keeps its own workspace-write guard above and skips the
    // shell-indirection and workspace deny patterns so it can drive tmux
    // fixtures, but outside-absolute-path containment applies to it too, so
    // reads like `cat /etc/passwd` or `cat ~/.ssh/id_rsa` stay blocked.
    if (params.permissionProfile !== 'tmux-test') {
      if (/(?:^|[;&|(\n]\s*)(?:eval|source)\b|\b(?:bash|sh|zsh|fish)\s+-c\b/i.test(command)) {
        return {
          allowed: false,
          reason: 'shell indirection requires an explicit full-access workflow',
        }
      }
      for (const [pattern, reason] of WORKSPACE_DENY_PATTERNS) {
        if (pattern.test(command)) return { allowed: false, reason }
      }
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
