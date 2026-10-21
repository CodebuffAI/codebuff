import type { SelectedTemplate } from './selected'

/**
 * Templates that call the Freebuff API (the ai-chat starter) run on the
 * owner's own prepaid API key. The key is a live credential, so the agent
 * never handles it; the README in the template says where it goes.
 */
export const FREEBUFF_API_TEMPLATE_IDS: ReadonlySet<string> = new Set(['ai-chat'])
export const FREEBUFF_API_TEMPLATE_GUIDANCE = `Templates that use AI call the Freebuff API (OpenAI-compatible, https://freebuff.com/api/v1/paid) from their Worker with the owner's own key in OPENAI_API_KEY; the browser never sees it. Never ask for that key in chat, print it, log it, commit it, or put it in client code. The owner creates and funds one at https://freebuff.com/account/api (Desktop: Account → Developer API, which can write it into the project's .env); in Cloud it is a project secret named OPENAI_API_KEY; on Sites it goes in Sites → Secrets after the first deploy. Keep the key in .env, never .dev.vars (its presence stops Wrangler reading .env). Until the key is set the app shows its setup card; that is expected, not a bug. Keep the template's server-side model allowlist, per-user daily limit and loopback-only development user: every reply spends the owner's credits.`

/** Standing template guidance shared by Desktop and Cloud harnesses. */
export function templatesGuidance(
  mode: 'plan' | 'build',
  runtime: 'desktop' | 'cloud' = 'desktop',
  selectedTemplate?: SelectedTemplate,
): string {
  const preview = runtime === 'cloud'
    ? 'run bun install, start the dev server bound to 0.0.0.0 and show it with cloud_show_dev_server'
    : 'run bun install, start bun run dev and show it with register_preview'
  if (selectedTemplate)
    return `# Starter templates

The user already selected the ${JSON.stringify(selectedTemplate.name)} starter template (id: ${JSON.stringify(selectedTemplate.id)}) when creating this project. Its starter code was installed during project creation. Treat the current workspace files as the source of truth; they may already be customized. Start by reading the existing README.md and the relevant source files, then ${mode === 'plan' ? 'plan changes to that code' : "adapt that code to the user's request"}. Preserve changes that have already been made. Do not search for, choose, or apply another template unless the user explicitly asks to replace it.${
      mode === 'build'
        ? ` If the workspace turns out to be empty (no README.md, package.json or src), the starter code is missing: say so in one sentence and install this same template with template_apply (id ${JSON.stringify(selectedTemplate.id)}) before doing anything else, rather than building from scratch or describing files that are not there.`
        : ''
    }

${mode === 'plan' ? 'This is an existing project to plan against. Do not install dependencies, start servers, or edit files in plan mode.' : `Make only the changes needed for the user's request. When ready to preview, ${preview}. The template's README.md describes its setup and integrations.`}${
      FREEBUFF_API_TEMPLATE_IDS.has(selectedTemplate.id) ? `\n\n${FREEBUFF_API_TEMPLATE_GUIDANCE}` : ''
    }`
  if (mode === 'plan')
    return `# Starter templates
Freebuff ships starter templates for common websites and apps; template_list shows the current set. Inspect the workspace before proposing one: a new chat or newly created project may already contain a selected template or other code. If code is present, plan changes to that code. Only when the workspace is empty and a template matches the request, name it in the plan as the starting point and describe what would change. Applying a template is build-mode work.`
  return `# Starter templates

Freebuff ships starter templates: complete, designed, working projects (Vite, React and Tailwind on a Cloudflare Worker, ready for Sites). template_list has the current set; it covers things like marketing and landing pages, CRM-style dashboards, storefronts, portfolios, study or flashcard apps and an AI chat assistant, and the app templates already wire Sign in with Freebuff, D1 and R2.

First inspect the workspace and read its README.md and relevant source files if present. A new chat or newly created project may already contain a selected template or other code; build on that code instead of searching for or applying a template.

Start from a template only when the workspace is empty and either the user asks for one, or their first request plainly describes something a template already is (a landing page for a product, a CRM, an online store, a portfolio, a flashcard app, a chatbot or AI assistant). Call template_list, choose the closest match, call template_apply with its id, then read the template's README.md and the files you need. Change it until it matches the request: the product or brand name, copy, data, colours, images, and the sections and features the user does and does not want. Never hand back the template unchanged, and say that you started from a template. When nothing matches, build normally.

After applying: ${preview}. Each template's deploy.json and wrangler.jsonc are ready for sites_deploy. The app templates run with a local development user until Sign in with Freebuff is enabled: on Sites they need sites_add_storage for DB and FILES and sites_enable_auth before a deployed preview can sign in or save data.

${FREEBUFF_API_TEMPLATE_GUIDANCE}`
}
