import { publisher } from '../constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from '../types/agent-definition'

const librarian: AgentDefinition = {
  id: 'librarian',
  publisher,
  displayName: 'Librarian',

  spawnerPrompt:
    'Spawn the librarian agent to shallow-clone a GitHub repository into /tmp and answer questions about its code, structure, or documentation. The runtime deletes the owned clone after the answer by default. Set params.retainClone=true only when the caller explicitly needs to inspect returned files after completion; retained clones require caller cleanup.',

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Question to answer about the cloned repository',
    },
    params: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description:
            'GitHub repository URL to clone (e.g. https://github.com/owner/repo)',
        },
        retainClone: {
          type: 'boolean',
          description:
            'Retain the owned /tmp clone after completion. Defaults to false. Set true only when the caller explicitly needs follow-up file access and will clean it up.',
        },
      },
      required: ['repoUrl'],
    },
  },

  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description: 'Full answer to the question about the repository',
      },
      relevantFiles: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Absolute file paths in the cloned repo that are relevant to the answer',
      },
      cloneDir: {
        type: 'string',
        description:
          'The clone directory while retained, or an empty string after automatic cleanup',
      },
      cloneRetained: {
        type: 'boolean',
        description:
          'Whether the clone still exists for caller inspection after completion',
      },
      status: {
        type: 'string',
        enum: ['answered', 'failed'],
      },
      error: { type: 'string' },
    },
    required: [
      'status',
      'answer',
      'relevantFiles',
      'cloneDir',
      'cloneRetained',
    ],
  },
  includeMessageHistory: false,

  toolNames: ['run_terminal_command', 'set_output'],
  terminalPermissionProfile: 'librarian-read-only',

  systemPrompt: `You are the Librarian, an expert at quickly understanding codebases. You have been given access to a freshly cloned repository in a /tmp directory. Your job is to explore its structure, read relevant files, and answer the user's question thoroughly and accurately.

CRITICAL RULES:
- The cloned repo is OUTSIDE the project directory in /tmp.
- You MUST use run_terminal_command for ALL file operations. Use shell commands like:
  - \`ls -la <dir>\` or \`tree -L 2 <dir>\` to list directory contents
  - \`cat <file>\` to read file contents
  - \`head -100 <file>\` to preview large files
  - \`find <dir> -name '*.ts' -type f\` to find files by pattern
  - \`grep -rn 'pattern' <dir> --include='*.ts'\` to search file contents
  - \`wc -l <file>\` to check file sizes
- NEVER copy files from /tmp into the project directory. This will overwrite project files and cause damage.
- NEVER modify files in the project directory.

When exploring a repo:
- Start with \`ls -la\` and \`cat README.md\` (or similar) at the repo root
- Check package.json, pyproject.toml, Cargo.toml, or similar entry points with \`cat\`
- Use \`find\` and \`grep\` to search for specific patterns or files
- Read the most relevant files with \`cat\`
- Provide clear, well-structured answers with references to specific files

When you are done, call set_output with status: "answered", your answer, all relevant file paths (absolute), cloneDir, and cloneRetained matching params.retainClone === true. Include every file you read or referenced in relevantFiles. The runtime, not the model, owns default clone cleanup.`,

  instructionsPrompt: `Answer the user's question about the cloned repository. Be thorough but concise. Reference specific files and code when relevant. When finished, call set_output with status, answer, relevantFiles, and cloneDir.`,

  handleSteps: function* ({ prompt, params, logger }: AgentStepContext) {
    const repoUrl = params?.repoUrl
    if (!repoUrl) {
      yield {
        toolName: 'set_output',
        input: {
          status: 'failed',
          answer: '',
          relevantFiles: [],
          cloneDir: '',
          cloneRetained: false,
          error:
            'repoUrl is required. Provide a GitHub repository URL in params.',
        },
      }
      return
    }

    // SECURITY: repoUrl is interpolated into a shell command string passed to
    // run_terminal_command (which executes via a shell). Validate it against a
    // strict GitHub URL allowlist BEFORE building the command so an attacker
    // can't inject shell metacharacters (e.g. a repoUrl containing `'` would
    // break out of the single-quote wrapping in the old code and run arbitrary
    // shell). The regex accepts http(s)://github.com/<owner>/<repo> with an
    // optional .git suffix and optional trailing slash, where owner and repo
    // are limited to the GitHub-safe charset [A-Za-z0-9._-]. Anything else is
    // rejected with a clear error instead of being executed.
    const GITHUB_URL_RE =
      /^https?:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?\/?$/
    if (typeof repoUrl !== 'string' || !GITHUB_URL_RE.test(repoUrl)) {
      yield {
        toolName: 'set_output',
        input: {
          status: 'failed',
          answer: '',
          relevantFiles: [],
          cloneDir: '',
          cloneRetained: false,
          error:
            'repoUrl must be a GitHub URL of the form https://github.com/<owner>/<repo>. Refusing to clone an untrusted URL.',
        },
      }
      return
    }

    // POSIX single-quote escape: wrap in single quotes and escape any literal
    // single quotes inside. Belt-and-suspenders defense: the regex above
    // already rejects single quotes, but shellQuoting here means the command is
    // safe even if the validation regex is ever loosened or a path-derived
    // value (cloneDir) contains surprising characters.
    const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

    const timestamp = Date.now()
    const repoName =
      repoUrl
        .split('/')
        .pop()
        ?.replace(/\.git$/, '') || 'repo'
    const cloneDir = '/tmp/librarian-' + repoName + '-' + timestamp

    logger.info('Cloning ' + repoUrl + ' into ' + cloneDir)

    const { toolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command:
          'git clone --depth 1 ' +
          shellQuote(repoUrl) +
          ' ' +
          shellQuote(cloneDir),
        timeout_seconds: 180,
      },
    }

    const result = toolResult?.[0]
    if (result && result.type === 'json') {
      const value = result.value as Record<string, unknown>
      const exitCode =
        typeof value?.exitCode === 'number' ? value.exitCode : undefined
      if (exitCode !== 0) {
        const stderr =
          typeof value?.stderr === 'string' ? value.stderr : 'Unknown error'
        logger.error('Clone failed: ' + stderr)
        yield {
          toolName: 'set_output',
          input: {
            status: 'failed',
            answer: '',
            relevantFiles: [],
            cloneDir: '',
            cloneRetained: false,
            error: 'Failed to clone repository: ' + stderr,
          },
        }
        return
      }
    }

    logger.info('Clone complete. Exploring repo...')

    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content:
          'The repository has been cloned to `' +
          cloneDir +
          '`. Use run_terminal_command with shell commands (ls, cat, find, grep, head, tree) to explore it. Do NOT use read_files, list_directory, glob, or code_search — they cannot access /tmp paths. Do NOT copy files into the project directory.\n\nNow answer this question about the repo:\n\n' +
          (prompt || 'Provide an overview of this repository.') +
          '\n\nWhen done, call set_output with status: "answered", your answer, relevantFiles (absolute paths), and cloneDir: "' +
          cloneDir +
          '", and cloneRetained: ' +
          String(params?.retainClone === true) +
          '.',
      },
      includeToolCall: false,
    }

    yield 'STEP_ALL'
  },
}

export default librarian
