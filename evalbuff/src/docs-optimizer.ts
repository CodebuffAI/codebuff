import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { compressTrace, cleanupTraceDir } from './trace-compressor'

import type { JudgingResult } from './judge'

export interface DocSuggestion {
  reasoning: string
  suggestedDocPath: string // relative to docs/, e.g. "coding-patterns/error-handling.md"
  suggestedContent: string
}

const DOC_WRITER_SYSTEM_PROMPT = `You are an expert at writing developer documentation that helps AI coding agents perform better.

Your job: Given the results of an AI coding agent's attempt at a task, write a targeted documentation file that would help the agent perform better on FUTURE tasks — not just this specific one.

## Critical Rule: Genericity

The docs you write must be **generic enough to be useful across many future tasks**, not solely useful for the specific task that was just attempted. Think about:
- What general PATTERN does this failure reveal?
- What CONVENTION or ARCHITECTURE knowledge would prevent a whole class of similar errors?
- What would a senior developer tell a new team member on their first day?

DO NOT write docs that only help with one specific task. If the failure is too task-specific and doesn't reveal a general pattern, respond with: {"skip": true, "reasoning": "Too task-specific to generalize"}

## Using the Agent Trace

You may be given the agent's trace (stdout) showing its reasoning process, tool calls, and decisions. This is the most valuable signal — it shows you WHY the agent went wrong, not just WHAT it got wrong. Look for:
- **Wrong assumptions** about the codebase structure or conventions
- **Misunderstood patterns** — the agent tried something that doesn't match how this codebase works
- **Missing context** — the agent didn't know about a key file, config, or convention
- **Wrong approach** — the agent took a fundamentally different approach than needed

The trace shows the full agent reasoning inline, but large tool results (file contents, command output) have been extracted to separate files. You'll see markers like:
  [Stored in: /tmp/evalbuff-traces-xxx/result-003.txt (2847 chars) — file content, 84 lines]
You can read these files if you need the full content to understand what the agent saw.

Write docs that address the ROOT CAUSE visible in the trace, not just the symptom visible in the diff.

## Rules

1. Be SPECIFIC and ACTIONABLE. Reference concrete file paths, function names, and patterns from the codebase.
2. Do NOT write generic advice like "follow best practices" or "write clean code."
3. Focus on the general PATTERN behind the gap, not the specific gap itself.
4. Write docs that a coding agent will read and immediately know what to do differently on any similar task.
5. Keep docs concise — under 200 lines. Dense information beats verbose explanations.
6. Use a logical file path that groups related docs together (e.g., "patterns/", "conventions/", "architecture/").
7. Include examples of correct patterns from the codebase when possible.
8. If a doc already exists on a similar topic, suggest UPDATING it (use the same path) rather than creating a new one.

## Output Format

You MUST respond with ONLY a JSON object (no markdown fences, no explanation). The JSON must have exactly these fields:
{
  "reasoning": "Why this doc would help (referencing the general pattern, not just this task)",
  "suggestedDocPath": "path/relative/to/docs/dir.md",
  "suggestedContent": "The markdown content"
}

Or if too task-specific:
{"skip": true, "reasoning": "explanation"}`

function formatEditHistory(history?: DocEditHistoryEntry[]): string {
  if (!history || history.length === 0) return ''

  const lines = history.map((entry) => {
    const score =
      entry.scoreBefore != null && entry.scoreAfter != null
        ? ` (score: ${entry.scoreBefore.toFixed(1)} → ${entry.scoreAfter.toFixed(1)})`
        : ''
    return `- **${entry.outcome.toUpperCase()}**: \`${entry.path}\`${score}\n  Reasoning: ${entry.reasoning}`
  })

  return `## Edit History (previous doc edits tried this session)

Use this history to avoid repeating rejected approaches and to build on what worked.

${lines.join('\n')}`
}

/**
 * Analyze agent run results and suggest a doc edit to improve future performance.
 * Always analyzes — no score threshold check.
 * Returns null if the doc writer decides the failure is too task-specific to generalize.
 */
export interface DocEditHistoryEntry {
  path: string
  reasoning: string
  outcome: 'accepted' | 'rejected'
  scoreBefore?: number
  scoreAfter?: number
}

