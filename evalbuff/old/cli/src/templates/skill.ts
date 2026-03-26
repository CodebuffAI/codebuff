export const SKILL_TEMPLATE = `---
name: evalbuff
description: Use evalbuff to get project context before coding and review changes before committing
---

# Evalbuff

This project uses evalbuff for AI-assisted context gathering and change review.

## Before Starting a Task

Run evalbuff to get oriented before making changes:

    evalbuff context "<description of what you're about to do>"

This returns:
- **Relevant files** with summaries — so you know what to read
- **Background knowledge** about the systems involved
- **Gotchas and lessons** from past work — so you avoid known pitfalls

Use this output to inform which files to read and what to watch out for.

## After Making Changes

Run evalbuff to review your changes before considering the task complete. Include a description of what the user originally asked for so the reviewer can verify the changes match the intent:

    evalbuff review "<description of what the user asked you to do>"

This returns structured feedback including:
- 🔴 **Critical issues** that must be fixed
- 🟡 **Warnings** that should be addressed
- 💡 **Suggestions** for improvement
- Whether the changes actually accomplish the stated goal

If there are critical issues (🔴), fix them and re-run the review.
If there are only warnings and suggestions, use your judgment.

## Tips

- Always run \`evalbuff context\` first — it often surfaces non-obvious files and gotchas.
- Always pass the user's original request to \`evalbuff review\` — this helps catch missing requirements and verify the changes match intent.
- Run \`evalbuff review\` even for small changes — it catches things like missing error handling, test gaps, and convention violations.
- You can review specific files: \`evalbuff review "add auth" --files src/auth.ts src/db.ts\`
- You can review staged changes only: \`evalbuff review "fix login bug" --staged\`
`
