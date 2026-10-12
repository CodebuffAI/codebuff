/**
 * The workspace profiler: a read-only agent that looks over a project and fills
 * in the backend's workspace-profile template (docs/freebuff-workspace-profile.md).
 *
 * Built at runtime from the template the backend served, so the sections it
 * fills in (and the output schema it is held to) change with a web deploy.
 * Everything that makes a request recognisably the profiler is fixed here and
 * mirrored on the server: the agent id, the one model, the opening of the
 * system prompt (FREEBUFF_ROOT_SYSTEM_PROMPT_OPENINGS and root-prompt-shape.ts)
 * and the tools (subagent-prompt-gate.ts). Change one and the other in the same
 * PR, or the completions route refuses every profile.
 */
import {
  FREEBUFF_WORKSPACE_PROFILER_AGENT_ID,
  FREEBUFF_WORKSPACE_PROFILER_MODEL_ID,
} from '../constants/free-agents'
import { buildWorkspaceProfileOutputSchema } from './template'

import type { WorkspaceStats } from './stats'
import type { WorkspaceProfileTemplate } from './template'
import type { AgentDefinition } from '../templates/initial-agents-dir/types/agent-definition'

/** The profiler's first sentence, at position 0 of its system prompt. */
export const WORKSPACE_PROFILER_OPENING =
  'You are Buffy, the workspace profiler behind Freebuff.'

/** The sentence that follows it (root-prompt-shape.ts pins the pair). */
export const WORKSPACE_PROFILER_CONTINUATION =
  'You look over the project you are pointed at and fill in a profile of it.'

/** Every tool the profiler offers its model. Read-only by construction: it can
 *  look at the project and report, nothing else. */
export const WORKSPACE_PROFILER_TOOL_NAMES = [
  'list_directory',
  'glob',
  'read_files',
  'code_search',
  'set_output',
] as const

/** Steps a profile may take: two programmatic, then a few rounds of reading. */
export const WORKSPACE_PROFILER_MAX_AGENT_STEPS = 12

/** The answer is one `set_output` call, and the model does not reason. */
export const WORKSPACE_PROFILER_MAX_OUTPUT_TOKENS = 4_096

const SYSTEM_PROMPT = `${WORKSPACE_PROFILER_OPENING} ${WORKSPACE_PROFILER_CONTINUATION}

You never edit files, run commands or talk to the user. You read just enough of the project to fill in each section from evidence, then call set_output once with the whole profile and stop.

How to work:
- Start from what is already listed: the top-level directory and the manifest and config files found for you.
- Read the files that settle a field: package manifests and lockfiles, build and deploy configuration (Dockerfile, docker-compose, vercel.json, netlify.toml, fly.toml, render.yaml, wrangler.toml, app.json/eas.json, serverless and Terraform files, CI workflows), database schemas and ORM configuration, and a README if one exists.
- Read several files in one read_files call. Do not read source files one by one to guess at a field; a manifest or config file is better evidence.
- Never read .env files or anything that holds secrets. An .env.example is fine.
- Answer only from what you saw. When nothing you read settles a field, answer "unknown" (or [] for a list). A guess is worse than unknown.
- Use the names offered for a field wherever one fits. Use official product names, never file paths, people's names or anything copied from the code.
- Look for the project's own deployment. A dependency on a hosting SDK alone does not mean the app is deployed there.`

function describeStats(stats: WorkspaceStats): string {
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

function describeTemplate(template: WorkspaceProfileTemplate): string {
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

export function buildWorkspaceProfilerPrompt(params: {
  template: WorkspaceProfileTemplate
  stats: WorkspaceStats
}): string {
  return [
    'Fill in this workspace profile for the project in the current directory.',
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
export function buildWorkspaceProfilerAgent(
  template: WorkspaceProfileTemplate,
): AgentDefinition {
  return {
    id: FREEBUFF_WORKSPACE_PROFILER_AGENT_ID,
    displayName: 'Workspace profiler',
    model: FREEBUFF_WORKSPACE_PROFILER_MODEL_ID,
    reasoningOptions: { enabled: false, effort: 'none', exclude: true },
    maxOutputTokens: WORKSPACE_PROFILER_MAX_OUTPUT_TOKENS,
    outputMode: 'structured_output',
    outputSchema: buildWorkspaceProfileOutputSchema(template),
    includeMessageHistory: false,
    windowedFileReads: true,
    spawnableAgents: [],
    toolNames: ['list_directory', 'glob', 'read_files', 'code_search', 'set_output'],
    systemPrompt: SYSTEM_PROMPT,
    // Two programmatic steps put the top level and the usual manifest and
    // config files in front of the model before its first call, which is most
    // of what a profile needs. Self-contained: the runtime evals this source.
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
      yield 'STEP_ALL'
    },
  }
}
