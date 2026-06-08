import { createBase2 } from '../../../../../agents/base2/base2'
import basher from '../../../../../agents/basher'
import browserUse from '../../../../../agents/browser-use/browser-use'
import contextPruner from '../../../../../agents/context-pruner'
import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  DEFAULT_FREEBUFF_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'
import codeReviewerDeepseek from '../../../../../agents/reviewer/code-reviewer-deepseek'
import codeReviewerDeepseekFlash from '../../../../../agents/reviewer/code-reviewer-deepseek-flash'
import codeReviewerKimi from '../../../../../agents/reviewer/code-reviewer-kimi'
import codeReviewerLite from '../../../../../agents/reviewer/code-reviewer-lite'
import codeReviewerMinimax from '../../../../../agents/reviewer/code-reviewer-minimax'
import codeSearcher from '../../../../../agents/file-explorer/code-searcher'
import directoryLister from '../../../../../agents/file-explorer/directory-lister'
import fileLister from '../../../../../agents/file-explorer/file-lister'
import filePicker from '../../../../../agents/file-explorer/file-picker'
import globMatcher from '../../../../../agents/file-explorer/glob-matcher'
import researcherDocs from '../../../../../agents/researcher/researcher-docs'
import researcherWeb from '../../../../../agents/researcher/researcher-web'
import thinkerGpt from '../../../../../agents/thinker/thinker-gpt'
import thinkerWithFilesGemini from '../../../../../agents/thinker/thinker-with-files-gemini'
import tmuxCli from '../../../../../agents/tmux-cli'

import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

const FREEBUFF_WEB_SYSTEM_PROMPT_APPENDIX = `

# Freebuff Web Project Environment

These instructions are specific to Freebuff Web projects and override generic CLI assumptions when they conflict.

- All user codebase files live in \`/home/daytona/codebase/\`. Read and write project files from that directory.
- Ensure terminal commands run from \`/home/daytona/codebase/\` before inspecting, installing, typechecking, or editing project files.
- The default project template uses TypeScript, React, Vite, Convex for the backend/database, Convex Auth, shadcn/ui components, Tailwind CSS, Framer Motion, and Bun.
- Use Bun commands for installs and scripts unless the project clearly establishes another package manager.
- Convex is the backend and database. Use Convex queries/mutations/actions instead of adding another backend unless the user explicitly asks.
- Convex queries are reactive subscriptions, so avoid duplicating server state into unnecessary client state.
- The template already includes auth structure, auth pages, dashboard scaffolding, and related defaults. Prefer extending the existing auth/dashboard flow instead of rebuilding it.
- Keep implementations simple, concise, and maintainable. Make the fewest code changes that satisfy the user's request.
- Prefer editing existing files/routes/components over creating unnecessary new pages or duplicate structures.
- Do not edit .env files. The user manages secrets through the Keys/API keys UI.
- Do not modify \`vite.config.ts\` or Vite dev-server/HMR configuration unless the user explicitly asks. Freebuff requires HMR to remain disabled; preserve \`server.hmr: false\` and never add \`hmr: true\`, an \`hmr: { ... }\` object, or duplicate HMR settings.
- For file edits, use the Freebuff/Vly Daytona file tools such as \`write_file\`, \`str_replace\`, or \`apply_patch\`. Do not use \`sed\`, shell redirection, or ad-hoc bash scripts to modify files, because those can fail to persist through the Vly-synced build state.
- When running terminal commands, use them for inspection, installs, dev checks, or tests only; avoid terminal commands that mutate source files.

# Freebuff Web Product Expectations

- Always implement a visually stunning, unique landing page that follows a specific theme aligned with the user's project idea.
- Make sure the \`/\` landing page is edited and visibly improved for new app-building requests.
- The landing page should connect clearly to auth and the dashboard, with calls to action that guide users into sign-in/sign-up and the authenticated experience.
- Focus on beautifully themed projects: strong visual hierarchy, cohesive colors, polished spacing, responsive layouts, thoughtful hover states, and tasteful motion.
- Use shadcn/ui and Tailwind idiomatically. Reuse existing components and project conventions before adding new abstractions.
- Build complete landing pages with expected sections such as hero, features, social proof or examples, calls to action, and a clear path into the product. Avoid placeholder copy and generic layouts.
- Apply a specific visual theme via existing styling conventions (often \`src/index.css\` plus Tailwind classes). Avoid generic purple/pink gradients, dated primary colors, cramped spacing, and stock-looking sections.
- Keep components focused and readable. Extract repeated UI patterns only when it clearly reduces duplication.
`.trim()

