import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import type { JudgingResult } from './judge'

export interface DocSuggestion {
  reasoning: string
  suggestedDocPath: string // relative to docs/, e.g. "coding-patterns/error-handling.md"
  suggestedContent: string
}

const DOC_WRITER_SYSTEM_PROMPT = `You are an expert at writing developer documentation that helps AI coding agents perform better.

Your job: Given a coding agent's failure on a task, write a targeted documentation file that would prevent this class of error in the future.

## Rules

1. Be SPECIFIC and ACTIONABLE. Reference concrete file paths, function names, and patterns from the codebase.
2. Do NOT write generic advice like "follow best practices" or "write clean code."
3. Focus on the GAP between what the agent did and what it should have done.
4. Write docs that a coding agent will read and immediately know what to do differently.
5. Keep docs concise — under 200 lines. Dense information beats verbose explanations.
6. Use a logical file path that groups related docs together (e.g., "patterns/", "conventions/", "architecture/").
7. Include examples of correct patterns from the codebase when possible.

## Output Format

You MUST respond with ONLY a JSON object (no markdown fences, no explanation). The JSON must have exactly these fields:
{
  "reasoning": "Why this doc would help",
  "suggestedDocPath": "path/relative/to/docs/dir.md",
  "suggestedContent": "The markdown content"
}`

/**
 * Analyze a failure and suggest a doc edit to prevent it.
 * Uses Claude CLI to generate suggestions.
 * Returns null if score is above threshold (no improvement needed).
 */
export async function analyzeFailure({
  judgeResult,
  taskPrompt,
  agentDiff,
  groundTruthDiff,
  currentDocs,
  scoreThreshold,
}: {
  judgeResult: JudgingResult
  taskPrompt: string
  agentDiff: string
  groundTruthDiff: string
  currentDocs: Record<string, string>
  scoreThreshold: number
  client?: unknown // kept for backwards compat, ignored
}): Promise<DocSuggestion | null> {
  if (judgeResult.overallScore >= scoreThreshold) {
    return null
  }

  const docsContent = Object.entries(currentDocs)
    .map(([docPath, content]) => `### ${docPath}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n')

  const prompt = `${DOC_WRITER_SYSTEM_PROMPT}

## Task Prompt
${taskPrompt}

## Judge Analysis
${judgeResult.analysis}

## Judge Weaknesses Found
${judgeResult.weaknesses.map((w) => `- ${w}`).join('\n')}

## Ground Truth (what should have been done)
\`\`\`diff
${groundTruthDiff}
\`\`\`

## Agent's Changes (what was actually done)
\`\`\`diff
${agentDiff || '(No changes made)'}
\`\`\`

## Current Docs (already available to the agent)
${docsContent || '(No docs yet)'}

Based on the gap between what the agent did and what it should have done, write a doc file that would help the agent get it right next time. Focus on the specific weakness identified by the judge.

Respond with ONLY the JSON object.`

  try {
    // Write prompt to temp file to avoid CLI arg length limits
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-docwriter-'))
    const promptFile = path.join(tmpDir, 'DOC_WRITER_PROMPT.md')
    fs.writeFileSync(promptFile, prompt)

    let output: string
    try {
      output = execSync(
        `claude --dangerously-skip-permissions -p "Read the file ${promptFile} and follow all instructions in it. Respond with ONLY the JSON object as specified."`,
        {
          encoding: 'utf-8',
          timeout: 5 * 60 * 1000,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024,
        },
      ).trim()
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }

    // Try to extract JSON from the output
    let jsonStr = output
    // Strip markdown code fences if present
    const jsonMatch = output.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    // Try to find a JSON object
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!objMatch) {
      console.error('Doc writer did not return JSON')
      return null
    }

    const value = JSON.parse(objMatch[0]) as DocSuggestion

    // Validate the path is under docs/
    if (
      value.suggestedDocPath.startsWith('/') ||
      value.suggestedDocPath.includes('..')
    ) {
      console.error(
        `Doc writer suggested invalid path: ${value.suggestedDocPath}`,
      )
      return null
    }

    if (!value.reasoning || !value.suggestedDocPath || !value.suggestedContent) {
      console.error('Doc writer returned incomplete suggestion')
      return null
    }

    return value
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
  // Validate path is under docs/
  if (docPath.startsWith('/') || docPath.includes('..')) {
    console.error(`Rejected doc path outside docs/: ${docPath}`)
    return false
  }

  const fullDocPath = path.join(repoPath, 'docs', docPath)
  const fullAgentsMdPath = agentsMdPath || path.join(repoPath, 'AGENTS.md')

  try {
    // Create directory structure
    fs.mkdirSync(path.dirname(fullDocPath), { recursive: true })

    // Check if this is a new file (for AGENTS.md update)
    const isNew = !fs.existsSync(fullDocPath)

    // Write the doc file
    fs.writeFileSync(fullDocPath, content)

    // Update AGENTS.md if new file
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
 * Compare scores to determine if a doc edit improved things.
 */
export function compareScores(
  oldScore: number,
  newScore: number,
): 'improved' | 'same' | 'worse' {
  if (newScore > oldScore) return 'improved'
  if (newScore < oldScore) return 'worse'
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