export async function analyzeFailure({
  judgeResult,
  taskPrompt,
  agentDiff,
  agentTrace,
  groundTruthDiff,
  currentDocs,
  editHistory,
}: {
  judgeResult: JudgingResult
  taskPrompt: string
  agentDiff: string
  agentTrace?: string // stdout from the agent — reasoning, tool calls, errors
  groundTruthDiff?: string // optional — not available in prompt mode
  currentDocs: Record<string, string>
  editHistory?: DocEditHistoryEntry[]
}): Promise<DocSuggestion | null> {
  const docsContent = Object.entries(currentDocs)
    .map(([docPath, content]) => `### ${docPath}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n')

  const groundTruthSection = groundTruthDiff
    ? `## Ground Truth (what should have been done)
\`\`\`diff
${groundTruthDiff}
\`\`\``
    : '## Ground Truth\n(Not available — judge should have tested the output directly)'

  // Compress agent trace: keep reasoning inline, extract large tool results to files
  // The doc writer agent can read those files if it needs the full content
  let compressed: ReturnType<typeof compressTrace> | null = null
  let traceSection = ''

  if (agentTrace) {
    const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-traces-'))
    compressed = compressTrace(agentTrace, traceDir)

    const resultFiles = fs.readdirSync(traceDir).filter((f) => f.endsWith('.txt'))

    traceSection = `## Agent Trace (reasoning, tool calls, and decisions)

This is the agent's stdout showing its reasoning process, tool calls, and decisions.
Large tool results have been extracted to separate files — you can read them if needed.
Look for: what the agent misunderstood, wrong assumptions it made, where it went off track.

${resultFiles.length > 0 ? `**${resultFiles.length} tool result(s) stored in ${traceDir}/** — read any file for full content.\n` : ''}
\`\`\`
${compressed.inline}
\`\`\``
  }

  const prompt = `${DOC_WRITER_SYSTEM_PROMPT}

## Task Prompt
${taskPrompt}

## Judge Analysis
${judgeResult.analysis}

## Judge Weaknesses Found
${judgeResult.weaknesses.map((w) => `- ${w}`).join('\n')}

## Judge Strengths Found
${judgeResult.strengths.map((s) => `- ${s}`).join('\n')}

## Overall Score: ${judgeResult.overallScore}/10

${groundTruthSection}

## Agent's Changes (what was actually done)
\`\`\`diff
${agentDiff || '(No changes made)'}
\`\`\`

${traceSection}

## Current Docs (already available to the agent)
${docsContent || '(No docs yet)'}

${formatEditHistory(editHistory)}

Based on the agent's trace (if available), the gap between what the agent did and what it should have done, and the judge's analysis, write a doc file that captures a GENERAL PATTERN that would help the agent across many similar tasks. Focus on what the agent MISUNDERSTOOD (visible in the trace) rather than just what it got wrong (visible in the diff). If this failure doesn't reveal a generalizable pattern, respond with {"skip": true, "reasoning": "..."}.

Respond with ONLY the JSON object.`

  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-docwriter-'))
    const promptFile = path.join(tmpDir, 'DOC_WRITER_PROMPT.md')
    fs.writeFileSync(promptFile, prompt)

    let output: string
    try {
      // IMPORTANT: Run in tmpDir to avoid Claude reading the repo's CLAUDE.md/AGENTS.md,
      // which can pollute the doc writer's analysis with unrelated project context.
      output = execSync(
        `claude --dangerously-skip-permissions -p "Read the file ${promptFile} and follow all instructions in it. Respond with ONLY the JSON object as specified."`,
        {
          cwd: tmpDir,
          encoding: 'utf-8',
          timeout: 5 * 60 * 1000,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024,
        },
      ).trim()
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      // Clean up trace files after doc writer is done
      if (compressed) {
        cleanupTraceDir(compressed.traceDir)
      }
    }

    // Try to extract JSON from the output
    let jsonStr = output
    const jsonMatch = output.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!objMatch) {
      console.error('Doc writer did not return JSON')
      return null
    }

    const value = JSON.parse(objMatch[0])

    // Check if the doc writer decided to skip
    if (value.skip) {
      console.log(`Doc writer skipped: ${value.reasoning}`)
      return null
    }

    const suggestion = value as DocSuggestion

    // Validate the path is under docs/
    if (
      suggestion.suggestedDocPath.startsWith('/') ||
      suggestion.suggestedDocPath.includes('..')
    ) {
      console.error(
        `Doc writer suggested invalid path: ${suggestion.suggestedDocPath}`,
      )
      return null
    }

    if (!suggestion.reasoning || !suggestion.suggestedDocPath || !suggestion.suggestedContent) {
      console.error('Doc writer returned incomplete suggestion')
      return null
    }

    return suggestion
  } catch (error) {
    console.error('Doc writer failed:', error)
    return null
  }
}

/**
 * Apply a doc edit to a repo — writes the file and updates AGENTS.md TOC.
 */
export function applyDocEdit(
  repoPath: string,
  docPath: string,
  content: string,
  agentsMdPath?: string,
): boolean {
  if (docPath.startsWith('/') || docPath.includes('..')) {
    console.error(`Rejected doc path outside docs/: ${docPath}`)
    return false
  }

  const fullDocPath = path.join(repoPath, 'docs', docPath)
  const fullAgentsMdPath = agentsMdPath || path.join(repoPath, 'AGENTS.md')

  try {
    fs.mkdirSync(path.dirname(fullDocPath), { recursive: true })

    const isNew = !fs.existsSync(fullDocPath)
    fs.writeFileSync(fullDocPath, content)

    if (isNew) {
      let agentsMd = ''
      if (fs.existsSync(fullAgentsMdPath)) {
        agentsMd = fs.readFileSync(fullAgentsMdPath, 'utf-8')
      } else {
        agentsMd = '# Documentation\n\nTable of contents for project documentation.\n\n'
      }

      const entry = `- [docs/${docPath}](docs/${docPath})\n`
      if (!agentsMd.includes(`docs/${docPath}`)) {
        agentsMd += entry
        fs.writeFileSync(fullAgentsMdPath, agentsMd)
      }
    }

    return true
  } catch (error) {
    console.error(`Failed to apply doc edit: ${error}`)
    return false
  }
}

/**
 * Remove a doc edit from a repo — deletes the file and removes from AGENTS.md.
 */
export function revertDocEdit(
  repoPath: string,
  docPath: string,
  agentsMdPath?: string,
): boolean {
  const fullDocPath = path.join(repoPath, 'docs', docPath)
  const fullAgentsMdPath = agentsMdPath || path.join(repoPath, 'AGENTS.md')

  try {
    if (fs.existsSync(fullDocPath)) {
      fs.rmSync(fullDocPath)
    }

    // Remove from AGENTS.md
    if (fs.existsSync(fullAgentsMdPath)) {
      let agentsMd = fs.readFileSync(fullAgentsMdPath, 'utf-8')
      const entry = `- [docs/${docPath}](docs/${docPath})\n`
      if (agentsMd.includes(entry)) {
        agentsMd = agentsMd.replace(entry, '')
        fs.writeFileSync(fullAgentsMdPath, agentsMd)
      }
    }

    return true
  } catch (error) {
    console.error(`Failed to revert doc edit: ${error}`)
    return false
  }
}

/**
 * Compare scores to determine if a doc edit improved things.
 * Requires a minimum improvement of 0.3 points to count as "improved"
 * to avoid accepting docs based on noise (especially with low parallelism).
 */
const MIN_IMPROVEMENT_THRESHOLD = 0.3

export function compareScores(
  oldScore: number,
  newScore: number,
): 'improved' | 'same' | 'worse' {
  const delta = newScore - oldScore
  if (delta >= MIN_IMPROVEMENT_THRESHOLD) return 'improved'
  if (delta <= -MIN_IMPROVEMENT_THRESHOLD) return 'worse'
  return 'same'
}

/**
 * Read all docs from a repo's docs/ directory.
 */
export function readCurrentDocs(repoPath: string): Record<string, string> {
  const docsDir = path.join(repoPath, 'docs')
  const docs: Record<string, string> = {}

  if (!fs.existsSync(docsDir)) return docs

  function readDir(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        readDir(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      } else if (entry.name.endsWith('.md')) {
        const relPath = `${prefix}${entry.name}`
        docs[relPath] = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
      }
    }
  }

  readDir(docsDir, '')
  return docs
}
