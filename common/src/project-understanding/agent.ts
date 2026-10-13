/**
 * The project-understanding agent: a read-only agent that looks over a project and fills
 * in the backend's project-understanding template (docs/freebuff-project-understanding.md).
 *
 * Built at runtime from the template the backend served, so the sections it
 * fills in (and the output schema it is held to) change with a web deploy.
 * Everything that makes a request recognisably the project-understanding agent is fixed here and
 * mirrored on the server: the agent id, the one model, the opening of the
 * system prompt (FREEBUFF_ROOT_SYSTEM_PROMPT_OPENINGS and root-prompt-shape.ts)
 * and the tools (subagent-prompt-gate.ts). Change one and the other in the same
 * PR, or the completions route refuses every profile.
 */
import {
  FREEBUFF_PROJECT_UNDERSTANDING_AGENT_ID,
  FREEBUFF_PROJECT_UNDERSTANDING_MODEL_ID,
} from '../constants/free-agents'
import { buildProjectUnderstandingOutputSchema } from './template'

import type { ProjectStats } from './stats'
import type { ProjectUnderstandingTemplate } from './template'
import type { AgentDefinition } from '../templates/initial-agents-dir/types/agent-definition'

/** The project-understanding agent's first sentence, at position 0 of its system prompt. */
export const PROJECT_UNDERSTANDING_OPENING =
  'You are Buffy, the project-understanding agent behind Freebuff.'

/** The sentence that follows it (root-prompt-shape.ts pins the pair). */
export const PROJECT_UNDERSTANDING_CONTINUATION =
  'You look over the project you are pointed at and fill in an understanding of it.'

/** Every tool the project-understanding agent offers its model. Read-only by construction: it can
 *  look at the project and report, nothing else. No `code_search`: its `cwd`
 *  and flags can name any path, so it cannot be held to the project the way
 *  the clients hold these three (docs/freebuff-project-understanding.md). */
export const PROJECT_UNDERSTANDING_TOOL_NAMES = [
  'list_directory',
  'glob',
  'read_files',
  'set_output',
] as const

/**
 * Rounds of reading the model gets before it is told to answer. Every round
 * resends the whole conversation, so this is the cost knob: the first live run
 * on a large monorepo spent 12 rounds (~500k input tokens) reading and never
 * answered. handleSteps hard-codes the same number (it is eval'd, so it cannot
 * close over this); a test pins the two together.
 */
export const PROJECT_UNDERSTANDING_READING_ROUNDS = 4

/** The run's step ceiling: the reading rounds, the forced answer, headroom. */
export const PROJECT_UNDERSTANDING_MAX_AGENT_STEPS = 8

/** Told to the model after its reading rounds, if it has not answered yet. */
export const PROJECT_UNDERSTANDING_ANSWER_NOW =
  'Stop reading now. Call set_output with the complete profile from what you have already seen. Answer "unknown" (or [] for a list) for anything you have no evidence for.'

/** The answer is one `set_output` call, and the model does not reason. */
export const PROJECT_UNDERSTANDING_MAX_OUTPUT_TOKENS = 4_096

/**
 * What the project-understanding agent's model (GPT-6 Luna) costs, in US
 * dollars per million tokens, so a client can estimate a run's model cost from
 * its token usage.
 *
 * OpenAI's STANDARD tier list prices. Luna is served through OpenRouter on
 * OpenAI's flex tier first, which is exactly half of standard on every term,
 * with standard behind it (FREEBUFF_GPT_6_LUNA_UPSTREAM_ORDER, whose comment
 * documents both cards), so on OpenAI's endpoints the estimate is an upper
 * bound and the usual bill is about half of it. (OpenRouter's fallback may
 * still land on a dearer endpoint, e.g. Bedrock at ~1.1x standard; the hard
 * ceiling is FREEBUFF_GPT_6_LUNA_MAX_PRICE, which OpenRouter enforces by
 * refusing to route above it.) There is no server-side Luna rate card to pin
 * this to: OpenRouter reports each request's cost itself. agent-cost.test.ts
 * pins it to the documented list and under that ceiling.
 */
export const PROJECT_UNDERSTANDING_MODEL_PRICE_PER_MILLION_USD = {
  input: 0.1,
  cachedInput: 0.01,
  output: 0.5,
} as const

/**
 * Estimated model cost of a profile at the card above, in US dollars. `inputTokens` INCLUDES
 * `cachedInputTokens` (as providers report prompt tokens): fresh input is the
 * difference. Negative or missing counts read as zero, and cached tokens are
 * clamped to the input they are part of.
 */
export function estimateProjectUnderstandingCostUsd(usage: {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}): number {
  const count = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)
  const input = count(usage.inputTokens)
  const cached = Math.min(count(usage.cachedInputTokens), input)
  const output = count(usage.outputTokens)
  const price = PROJECT_UNDERSTANDING_MODEL_PRICE_PER_MILLION_USD
  return (
    ((input - cached) * price.input +
      cached * price.cachedInput +
      output * price.output) /
    1_000_000
  )
}

