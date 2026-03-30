import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { z } from 'zod/v4'

import { formatCriteriaForPrompt } from './criteria'

import type { QualityCriteria } from './criteria'
import type { EvalCommitV2 } from './types'

export const JudgingResultSchema = z.object({
  analysis: z
    .string()
    .describe('Detailed analysis of what was tested and found'),
  strengths: z
    .array(z.string())
    .describe('Key strengths of the implementation'),
  weaknesses: z.array(z.string()).describe('Key weaknesses or issues found'),
  e2eTestsPerformed: z
    .array(z.string())
    .describe('List of E2E tests that were actually performed'),
  completionScore: z
    .number()
    .min(0)
    .max(10)
    .describe('How completely the prompt was addressed'),
  codeQualityScore: z
    .number()
    .min(0)
    .max(10)
    .describe('Code structure and maintainability'),
  e2eScore: z
    .number()
    .min(0)
    .max(10)
    .describe('How well the change works when tested end-to-end'),
  overallScore: z.number().min(0).max(10).describe('Combined assessment'),
})

export type JudgingResult = z.infer<typeof JudgingResultSchema>

// --- Reviewer agent types ---

export type ReviewerAgentType = 'claude' | 'codex' | 'gemini'

interface ReviewerConfig {
  type: ReviewerAgentType
  command: string[]
  env?: Record<string, string>
  timeoutMs: number
}

const REVIEWER_CONFIGS: Record<ReviewerAgentType, ReviewerConfig> = {
  claude: {
    type: 'claude',
    command: [
      'claude',
      '-p',
      '__PROMPT__',
      '--dangerously-skip-permissions',
    ],
    timeoutMs: 30 * 60 * 1000,
  },
  codex: {
    type: 'codex',
    command: [
      'codex',
      'exec',
      '--full-auto',
      '-m',
      'gpt-5.1-codex',
      '__PROMPT__',
    ],
    timeoutMs: 30 * 60 * 1000,
  },
  gemini: {
    type: 'gemini',
    command: ['gemini', '--yolo', '-p', '__PROMPT__'],
    timeoutMs: 30 * 60 * 1000,
  },
}

const RESULT_FILE_NAME = 'evalbuff-review-result.json'

function buildReviewerPrompt(input: {
  commit?: EvalCommitV2
  taskPrompt: string
  contextFiles?: Record<string, string>
  agentDiff: string
  groundTruthDiff?: string
  error?: string
  criteria?: QualityCriteria
  docsDir?: string
}): string {
  const { commit, taskPrompt, contextFiles, agentDiff, groundTruthDiff, error, criteria, docsDir } = input

  const groundTruthSection = groundTruthDiff
    ? `## Ground Truth Changes (One valid implementation)
${groundTruthDiff}`
    : `## Ground Truth
No reference implementation is available. You must judge the agent's work solely by testing it end-to-end. Focus heavily on:
- Does it build and run?
- Does the feature actually work when you test it?
- Are there errors in the logs?
- Does it handle edge cases?`

  const contextFilesContent = contextFiles
    ? Object.entries(contextFiles)
        .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n')
    : ''

  // Legacy support: build ground truth from commit fileDiffs if no explicit groundTruthDiff
  const groundTruth = groundTruthDiff
    ? groundTruthSection
    : commit?.fileDiffs
      ? `## Ground Truth Changes (One valid implementation)\n${commit.fileDiffs
          .map(({ path: p, diff }) => `### ${p}\n\`\`\`diff\n${diff}\n\`\`\``)
          .join('\n\n')}`
      : groundTruthSection

  const criteriaText = criteria
    ? formatCriteriaForPrompt(criteria)
    : ''

  const docsSection = docsDir
    ? `\n## Project Docs\nRead the docs in the \`docs/\` directory and \`AGENTS.md\` for project-specific patterns and conventions before reviewing.\n`
    : ''

  return `You are a senior engineer performing a thorough code review with E2E testing.

## Your Mission

You have been given a coding task and an AI agent's attempt. Your job is to:

1. **Read the project docs** (if present) to understand conventions and patterns
2. **Review the agent's diff** ${groundTruthDiff || commit?.fileDiffs ? 'against the ground truth' : 'for correctness and completeness'}
3. **Actually test the changes** end-to-end:
   - Start the application if possible (check package.json for start/dev scripts)
   - Use browser tools, curl, or the appropriate client to exercise the feature
   - Check logs for errors
   - Test edge cases and error states
   - Take screenshots of UI changes if applicable
4. **Write your judgment** to a JSON file

## Important: You have full access to the repository and can run any commands.

Use whatever tools you need to verify the change actually works:
- Run the build/compile step
- Run the test suite
- Start the dev server
- Use browser tools to test the UI
- curl API endpoints
- Check logs
- Use tmux for long-running processes
- Any other verification method appropriate for the change

${docsSection}
## User Prompt (What the agent was asked to do)
${taskPrompt}

${contextFilesContent ? `## Context Files (from parent commit)\n${contextFilesContent}` : ''}

