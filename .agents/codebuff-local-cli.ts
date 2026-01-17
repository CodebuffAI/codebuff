import { createCliAgent } from './lib/create-cli-agent'

export default createCliAgent({
  id: 'codebuff-local-cli',
  displayName: 'Codebuff Local CLI',
  cliName: 'Codebuff',
  shortName: 'codebuff-local',
  startCommand: 'bun --cwd=cli run dev',
  permissionNote:
    'No permission flags needed for Codebuff local dev server.',
  model: 'anthropic/claude-opus-4.5',
  spawnerPromptExtras: `**Use this agent after modifying:**
- \`cli/src/components/\` - UI components, layouts, rendering
- \`cli/src/hooks/\` - hooks that affect what users see
- Any CLI visual elements: borders, colors, spacing, text formatting

**When to use:** After implementing CLI UI changes, use this to verify the visual output actually renders correctly. Unit tests and typechecks cannot catch layout bugs, rendering issues, or visual regressions. This agent captures real terminal output including colors and layout.`,
})
