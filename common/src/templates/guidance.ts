import type { SelectedTemplate } from './selected'

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

The user already selected the ${JSON.stringify(selectedTemplate.name)} starter template (id: ${JSON.stringify(selectedTemplate.id)}) when creating this project. Its starter code was installed during project creation. Treat the current workspace files as the source of truth; they may already be customized. Start by reading the existing README.md and the relevant source files, then ${mode === 'plan' ? 'plan changes to that code' : "adapt that code to the user's request"}. Preserve changes that have already been made. Do not search for, choose, or apply another template unless the user explicitly asks to replace it.

${mode === 'plan' ? 'This is an existing project to plan against. Do not install dependencies, start servers, or edit files in plan mode.' : `Make only the changes needed for the user's request. When ready to preview, ${preview}. The template's README.md describes its setup and integrations.`}`
  if (mode === 'plan')
    return `# Starter templates
Freebuff ships starter templates for common websites and apps; template_list shows the current set. Inspect the workspace before proposing one: a new chat or newly created project may already contain a selected template or other code. If code is present, plan changes to that code. Only when the workspace is empty and a template matches the request, name it in the plan as the starting point and describe what would change. Applying a template is build-mode work.`
  return `# Starter templates

Freebuff ships starter templates: complete, designed, working projects (Vite, React and Tailwind on a Cloudflare Worker, ready for Sites). template_list has the current set; it covers things like marketing and landing pages, CRM-style dashboards, storefronts, portfolios and study or flashcard apps, and the app templates already wire Sign in with Freebuff, D1 and R2.

First inspect the workspace and read its README.md and relevant source files if present. A new chat or newly created project may already contain a selected template or other code; build on that code instead of searching for or applying a template.

Start from a template only when the workspace is empty and either the user asks for one, or their first request plainly describes something a template already is (a landing page for a product, a CRM, an online store, a portfolio, a flashcard app). Call template_list, choose the closest match, call template_apply with its id, then read the template's README.md and the files you need. Change it until it matches the request: the product or brand name, copy, data, colours, images, and the sections and features the user does and does not want. Never hand back the template unchanged, and say that you started from a template. When nothing matches, build normally.

After applying: ${preview}. Each template's deploy.json and wrangler.jsonc are ready for sites_deploy. The app templates run with a local development user until Sign in with Freebuff is enabled: on Sites they need sites_add_storage for DB and FILES and sites_enable_auth before a deployed preview can sign in or save data.`
}