${groundTruth}

## Agent's Changes (What the agent actually did)
\`\`\`diff
${agentDiff || '(No changes made)'}
\`\`\`
${error ? `\n## Error Encountered During Agent Run\n${error}\n` : ''}
${criteriaText}

## Required Output

After your review and testing, write your judgment to the file \`${RESULT_FILE_NAME}\` in the current working directory. The JSON must have exactly this structure:

\`\`\`json
{
  "analysis": "Detailed analysis of what you tested and found...",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "e2eTestsPerformed": ["Started dev server and loaded /dashboard", "Submitted form with invalid email", "Checked network tab for API errors"],
  "completionScore": 7,
  "codeQualityScore": 8,
  "e2eScore": 6,
  "overallScore": 7
}
\`\`\`

All scores are 0-10. The e2eScore specifically measures how well the change works when actually tested, not just how the code looks.

IMPORTANT: You MUST write the result file. This is the only way your review gets recorded. Do it as your very last action.`
}

const PROMPT_FILE_NAME = 'EVALBUFF_REVIEW_PROMPT.md'

const BOOTSTRAP_PROMPT = `Read the file ${PROMPT_FILE_NAME} in the current directory and follow all instructions in it exactly. The file contains a code review task. After your review and testing, you MUST write your judgment to ${RESULT_FILE_NAME} as specified in the prompt file.`

async function runReviewerAgent(
  agentType: ReviewerAgentType,
  prompt: string,
  cwd: string,
  env?: Record<string, string>,
): Promise<JudgingResult | null> {
  const config = REVIEWER_CONFIGS[agentType]

  fs.writeFileSync(path.join(cwd, PROMPT_FILE_NAME), prompt)

  const args = config.command
    .slice(1)
    .map((a) => (a === '__PROMPT__' ? BOOTSTRAP_PROMPT : a))

  const cmd = config.command[0]

  console.log(`[Reviewer:${agentType}] Starting review in ${cwd}`)

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...config.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      console.warn(
        `[Reviewer:${agentType}] Timed out after ${config.timeoutMs / 1000}s`,
      )
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 5000)
    }, config.timeoutMs)

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      console.error(
        `[Reviewer:${agentType}] Failed to start: ${error.message}`,
      )
      resolve(null)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      console.log(
        `[Reviewer:${agentType}] Exited with code ${code}`,
      )
      if (code !== 0) {
        console.warn(
          `[Reviewer:${agentType}] stderr (last 1000 chars): ${stderr.slice(-1000)}`,
        )
        console.warn(
          `[Reviewer:${agentType}] stdout (last 500 chars): ${stdout.slice(-500)}`,
        )
      }

      const resultPath = path.join(cwd, RESULT_FILE_NAME)
      const result = parseResultFile(resultPath, agentType)

      if (result) {
        resolve(result)
        return
      }

      const extracted = extractJsonFromOutput(stdout, agentType)
      if (extracted) {
        resolve(extracted)
        return
      }

      console.warn(
        `[Reviewer:${agentType}] No result file or parseable output found`,
      )
      resolve(null)
    })
  })
}

