// Define agent personas with their shared characteristics
export const AGENT_PERSONAS = {
  // Root orchestrators
  base2: {
    displayName: 'Buffy the Orchestrator',
    purpose:
      'Root orchestrator that plans, edits, and reviews complex coding tasks.',
  } as const,
  'base-deep': {
    displayName: 'Buffy the GPT Orchestrator',
    purpose:
      'Root orchestrator that plans, edits, and reviews complex coding tasks.',
  } as const,

  // Specialized agents
  thinker: {
    displayName: 'Theo the Theorizer',
    purpose:
      'Does deep thinking given the current messages and a specific prompt to focus on. Use this to help you solve a specific problem.',
  } as const,
  'file-picker': {
    displayName: 'Fletcher the File Fetcher',
    purpose: 'Expert at finding relevant files in a codebase.',
  } as const,
  // Editors
  editor: {
    displayName: 'Code Editor',
    purpose: 'Implements code changes for a self-contained task.',
  } as const,
  'repair-editor': {
    displayName: 'Repair Editor',
    purpose:
      'Applies targeted fixes for validation failures and reviewer findings.',
  } as const,

  // Reviewers and discovery
  'code-reviewer': {
    displayName: 'Nit Pick Nick',
    purpose: 'Reviews file changes and responds with critical feedback.',
  } as const,
  'code-searcher': {
    displayName: 'Code Searcher',
    purpose: 'Expert at searching the codebase for relevant code.',
  } as const,
  'file-lister': {
    displayName: 'Liszt the File Lister',
    purpose: 'Lists files relevant to a task.',
  } as const,
  'directory-lister': {
    displayName: 'Directory Lister',
    purpose: 'Lists the contents of a directory.',
  } as const,
  'glob-matcher': {
    displayName: 'Glob Matcher',
    purpose: 'Matches files by glob pattern.',
  } as const,
  'researcher-web': {
    displayName: 'Weeb',
    purpose: 'Researches topics using web search.',
  } as const,
  'researcher-docs': {
    displayName: 'Doc',
    purpose: 'Researches topics using library documentation.',
  } as const,

  // Tool-runner support agents
  basher: {
    displayName: 'Basher',
    purpose: 'Runs a single terminal command and reports its output.',
  } as const,
  'browser-use': {
    displayName: 'Browser Use Agent',
    purpose: 'Automates browser interactions via Chrome DevTools.',
  } as const,
  librarian: {
    displayName: 'Librarian',
    purpose: 'Clones a GitHub repository and answers questions about its code.',
  } as const,
  'tmux-cli': {
    displayName: 'Tmux CLI Agent',
    purpose: 'Interacts with and tests CLI applications via tmux.',
  } as const,
  'general-agent': {
    displayName: 'General Agent',
    purpose: 'General-purpose agent for a wide range of problems.',
  } as const,
  synthesizer: {
    displayName: 'Sam the Synthesizer',
    purpose: 'Synthesizes audit finding files into a cross-cutting report.',
  } as const,
  'context-pruner': {
    displayName: 'Context Pruner',
    purpose: 'Prunes and summarizes conversation context between steps.',
    hidden: true,
  } as const,
  'test-writer': {
    displayName: 'Tess the Test Writer',
    purpose:
      'Writes and runs unit/integration tests for code changes. Spawn when you need new test coverage for a feature or bugfix, or to validate that existing tests pass after edits.',
  } as const,
  'security-reviewer': {
    displayName: 'Sam the Security Reviewer',
    purpose:
      'Adversarial security review of file/path/process/auth/crypto changes. Spawn after security-sensitive edits to catch injection, traversal, secret leakage, and auth bypass risks.',
  } as const,
  debugger: {
    displayName: 'Dee the Debugger',
    purpose:
      'Root-causes a failing test, runtime error, or unexpected behavior by reading code + running targeted commands. Spawn when a validation failure needs diagnosis before a fix.',
  } as const,
  'doc-writer': {
    displayName: 'Doc the Doc Writer',
    purpose:
      'Writes or updates documentation (README, API docs, guides, code comments). Spawn when a change requires documentation updates.',
  } as const,
  'git-committer': {
    displayName: 'Mitt the Git Committer',
    purpose:
      'Commits code changes to git with a well-crafted commit message. Spawn when you need to stage and commit related changes with an appropriate message.',
  } as const,
  'dependency-manager': {
    displayName: 'Dependency Manager',
    purpose:
      'Runs an explicitly requested package-manager dependency mutation under a narrowly constrained terminal policy.',
  } as const,
  architect: {
    displayName: 'Architecture Specialist',
    purpose:
      'Produces source-backed architecture decisions and migration paths.',
  } as const,
  'product-reviewer': {
    displayName: 'Product and Spec Reviewer',
    purpose: 'Reviews requirements and user-facing acceptance criteria.',
  } as const,
  'integration-agent': {
    displayName: 'Integration Specialist',
    purpose: 'Plans safe integration ordering, conflicts, and revalidation.',
  } as const,
  'performance-specialist': {
    displayName: 'Performance Specialist',
    purpose: 'Evaluates profiling and benchmark evidence.',
  } as const,
  'reliability-reviewer': {
    displayName: 'Reliability and Concurrency Reviewer',
    purpose: 'Reviews races, retries, cancellation, and state machines.',
  } as const,
  'migration-reviewer': {
    displayName: 'Data and Migration Reviewer',
    purpose: 'Reviews migrations, backfills, compatibility, and rollback.',
  } as const,
  'accessibility-reviewer': {
    displayName: 'Accessibility Reviewer',
    purpose:
      'Reviews keyboard, focus, semantics, contrast, and assistive technology behavior.',
  } as const,
  'ux-visual-reviewer': {
    displayName: 'UX and Visual Reviewer',
    purpose:
      'Reviews visual hierarchy, responsive behavior, and interaction consistency.',
  } as const,
  'compatibility-reviewer': {
    displayName: 'API Compatibility Reviewer',
    purpose:
      'Reviews public API, serialization, CLI, and config compatibility.',
  } as const,
  'dependency-reviewer': {
    displayName: 'Dependency and Supply-Chain Reviewer',
    purpose:
      'Reviews dependency necessity, provenance, licenses, and lockfiles.',
  } as const,
  'incident-coordinator': {
    displayName: 'Incident and Debug Coordinator',
    purpose:
      'Coordinates incident timelines, hypotheses, and diagnostic probes.',
  } as const,
  'release-manager': {
    displayName: 'Release Manager',
    purpose: 'Plans authorized release, CI, artifact, and rollback workflows.',
  } as const,
  'docs-architect': {
    displayName: 'Documentation Architect',
    purpose:
      'Designs documentation structure, versioning, cross-links, and coverage.',
  } as const,
  evaluator: {
    displayName: 'Independent Evaluator',
    purpose: 'Scores outputs independently against requirements and evidence.',
  } as const,
} as const satisfies Record<
  string,
  { displayName: string; purpose: string; hidden?: boolean }