const SYSTEM_PROMPT = `${PROJECT_UNDERSTANDING_OPENING} ${PROJECT_UNDERSTANDING_CONTINUATION}

You never edit files, run commands or talk to the user. You read just enough of the project to fill in each section from evidence, then call set_output once with the whole profile and stop.

How to work:
- Start from what is already listed: the top-level directory and the manifest and config files found for you.
- Read the files that settle a field: package manifests and lockfiles, build and deploy configuration (Dockerfile, docker-compose, vercel.json, netlify.toml, fly.toml, render.yaml, wrangler.toml, app.json/eas.json, serverless and Terraform files, CI workflows), database schemas and ORM configuration, and a README if one exists.
- You get a few rounds of reading, then you must answer. Read in batches: put every file you want into one read_files call per round. Do not read source files to guess at a field; a manifest or config file is better evidence.
- In a monorepo, read the root manifest and two or three representative packages, not every package. The glob results already tell you which packages, apps and tools exist.
- Never read .env files or anything that holds secrets. An .env.example is fine.
- Read only text files inside the project. Images, PDFs, archives, office documents, media, fonts, binaries and databases are refused, so do not ask for them.
- Answer only from what you saw. When nothing you read settles a field, answer "unknown" (or [] for a list). A guess is worse than unknown.
- Use the names offered for a field wherever one fits. Use official product names, never file paths, people's names or anything copied from the code.
- Look for the project's own deployment. A dependency on a hosting SDK alone does not mean the app is deployed there.`

function describeStats(stats: ProjectStats): string {
  const files = `${stats.fileCount}${stats.fileCountIsLowerBound ? '+' : ''}`
  const lines = `${stats.codeLineCount}${stats.lineCountIsLowerBound ? '+' : ''}`
  const languages = stats.languages
    .filter((language) => language.kind !== 'prose')
    .slice(0, 10)
    .map((language) => `${language.name} (${language.files} files)`)
    .join(', ')
  return [
    `Counted for you (already recorded; do not recount): ${files} files, ${lines} lines of code, ${stats.testFileCount} test files.`,
    `Languages by size: ${languages || '(none recognised)'}.`,
  ].join('\n')
}

function describeTemplate(template: ProjectUnderstandingTemplate): string {
  return template.sections
    .map((section) => {
      const fields = section.fields.map((field) => {
        const guidance = field.guidance ? ` ${field.guidance}` : ''
        const options =
          field.kind === 'choice' || field.kind === 'choices'
            ? ` Options: ${field.options.join(', ')}.`
            : ''
        return `  - ${field.key} (${field.kind}): ${field.label}.${guidance}${options}`
      })
      const guidance = section.guidance ? `\n  ${section.guidance}` : ''
      return `${section.key}: ${section.title}${guidance}\n${fields.join('\n')}`
    })
    .join('\n\n')
}

export function buildProjectUnderstandingPrompt(params: {
  template: ProjectUnderstandingTemplate
  stats: ProjectStats
}): string {
  return [
    'Fill in this understanding of the project in the current directory.',
    '',
    describeStats(params.stats),
    '',
    'The sections to fill in:',
    '',
    describeTemplate(params.template),
    '',
    'When you have read enough, call set_output with one object per section, keyed as above.',
  ].join('\n')
}

/**
 * The agent definition for one profile. `template` is the one the backend
 * served; the model must answer in its shape.
 */
export function buildProjectUnderstandingAgent(
  template: ProjectUnderstandingTemplate,
): AgentDefinition {
  return {
    id: FREEBUFF_PROJECT_UNDERSTANDING_AGENT_ID,
    displayName: 'Project understanding',
    model: FREEBUFF_PROJECT_UNDERSTANDING_MODEL_ID,
    // Exactly what the Luna file helpers send (agents/file-explorer/): on
    // OpenAI `none` is reasoning off by itself. The completions route pins the
    // same value (subagent-prompt-gate.ts).
    reasoningOptions: { effort: 'none', exclude: true },
    maxOutputTokens: PROJECT_UNDERSTANDING_MAX_OUTPUT_TOKENS,
    outputMode: 'structured_output',
    outputSchema: buildProjectUnderstandingOutputSchema(template),
    includeMessageHistory: false,
    windowedFileReads: true,
    spawnableAgents: [],
    toolNames: ['list_directory', 'glob', 'read_files', 'set_output'],
    systemPrompt: SYSTEM_PROMPT,
    // Two programmatic steps put the top level and the usual manifest and
    // config files in front of the model before its first call, which is most
    // of what a profile needs. Self-contained: the runtime evals this source.
    // The answer-now message is added programmatically, so add_message is
    // never offered to the model and the gate's tool set is unchanged.
    handleSteps: function* () {
      yield { toolName: 'list_directory', input: { path: '.' } }
      yield {
        toolName: 'glob',
        input: {
          pattern:
            '**/{package.json,pnpm-workspace.yaml,turbo.json,nx.json,pyproject.toml,requirements*.txt,Pipfile,setup.py,Cargo.toml,go.mod,Gemfile,composer.json,pom.xml,build.gradle*,*.csproj,pubspec.yaml,Package.swift,Podfile,mix.exs,deno.json*,Dockerfile*,docker-compose*.y*ml,compose*.y*ml,vercel.json,netlify.toml,fly.toml,render.yaml,railway.json,wrangler.toml,app.json,eas.json,firebase.json,serverless.y*ml,Procfile,*.tf,schema.prisma,drizzle.config.*,supabase/config.toml,convex.json,alembic.ini,.env.example,.github/workflows/*.y*ml,.gitlab-ci.yml}',
          max_results: 200,
        },
      }
      // A few rounds of reading, then answer. Literals, not the constants:
      // the runtime evals this source, so it cannot see this module's scope.
      for (let round = 0; round < 4; round++) {
        const { agentState, stepsComplete } = yield 'STEP'
        if (agentState.output) return
        if (stepsComplete) break
      }
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content:
            'Stop reading now. Call set_output with the complete profile from what you have already seen. Answer "unknown" (or [] for a list) for anything you have no evidence for.',
        },
        includeToolCall: false,
      }
      yield 'STEP'
    },
  }
}
