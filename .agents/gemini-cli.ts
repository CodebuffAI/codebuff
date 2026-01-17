import { createCliAgent } from './lib/create-cli-agent'

export default createCliAgent({
  id: 'gemini-cli',
  displayName: 'Gemini CLI',
  cliName: 'Gemini',
  shortName: 'gemini',
  startCommand: 'gemini --yolo',
  permissionNote:
    'Always use `--yolo` (or `--approval-mode yolo`) when testing to auto-approve all tool actions and avoid prompts that would block automated tests.',
  model: 'anthropic/claude-opus-4.5',
  cliSpecificDocs: `## Gemini CLI Commands

Gemini CLI uses slash commands for navigation:
- \`/help\` - Show help information
- \`/tools\` - List available tools
- \`/quit\` - Exit the CLI (or Ctrl-C twice)`,
})