>

// Agent IDs list from AGENT_PERSONAS keys
export const AGENT_IDS = Object.keys(
  AGENT_PERSONAS,
) as (keyof typeof AGENT_PERSONAS)[]

// Agent ID prefix constant
export const AGENT_ID_PREFIX = 'CodebuffAI/'

// Agent names for client-side reference
export const AGENT_NAMES = Object.fromEntries(
  Object.entries(AGENT_PERSONAS).map(([agentType, persona]) => [
    agentType,
    persona.displayName,
  ]),
) as Record<keyof typeof AGENT_PERSONAS, string>

export type AgentName =
  (typeof AGENT_PERSONAS)[keyof typeof AGENT_PERSONAS]['displayName']

// Get unique agent names for UI display
export const UNIQUE_AGENT_NAMES = Array.from(
  new Set(
    Object.values(AGENT_PERSONAS)
      .filter((persona) => !('hidden' in persona) || !persona.hidden)
      .map((persona) => persona.displayName),
  ),
)

// Map from display name back to agent types (for parsing user input)
export const AGENT_NAME_TO_TYPES = Object.entries(AGENT_NAMES).reduce(
  (acc, [type, name]) => {
    if (!acc[name]) acc[name] = []
    acc[name].push(type)
    return acc
  },
  {} as Record<string, string[]>,
)

/**
 * Sentinel used when no explicit maxAgentSteps cap is configured. Productive
 * runs are unlimited by default; repeated identical steps are handled by the
 * runtime loop watchdog instead of an unconditional counter.
 */
export const MAX_AGENT_STEPS_DEFAULT = -1

/**
 * Maximum nesting depth for subagent spawning. The root orchestrator runs at
 * depth 0; each spawn_agents dispatch increments the child's depth by 1.
 * Default 3 permits: root -> specialist -> leaf tool-runner. Configurable via
 * openbuff.json (`maxSpawnDepth`). A spawn that would exceed this depth is
 * rejected with an actionable error before any work begins, preventing
 * unbounded recursion (e.g. file-picker -> file-picker -> ...).
 */
export const MAX_SPAWN_DEPTH_DEFAULT = 3

/** Maximum sibling agents accepted by one spawn_agents call. */
export const MAX_SPAWN_BATCH_SIZE = 8