function parseResultFile(
  resultPath: string,
  agentType: string,
): JudgingResult | null {
  try {
    if (!fs.existsSync(resultPath)) return null
    const raw = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
    const parsed = JudgingResultSchema.safeParse(raw)
    if (parsed.success) {
      console.log(
        `[Reviewer:${agentType}] Parsed result file successfully`,
      )
      return parsed.data
    }
    console.warn(
      `[Reviewer:${agentType}] Result file failed validation:`,
      parsed.error,
    )
    return salvagePartialResult(raw)
  } catch (error) {
    console.warn(
      `[Reviewer:${agentType}] Failed to parse result file:`,
      error,
    )
    return null
  }
}

function extractJsonFromOutput(
  output: string,
  agentType: string,
): JudgingResult | null {
  const jsonPatterns = [
    /```(?:json)?\s*\n({[\s\S]*?})\n\s*```/g,
    /(\{[^{}]*"overallScore"[^{}]*\})/g,
  ]

  for (const pattern of jsonPatterns) {
    const matches = [...output.matchAll(pattern)]
    for (let i = matches.length - 1; i >= 0; i--) {
      try {
        const raw = JSON.parse(matches[i][1])
        const parsed = JudgingResultSchema.safeParse(raw)
        if (parsed.success) {
          console.log(
            `[Reviewer:${agentType}] Extracted result from stdout`,
          )
          return parsed.data
        }
        const salvaged = salvagePartialResult(raw)
        if (salvaged) return salvaged
      } catch {
        continue
      }
    }
  }

  return null
}

function salvagePartialResult(raw: any): JudgingResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  if (typeof raw.overallScore !== 'number') return null

  return {
    analysis: raw.analysis || 'No analysis provided',
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses : [],
    e2eTestsPerformed: Array.isArray(raw.e2eTestsPerformed)
      ? raw.e2eTestsPerformed
      : [],
    completionScore:
      typeof raw.completionScore === 'number' ? raw.completionScore : raw.overallScore,
    codeQualityScore:
      typeof raw.codeQualityScore === 'number'
        ? raw.codeQualityScore
        : raw.overallScore,
    e2eScore:
      typeof raw.e2eScore === 'number' ? raw.e2eScore : raw.overallScore,
    overallScore: raw.overallScore,
  }
}

// --- Public API ---

export interface JudgeCommitResultInput {
  commit: EvalCommitV2
  contextFiles: Record<string, string>
  agentDiff: string
  repoDir: string
  error?: string
  criteria?: QualityCriteria
  reviewerAgents?: ReviewerAgentType[]
  env?: Record<string, string>
}

/**
 * Judge a commit result by running reviewer agents in the repo.
 * Each reviewer agent can read docs, run the app, test E2E, and write a result file.
 */
export async function judgeCommitResult(
  input: JudgeCommitResultInput,
): Promise<JudgingResult> {
  const {
    commit,
    contextFiles,
    agentDiff,
    repoDir,
    error,
    criteria,
    reviewerAgents = ['claude', 'codex'],
    env,
  } = input

  const prompt = buildReviewerPrompt({
    commit,
    taskPrompt: commit.prompt,
    contextFiles,
    agentDiff,
    error,
    criteria,
    docsDir: fs.existsSync(path.join(repoDir, 'docs')) ? repoDir : undefined,
  })

  return runReviewersAndAggregate(prompt, repoDir, reviewerAgents, env)
}

/**
 * Judge an agent's work on a task prompt — no ground truth commit needed.
 * Used for both commit-learning mode (with ground truth diff) and prompt mode (without).
 */
export interface JudgeTaskResultInput {
  taskPrompt: string
  agentDiff: string
  groundTruthDiff?: string
  repoDir: string
  error?: string
  criteria?: QualityCriteria
  reviewerAgents?: ReviewerAgentType[]
  env?: Record<string, string>
}

