import { createCliAgent } from './lib/create-cli-agent'

export default createCliAgent({
  id: 'claude-code-cli',
  displayName: 'Claude Code CLI',
  cliName: 'Claude Code',
  shortName: 'claude-code',
  startCommand: 'claude --dangerously-skip-permissions',
  permissionNote:
    'Always use `--dangerously-skip-permissions` when testing to avoid permission prompts that would block automated tests.',
  model: 'anthropic/claude-opus-4.5',
})
