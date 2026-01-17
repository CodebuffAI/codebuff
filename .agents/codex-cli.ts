import { createCliAgent } from './lib/create-cli-agent'

/**
 * Codex-specific review mode instructions.
 * Codex CLI has a built-in /review command with an interactive questionnaire.
 */
const CODEX_REVIEW_MODE_INSTRUCTIONS = `## Review Mode Instructions

Codex CLI has a built-in \`/review\` command that presents an interactive questionnaire. You must navigate it using arrow keys and Enter.

### Review Type Mapping

The \`reviewType\` param maps to menu options (1-indexed from top):
- \`"pr"\` → Option 1: "Review against a base branch (PR Style)"
- \`"uncommitted"\` → Option 2: "Review uncommitted changes" (default)
- \`"commit"\` → Option 3: "Review a commit"
- \`"custom"\` → Option 4: "Custom review instructions"

### Workflow

1. **Start Codex** with permission bypass:
   \`\`\`bash
   SESSION=$(./scripts/tmux/tmux-cli.sh start --command "codex -a never -s danger-full-access")
   \`\`\`

2. **Wait for CLI to initialize**, then capture:
   \`\`\`bash
   sleep 3
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "initial-state"
   \`\`\`

3. **Send the /review command**:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "/review"
   sleep 2
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "review-menu"
   \`\`\`

4. **Navigate to the correct option** using arrow keys:
   - The menu starts with Option 1 selected (PR Style)
   - Use Down arrow to move to the desired option:
     - \`reviewType="pr"\`: No navigation needed, just press Enter
     - \`reviewType="uncommitted"\`: Send Down once, then Enter
     - \`reviewType="commit"\`: Send Down twice, then Enter
     - \`reviewType="custom"\`: Send Down three times, then Enter
   
   \`\`\`bash
   # Example for "uncommitted" (option 2):
   ./scripts/tmux/tmux-send.sh "$SESSION" --key Down
   sleep 0.5
   ./scripts/tmux/tmux-send.sh "$SESSION" --key Enter
   \`\`\`

5. **For "custom" reviewType**, after selecting option 4, you'll need to send the custom instructions from the prompt:
   \`\`\`bash
   sleep 1
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "[custom instructions from the prompt]"
   \`\`\`

6. **Wait for and capture the review output** (reviews take longer):
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "review-output" --wait 60
   \`\`\`

7. **Parse the review output** and populate \`reviewFindings\` with:
   - \`file\`: Path to the file with the issue
   - \`severity\`: "critical", "warning", "suggestion", or "info"
   - \`line\`: Line number if mentioned
   - \`finding\`: Description of the issue
   - \`suggestion\`: How to fix it

8. **Clean up**:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
   \`\`\``

export default createCliAgent({
  id: 'codex-cli',
  displayName: 'Codex CLI',
  cliName: 'Codex',
  shortName: 'codex',
  startCommand: 'codex -a never -s danger-full-access',
  permissionNote:
    'Always use `-a never -s danger-full-access` when testing to avoid approval prompts that would block automated tests.',
  model: 'anthropic/claude-opus-4.5',
  extraInputParams: {
    reviewType: {
      type: 'string',
      enum: ['pr', 'uncommitted', 'commit', 'custom'],
      description:
        'For review mode: "pr" = Review against base branch (PR style), "uncommitted" = Review uncommitted changes, "commit" = Review a specific commit, "custom" = Custom review instructions. Defaults to "uncommitted".',
    },
  },
  reviewModeInstructions: CODEX_REVIEW_MODE_INSTRUCTIONS,
})