export async function judgeTaskResult(
  input: JudgeTaskResultInput,
): Promise<JudgingResult> {
  const {
    taskPrompt,
    agentDiff,
    groundTruthDiff,
    repoDir,
    error,
    criteria,
    reviewerAgents = ['claude', 'codex'],
    env,
  } = input

  const prompt = buildReviewerPrompt({
    taskPrompt,
    agentDiff,
    groundTruthDiff,
    error,
    criteria,
    docsDir: fs.existsSync(path.join(repoDir, 'docs')) ? repoDir : undefined,
  })

  return runReviewersAndAggregate(prompt, repoDir, reviewerAgents, env)
}

/**
 * Shared logic: run reviewer agents in parallel and aggregate results.
 */
async function runReviewersAndAggregate(
  prompt: string,
  repoDir: string,
  reviewerAgents: ReviewerAgentType[],
  env?: Record<string, string>,
): Promise<JudgingResult> {
  const reviewPromises = reviewerAgents.map(async (agentType) => {
    const reviewDir = `${repoDir}-review-${agentType}`
    try {
      const nodeModulesPath = path.join(repoDir, 'node_modules')
      const hasNodeModules = fs.existsSync(nodeModulesPath)
      if (hasNodeModules) {
        execSync(
          `rsync -a --exclude node_modules "${repoDir}/" "${reviewDir}/"`,
          { stdio: 'ignore' },
        )
        fs.symlinkSync(nodeModulesPath, path.join(reviewDir, 'node_modules'))
      } else {
        execSync(`cp -r "${repoDir}" "${reviewDir}"`, { stdio: 'ignore' })
      }
      return await runReviewerAgent(agentType, prompt, reviewDir)
    } finally {
      try {
        fs.rmSync(reviewDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    }
  })

  const results = await Promise.all(reviewPromises)
  const validResults = results.filter(
    (r): r is JudgingResult => r !== null,
  )

  if (validResults.length === 0) {
    console.error(
      `All reviewer agents failed (${reviewerAgents.join(', ')})`,
    )
    return {
      analysis: 'Error: all reviewer agents failed to provide results',
      strengths: [],
      weaknesses: ['All reviewer agents failed'],
      e2eTestsPerformed: [],
      completionScore: 0,
      codeQualityScore: 0,
      e2eScore: 0,
      overallScore: 0,
    }
  }

  // Use median for qualitative analysis (pick the most representative reviewer)
  // but average for scores. Averaging is better because models have consistent
  // scoring biases (e.g. GPT-5 scores lower) — median would always pick the
  // same model's score, while average blends them.
  const sorted = validResults.sort(
    (a, b) => a.overallScore - b.overallScore,
  )
  const medianIdx = Math.floor(sorted.length / 2)
  const medianResult = sorted[medianIdx]

  const avg = (key: keyof JudgingResult) =>
    validResults.reduce((sum, r) => sum + (r[key] as number), 0) /
    validResults.length

  const avgCompletionScore = avg('completionScore')
  const avgCodeQualityScore = avg('codeQualityScore')
  const avgE2eScore = avg('e2eScore')
  const avgOverallScore = avg('overallScore')

  const allE2eTests = [
    ...new Set(validResults.flatMap((r) => r.e2eTestsPerformed)),
  ]

  console.log(
    `Review results: overall=${avgOverallScore.toFixed(1)}, e2e=${avgE2eScore.toFixed(1)} (${validResults.length}/${reviewerAgents.length} reviewers)`,
  )

  return {
    analysis: medianResult.analysis,
    strengths: medianResult.strengths,
    weaknesses: medianResult.weaknesses,
    e2eTestsPerformed: allE2eTests,
    completionScore: avgCompletionScore,
    codeQualityScore: avgCodeQualityScore,
    e2eScore: avgE2eScore,
    overallScore: avgOverallScore,
  }
}
