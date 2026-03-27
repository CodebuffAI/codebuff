# Interpreting Task Prompts (Especially Eval-Generated Ones)

When working with task prompts, especially those auto-generated from commit history for evaluation purposes, the prompt text may not accurately describe the actual work needed.

## The Problem

Evalbuff generates task prompts by analyzing commits. Sometimes the prompt will say "create documentation about X" when the actual ground truth is "fix test scripts in package.json and CI workflow files." This happens when:

1. The commit message is misleading (e.g., "Simplify AGENTS.md" when it actually removes test scripts)
2. The prompt generator focuses on visible file additions rather than the semantic meaning of the change
3. The task is stated in terms of what a developer might ASK for, not what they actually need

## Solution: Always Check Ground Truth First

Before implementing ANY task:

1. **Check if there's a ground truth diff available** - look for references to expected changes, test files, or "what should have been done"
2. **Examine file paths and extensions in the ground truth**:
   - `.json` files (especially `package.json`) → likely config/dependency changes
   - `.yml`/`.yaml` files in `.github/workflows/` → CI/CD configuration changes
   - `.md` files → documentation (but could also be removing or editing existing docs)
   - `.ts`/`.js` files → code changes
3. **Read the actual diff content, not just the prompt** - the diff shows EXACTLY what changed
4. **Distinguish between creation vs. modification**:
   - Does the ground truth show `new file mode` or additions to existing files?
   - Is this refactoring, removal, or net-new functionality?

## Example: The AGENTS.md Confusion

Prompt said:
> "Can you create an AGENTS.md file at the root that provides an overview..."

Ground truth showed:
```diff
--- a/.agents/package.json
+++ b/.agents/package.json
-    "test:e2e": "bun test e2e"
--- a/.github/workflows/nightly-e2e.yml  
+++ b/.github/workflows/nightly-e2e.yml
-        run: cd .agents && bun run test:e2e
+        run: cd agents && bun run test:e2e
```

The actual task was about:
- Removing a test script from package.json
- Fixing directory references in a CI workflow
- NOT about creating documentation

The agent should have recognized the ground truth shows `.json` and `.yml` config files, not `.md` documentation files.

## When In Doubt

If the prompt seems to conflict with file paths/types in the ground truth:
1. Trust the ground truth diff over the prompt text
2. Read the actual file contents being changed
3. Understand the PURPOSE of the change (fixing tests, updating config, refactoring) before implementing
4. Ask clarifying questions if the task is genuinely ambiguous

## Red Flags

- Prompt says "create docs" but ground truth shows only config file changes → likely NOT a docs task
- Prompt says "add feature X" but ground truth removes code → likely a cleanup/refactor task
- Prompt uses vague language ("simplify", "improve") → read the diff to understand the specific technical change