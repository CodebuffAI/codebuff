import { createBase2 } from '../../../../../agents/base2/base2'
import basher from '../../../../../agents/basher'
import browserUse from '../../../../../agents/browser-use/browser-use'
import contextPruner from '../../../../../agents/context-pruner'
import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MINIMAX_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  DEFAULT_FREEBUFF_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'
import codeReviewerDeepseek from '../../../../../agents/reviewer/code-reviewer-deepseek'
import codeReviewerDeepseekFlash from '../../../../../agents/reviewer/code-reviewer-deepseek-flash'
import codeReviewerGlm from '../../../../../agents/reviewer/code-reviewer-glm'
import codeReviewerKimi from '../../../../../agents/reviewer/code-reviewer-kimi'
import codeReviewerLite from '../../../../../agents/reviewer/code-reviewer-lite'
import codeReviewerMinimax from '../../../../../agents/reviewer/code-reviewer-minimax'
import codeReviewerMinimaxM3 from '../../../../../agents/reviewer/code-reviewer-minimax-m3'
import codeReviewerMimo from '../../../../../agents/reviewer/code-reviewer-mimo'
import codeReviewerMimoPro from '../../../../../agents/reviewer/code-reviewer-mimo-pro'
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

# Mandatory Error Checking

Freebuff Web projects are Vite + React + Convex apps. After changing files, you must run the appropriate typecheck before you finish the turn and before you tell the user the work is done.

