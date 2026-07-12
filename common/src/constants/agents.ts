import type { AgentTemplateTypes } from '../types/session-state'

// Define agent personas with their shared characteristics
export const AGENT_PERSONAS = {
  // Base agents - all use Buffy persona
  base: {
    displayName: 'Buffy the Base Agent',
    purpose: 'Base agent that orchestrates the full response.',
  } as const,

  // Ask mode
  ask: {
    displayName: 'Ask Mode Agent',
    purpose: 'Base ask-mode agent that orchestrates the full response.',
  } as const,

  // Specialized agents
  thinker: {
    displayName: 'Theo the Theorizer',
    purpose:
      'Does deep thinking given the current messages and a specific prompt to focus on. Use this to help you solve a specific problem.',
  } as const,
  'file-explorer': {
    displayName: 'Dora The File Explorer',
    purpose: 'Expert at exploring a codebase and finding relevant files.',
  } as const,
  'file-picker': {
    displayName: 'Fletcher the File Fetcher',
    purpose: 'Expert at finding relevant files in a codebase.',
  } as const,
  researcher: {
    displayName: 'Reid Searcher the Researcher',
    purpose: 'Expert at researching topics using web search and documentation.',
  } as const,
  planner: {
    displayName: 'Peter Plan',
    purpose: 'Agent that formulates a comprehensive plan to a prompt.',
    hidden: true,
  } as const,
  reviewer: {
    displayName: 'Nit Pick Nick the Reviewer',
    purpose:
      'Reviews file changes and responds with critical feedback. Use this after making any significant change to the codebase; otherwise, no need to use this agent for minor changes since it takes a second.',
  } as const,
  'agent-builder': {
    displayName: 'Bob the Agent Builder',
    purpose: 'Creates new agent templates for the codebuff multi-agent system',
    hidden: false,
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
  architect: { displayName: 'Architecture Specialist', purpose: 'Produces source-backed architecture decisions and migration paths.' } as const,
  'product-reviewer': { displayName: 'Product and Spec Reviewer', purpose: 'Reviews requirements and user-facing acceptance criteria.' } as const,
  'integration-agent': { displayName: 'Integration Specialist', purpose: 'Plans safe integration ordering, conflicts, and revalidation.' } as const,
  'performance-specialist': { displayName: 'Performance Specialist', purpose: 'Evaluates profiling and benchmark evidence.' } as const,
  'reliability-reviewer': { displayName: 'Reliability and Concurrency Reviewer', purpose: 'Reviews races, retries, cancellation, and state machines.' } as const,
  'migration-reviewer': { displayName: 'Data and Migration Reviewer', purpose: 'Reviews migrations, backfills, compatibility, and rollback.' } as const,
  'accessibility-reviewer': { displayName: 'Accessibility Reviewer', purpose: 'Reviews keyboard, focus, semantics, contrast, and assistive technology behavior.' } as const,
  'ux-visual-reviewer': { displayName: 'UX and Visual Reviewer', purpose: 'Reviews visual hierarchy, responsive behavior, and interaction consistency.' } as const,
  'compatibility-reviewer': { displayName: 'API Compatibility Reviewer', purpose: 'Reviews public API, serialization, CLI, and config compatibility.' } as const,
  'dependency-reviewer': { displayName: 'Dependency and Supply-Chain Reviewer', purpose: 'Reviews dependency necessity, provenance, licenses, and lockfiles.' } as const,
  'incident-coordinator': { displayName: 'Incident and Debug Coordinator', purpose: 'Coordinates incident timelines, hypotheses, and diagnostic probes.' } as const,
  'release-manager': { displayName: 'Release Manager', purpose: 'Plans authorized release, CI, artifact, and rollback workflows.' } as const,
  'docs-architect': { displayName: 'Documentation Architect', purpose: 'Designs documentation structure, versioning, cross-links, and coverage.' } as const,
  evaluator: { displayName: 'Independent Evaluator', purpose: 'Scores outputs independently against requirements and evidence.' } as const,
} as const satisfies Partial<
  Record<
    (typeof AgentTemplateTypes)[keyof typeof AgentTemplateTypes],
    { displayName: string; purpose: string; hidden?: boolean }
  >
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

export const MAX_AGENT_STEPS_DEFAULT = 200

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
