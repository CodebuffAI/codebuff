/**
 * Phase-aware status label utility.
 * Maps active agent types to human-readable status labels for the status bar.
 */

const AGENT_TYPE_LABELS: Array<{ pattern: string; label: string }> = [
  { pattern: 'file-picker', label: 'gathering context...' },
  { pattern: 'code-searcher', label: 'searching codebase...' },
  { pattern: 'researcher-web', label: 'searching the web...' },
  { pattern: 'researcher-docs', label: 'reading documentation...' },
  { pattern: 'editor-implementor-proposal', label: 'generating proposals...' },
  { pattern: 'editor', label: 'editing...' },
  { pattern: 'code-reviewer', label: 'reviewing changes...' },
  { pattern: 'thinker', label: 'planning...' },
  { pattern: 'basher', label: 'running commands...' },
  { pattern: 'directory-lister', label: 'exploring files...' },
  { pattern: 'glob-matcher', label: 'finding files...' },
  { pattern: 'context-pruner', label: 'pruning context...' },
]

/**
 * Derive a human-readable status label from the set of active agent types.
 * Falls back to "working..." when no specific agent activity is recognized.
 */
export function getPhaseLabel(activeAgentTypes: Set<string>): string {
  if (activeAgentTypes.size === 0) return 'working...'

  const matched: string[] = []
  for (const agentType of activeAgentTypes) {
    for (const { pattern, label } of AGENT_TYPE_LABELS) {
      if (agentType.includes(pattern)) {
        if (!matched.includes(label)) {
          matched.push(label)
        }
        break
      }
    }
  }

  if (matched.length === 0) return 'working...'
  if (matched.length === 1) return matched[0]
  if (matched.length === 2) return `${matched[0]} + ${matched[1]}`
  return `${matched[0]} + ${matched.length - 1} others...`
}