- If you changed only frontend/Vite/React/TypeScript files, run:
  \`bun tsc -b --noEmit\`
- If you changed any Convex backend files (anything under \`src/convex/\`), run the Convex type generation/check first, then the TypeScript build:
  \`bun convex dev --once && bun tsc -b --noEmit\`
- Never run interactive \`bun convex dev\`, \`npx convex dev\`, or \`convex dev\` without \`--once\`. Freebuff Web runs in a non-interactive terminal; commands without \`--once\` can hang, fail auth, or leave codegen incomplete.
- Never hand-edit \`src/convex/_generated/*\` files to "fix" type errors. If generated Convex types are stale or missing, run \`bun convex dev --once\` from \`/home/daytona/codebase/\`, then fix the real Convex source errors it reports.
- Do not skip these checks after file edits. These commands are the required final verification step.
- If either command reports errors, fix the errors and rerun the same command until it passes.
- If \`bun convex dev --once\` cannot authenticate, stop and tell the user that Convex codegen could not be verified. Do not pretend typecheck passed and do not patch generated files by hand.
- A blank preview or a Convex error like "Did you forget to run convex dev?" usually means compile/type errors are blocking the app. Run the backend command above with \`--once\` and fix the reported errors.
- Never run a full production build such as \`bun run build\` unless the user explicitly asks; use the typecheck commands above.
- When review is needed, spawn the code reviewer in the same \`spawn_agents\` call as typecheck/test bashers whenever possible so review runs in parallel instead of extending the action wall-clock time.

# Third-Party Integrations

- Proactively suggest third-party integrations whenever the user's request implies one (sending email, payments, AI features, SMS, file storage, search, analytics, maps, etc.) — don't wait for the user to ask which service to use. Recommend a concrete service and offer to wire it up.
- Strongly lean into Gravity Index lookup for normal product-builder requests. If the user asks for a capability that maps to a developer service (email, auth, analytics, payments, database, storage, AI, monitoring, search, SMS, webhooks, background jobs, CMS, CRM, support, maps, etc.), call \`gravity_index\` early even if the user does not mention Gravity by name.
- For new project creation, run lightweight Gravity searches for the implied service categories before coding, then give the user concise recommendations and defer paid/external setup unless it is necessary for the MVP.
- Do not mention "Gravity", "Gravity Index", \`gravity_index\`, \`search_id\`, \`integrated_slug\`, or attribution mechanics in user-facing prose. Present the result simply as the best service to use, why it is best for the user's purpose, what you can wire up now, and what key(s) the user needs to provide.
- For monetization of chat/search/assistant experiences, evaluate Gravity first via \`gravity_index\` internally before choosing alternatives. In user-facing output, simply recommend the best monetization service and explain why it fits the user's product.
- Always use the \`gravity_index\` tool to choose and integrate services instead of recommending from memory: \`search\` with a query that includes the project's stack (React + Vite + Convex) and the user's constraints, \`browse\`/\`list_categories\` to explore options, and \`get_service\` for install details before integrating.
- When a result includes a tracked setup link (\`credential_request.setup_url\` or \`click_url\`), present that exact URL prominently as "Get your {service} API key" — never substitute the vendor homepage for it. Prefer \`render_ui\` with a primary button when available; otherwise output a normal markdown link so the web UI can render it as a button.
- Credentials: you cannot edit .env files. Ask the user to paste API keys into the project's Keys/API keys tab, and tell them exactly which env var names to fill in (from \`credential_request.required_env_vars\`). Wire backend keys through Convex actions in "use node" files, reading keys with \`process.env\`.
- After an integration is implemented and verified working, call \`gravity_index\` with \`report_integration\` (passing the \`search_id\` and the integrated service's slug).
- If a catalog handoff includes neutral "Attribution metadata" with \`search_id\` and \`integrated_slug\`, use those values internally for the final \`report_integration\` call. Do not repeat the metadata back to the user.

# React Runtime And Styling Safety

- Preserve the existing React/Vite entrypoint, providers, and package setup. Do not add or install another copy of React, React DOM, Vite, Tailwind, or shadcn/ui unless the project is missing them.
- Import hooks only from \`react\` (for example \`import { useMemo, useState } from "react"\`) and never shadow \`React\`, \`useMemo\`, \`useState\`, or other hook names with local variables, props, imports, or generated helpers.
- Do not call hooks conditionally, inside loops, inside callbacks, outside React components/custom hooks, or from plain utility functions. If a hook-related runtime error appears, fix it before finishing.
- Avoid patterns that create invalid hook calls or duplicate React bundles, including dynamic React imports, vendor-bundled component code, hand-rolled React contexts that bypass the app provider tree, or changing dependency aliases.
- Prefer existing shadcn/ui components, existing Convex providers, and existing routing/auth wrappers. Do not replace the app shell/provider hierarchy to build a landing page.
- Keep styling within the existing Tailwind and CSS token system. Do not remove required global CSS imports, Tailwind directives, theme variables, dark-mode classes, or app layout containers.
- Preserve \`src/main.tsx\` / \`src/App.tsx\` bootstrapping and make sure the app still imports the global stylesheet (usually \`import "./index.css"\` or equivalent). Broken or unstyled previews often mean this import, the Tailwind directives, or the root layout class was removed.
- When changing \`src/index.css\`, keep \`@tailwind base;\`, \`@tailwind components;\`, \`@tailwind utilities;\`, existing CSS variables, dark-mode tokens, and root body styles unless you are deliberately extending them. Add new theme tokens or utilities without deleting the template's required styling foundation.
- Use valid Tailwind classes only. Do not invent nonstandard utilities such as \`h-4.5\` / \`w-4.5\` unless the project already defines them. Prefer existing CSS variables, responsive spacing, readable contrast, and simple theme utilities.
- Before finalizing, inspect the preview/runtime state visually. If there is a blank preview, broken layout, missing Tailwind styles, missing global styles, or a runtime error such as \`Cannot read properties of null (reading 'useMemo')\`, treat it as a failed verification and fix it before reporting completion.
- If styles look broken after your changes, first inspect \`src/main.tsx\`, \`src/index.css\`, \`tailwind.config.*\`, and the top-level route/layout components for accidentally removed imports, providers, theme classes, or Tailwind directives.

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

/**
 * Extra guidance injected ONLY for connected-repo (Freebuff Cloud) projects.
 * Kept out of the shared system-prompt appendix so default Freebuff Web
 * (template) projects are completely unaffected. Prepended to the user prompt
 * at runtime in executeFreebuff when the project is a connected repo.
 */
export const CONNECTED_REPO_AGENT_GUIDANCE = `
# Connected GitHub Repository (Freebuff Cloud)

