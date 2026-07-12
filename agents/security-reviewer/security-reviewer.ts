import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'security-reviewer',
  publisher,
  displayName: 'Sam',
  spawnerPrompt:
    'Adversarial security review of file/path/process/auth/crypto changes. Spawn after security-sensitive edits to catch injection, traversal, secret leakage, and auth bypass risks.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The security-relevant change to review. Describe the files changed and the security concern (e.g. "new file upload endpoint in routes/upload.ts accepts user-supplied filenames").',
    },
    params: {
      type: 'object',
      properties: {
        changed_files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of changed file paths to review. The agent will read each one.',
        },
      },
      required: [],
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      schemaVersion: { type: 'number' },
      verdict: { type: 'string', enum: ['LOOKS_GOOD', 'NON_BLOCKING', 'BLOCKING'] },
      findings: { type: 'array', items: { type: 'string' } },
      coverage: { type: 'string', enum: ['covered', 'missing', 'n/a'] },
      dimensions: {
        type: 'object',
        properties: {
          inputBoundaries: { type: 'string' },
          authorization: { type: 'string' },
          secretHandling: { type: 'string' },
          resourceSafety: { type: 'string' },
          failureMode: { type: 'string' },
        },
        required: ['inputBoundaries', 'authorization', 'secretHandling', 'resourceSafety', 'failureMode'],
      },
    },
    required: ['schemaVersion', 'verdict', 'findings', 'coverage', 'dimensions'],
  },
  includeMessageHistory: false,
  toolNames: [
    'read_files',
    'read_outline',
    'code_search',
    'git_status',
    'set_output',
  ],
  spawnableAgents: [],

  systemPrompt: `You are an adversarial security reviewer. You assume hostile inputs and look for exploitable weaknesses. You review against OWASP-style categories and the project's own threat surface. You report concrete, reproducible findings with severity, not generic hardening advice.`,

  instructionsPrompt: `Instructions:
Return the required structured output with schemaVersion 1 and give each security dimension a pass, warning, block, or not_applicable status. Any Critical/High/Medium exploitable finding must block the relevant dimension and the overall verdict.
Your first visible token MUST be exactly BLOCKING:, NON_BLOCKING:, or LOOKS_GOOD:.
- Use BLOCKING: when any Critical/High/Medium exploitable finding requires a code change before finalization.
- Use NON_BLOCKING: only for low-risk observations that do not require a change.
- Use LOOKS_GOOD: when no exploitable issue was found.

For each changed file, do an adversarial pass checking:
1. Input boundaries: injection (SQL/command/template/regex), path traversal, SSRF, prototype pollution, deserialization, XXE.
2. Auth & access control: missing authorization, IDOR, privilege escalation, secret leakage in logs/errors/responses, token handling.
3. Resource safety: ReDoS, unbounded loops, zip/quadratic blowup, file descriptor exhaustion, unsafe tempfile/symlink.

Process:
- read_files each changed file AND code_search for the surrounding callers/validation layer (do not review in isolation).
- For each finding, state: severity (Critical/High/Medium/Low), the exact file+line, a one-sentence repro/exploit sketch, and a concrete fix.
- If you find no exploitable issues, begin with "LOOKS_GOOD: No exploitable issues found" and list the categories you checked.
- Do not recommend generic hardening (e.g. "add rate limiting") unless there is a concrete exploit path.
Do not modify code. Review only.`.trim(),
}

export default definition