function withFreebuffWebSystemPromptAppendix(
  agent: AgentDefinition,
): AgentDefinition {
  return {
    ...agent,
    systemPrompt: [agent.systemPrompt, FREEBUFF_WEB_SYSTEM_PROMPT_APPENDIX]
      .filter(Boolean)
      .join('\n\n'),
  }
}

const base2Free = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', { noReview: true }),
  id: 'base2-free',
  displayName: 'Buffy the Free Orchestrator',
})

const base2FreeDeepseek = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-deepseek',
  displayName: 'Buffy the DeepSeek Free Orchestrator',
})

const base2FreeDeepseekFlash = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-deepseek-flash',
  displayName: 'Buffy the DeepSeek Flash Free Orchestrator',
})

const base2FreeKimi = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_KIMI_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-kimi',
  displayName: 'Buffy the Kimi Free Orchestrator',
})

const base2FreeMimo = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_MIMO_V25_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-mimo',
  displayName: 'Buffy the MiMo Free Orchestrator',
})

const base2FreeMimoPro = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-mimo-pro',
  displayName: 'Buffy the MiMo Pro Free Orchestrator',
})

const base2FreeMinimax = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_MINIMAX_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-minimax',
  displayName: 'Buffy the MiniMax Free Orchestrator',
})

const base2FreeMinimaxM3 = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_MINIMAX_M3_MODEL_ID,
    noReview: true,
  }),
  id: 'base2-free-minimax-m3',
  displayName: 'Buffy the MiniMax M3 Free Orchestrator',
})

/**
 * Maps a Freebuff model id (as shown in the web/CLI model switcher) to the
 * bundled base2-free agent that pins that model. Used by executeFreebuff to
 * run the model the user selected. Models without an explicit variant fall
 * back to `base2-free`.
 */
export const FREEBUFF_MODEL_TO_AGENT_ID: Record<string, string> = {
  [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]: 'base2-free-deepseek',
  [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID]: 'base2-free-deepseek-flash',
  [FREEBUFF_KIMI_MODEL_ID]: 'base2-free-kimi',
  [FREEBUFF_MIMO_V25_MODEL_ID]: 'base2-free-mimo',
  [FREEBUFF_MIMO_V25_PRO_MODEL_ID]: 'base2-free-mimo-pro',
  [FREEBUFF_MINIMAX_MODEL_ID]: 'base2-free-minimax',
  [FREEBUFF_MINIMAX_M3_MODEL_ID]: 'base2-free-minimax-m3',
}

/** Resolve a selected Freebuff model id to the bundled agent id to run. Falls
 *  back to the default model's agent for unknown/undefined selections. */
export function resolveFreebuffAgentId(modelId: string | undefined): string {
  if (modelId && FREEBUFF_MODEL_TO_AGENT_ID[modelId]) {
    return FREEBUFF_MODEL_TO_AGENT_ID[modelId]
  }
  return FREEBUFF_MODEL_TO_AGENT_ID[DEFAULT_FREEBUFF_MODEL_ID] ?? 'base2-free'
}

export const bundledAgentDefinitions = [
  base2Free,
  base2FreeDeepseek,
  base2FreeDeepseekFlash,
  base2FreeKimi,
  base2FreeMimo,
  base2FreeMimoPro,
  base2FreeMinimax,
  base2FreeMinimaxM3,
  basher,
  browserUse,
  contextPruner,
  codeReviewerDeepseek,
  codeReviewerDeepseekFlash,
  codeReviewerKimi,
  codeReviewerLite,
  codeReviewerMinimax,
  codeSearcher,
  directoryLister,
  fileLister,
  filePicker,
  globMatcher,
  researcherDocs,
  researcherWeb,
  thinkerGpt,
  thinkerWithFilesGemini,
  tmuxCli,
] satisfies AgentDefinition[]