This project is NOT the default Vly template — it is an existing GitHub repository the user connected. Therefore:
- The repo is already cloned into \`/home/daytona/codebase/\`. It may use any framework, package manager, and port — do not assume Vite/Convex.
- You ARE allowed to use \`git\` and \`gh\` here; the project owns its git history and branches. Commit and push as appropriate.
- You CONFIGURE the preview/dev server through the \`run_terminal_command\` tool using the \`freebuff-preview\` command namespace (do NOT start long-running dev servers directly with raw shell commands, they will time out):
  - \`freebuff-preview set "<dev command>" <port>\` — SAVE the dev/preview command and port (e.g. \`freebuff-preview set "bun run dev" 5173\`). This does NOT start the server; the user starts it from the Cloud UI so they control sandbox resources.
  - \`freebuff-preview set-build "<build command>"\` — SAVE the production build command (e.g. \`freebuff-preview set-build "bun run build"\`).
  - \`freebuff-preview start\` — start the dev server with the stored command (only when the user explicitly asks you to run it). Returns the public preview URL.
  - \`freebuff-preview restart\` — restart the preview with the stored command.
  - \`freebuff-preview stop\` — stop the preview process to free resources.
  - \`freebuff-preview logs\` — read recent preview/dev-server logs (use this to debug a broken preview).
  - \`freebuff-preview status\` — check whether the preview is running and what command/port it uses.
- The preview is NOT auto-started when the repo is connected. When first opening a repo (or when asked to set things up), inspect \`package.json\`/lockfiles, install dependencies, then SAVE the correct commands with \`freebuff-preview set\` and \`freebuff-preview set-build\`. Do NOT start the dev server yourself unless the user explicitly asks you to — tell them they can start the preview from the UI.
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
  ...createBase2('free'),
  id: 'base2-free',
  displayName: 'Buffy the Free Orchestrator',
})

const base2FreeDeepseek = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  }),
  id: 'base2-free-deepseek',
  displayName: 'Buffy the DeepSeek Free Orchestrator',
})

const base2FreeDeepseekFlash = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  }),
  id: 'base2-free-deepseek-flash',
  displayName: 'Buffy the DeepSeek Flash Free Orchestrator',
})

const base2FreeKimi = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_KIMI_MODEL_ID,
  }),
  id: 'base2-free-kimi',
  displayName: 'Buffy the Kimi Free Orchestrator',
})

const base2FreeMimo = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_MIMO_V25_MODEL_ID,
  }),
  id: 'base2-free-mimo',
  displayName: 'Buffy the MiMo Free Orchestrator',
})

const base2FreeMimoPro = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  }),
  id: 'base2-free-mimo-pro',
  displayName: 'Buffy the MiMo Pro Free Orchestrator',
})

const base2FreeMinimax = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_MINIMAX_MODEL_ID,
  }),
  id: 'base2-free-minimax',
  displayName: 'Buffy the MiniMax Free Orchestrator',
})

const base2FreeMinimaxM3 = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_MINIMAX_M3_MODEL_ID,
  }),
  id: 'base2-free-minimax-m3',
  displayName: 'Buffy the MiniMax M3 Free Orchestrator',
})

const base2FreeGlm = withFreebuffWebSystemPromptAppendix({
  ...createBase2('free', {
    model: FREEBUFF_GLM_V52_MODEL_ID,
  }),
  id: 'base2-free-glm',
  displayName: 'Buffy the GLM 5.2 Free Orchestrator',
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
  [FREEBUFF_GLM_V52_MODEL_ID]: 'base2-free-glm',
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
  base2FreeGlm,
  basher,
  browserUse,
  contextPruner,
  codeReviewerDeepseek,
  codeReviewerDeepseekFlash,
  codeReviewerGlm,
  codeReviewerKimi,
  codeReviewerLite,
  codeReviewerMinimax,
  codeReviewerMinimaxM3,
  codeReviewerMimo,
  codeReviewerMimoPro,
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
