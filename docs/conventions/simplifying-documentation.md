# Simplifying Documentation: Distill, Don't Delete

When asked to "simplify" or "make more concise" documentation, the goal is to **distill content to its essential information**, not to remove entire sections.

## Common Mistake

Agents often interpret simplification requests as license to delete:
- Entire sections ("Goals", "Key Technologies", "Conventions")
- Important qualifiers ("advanced" vs just "coding agent")
- Critical developer guidance (force-push rules, git conventions)

## Correct Approach

### 1. Identify Core Information

Before removing anything, determine what's **essential** vs **verbose**:
- Project mission/goals → distill to one clear sentence, don't remove
- Key technologies → keep the list, remove explanatory text
- Important conventions → keep critical rules (git force-push, security patterns), remove trivial ones

### 2. Compress, Don't Cut

**WRONG:**
```diff
-## Goals
-
-- Make expert engineers faster (power-user focus).
-- Reduce time/effort for common programming tasks.
-- Improve via iteration/feedback (learn/adapt from usage).
```

**CORRECT:**
```diff
-## Goals
+## Goal
 
-- Make expert engineers faster (power-user focus).
-- Reduce time/effort for common programming tasks.
-- Improve via iteration/feedback (learn/adapt from usage).
+Make an efficient learning agent that can do anything.
```

### 3. Preserve Critical Context

Some information seems verbose but is **architecturally important**:
- Qualifiers like "advanced" that distinguish the project's capabilities
- Relationships between components ("freebuff and evalbuff are parts of Codebuff")
- Developer conventions that prevent bugs (force-push rules, interactive git command handling)

### 4. Check Against Original Intent

Before finalizing:
1. Does the simplified version still answer "What is this project?"
2. Does it preserve critical developer guidance?
3. Would a new team member understand the essential architecture?
4. Are key differentiators ("advanced", component relationships) still present?

## Example: AGENTS.md Simplification

### What NOT to Do

```markdown
# Codebuff

Codebuff is a coding agent with a composable agent framework.

## Structure

- `cli/` — TUI client
- `sdk/` — JS/TS SDK
```

**Problems:**
- Lost "advanced" qualifier
- Removed project goal entirely
- Removed all conventions including critical git rules
- Too minimal to be useful

### Correct Simplification

```markdown
# Codebuff

Codebuff is an advanced coding agent with a composable agent framework. It also includes:
- freebuff, the free coding agent  
- evalbuff, a project to improve an agent through evals

## Goal

Make an efficient learning agent that can do anything.

## Key Technologies

- TypeScript monorepo (Bun workspaces)
- Next.js (web app + API routes)
- Multiple LLM providers

## Conventions

- Never force-push `main` unless explicitly requested.
- Run interactive git commands in tmux.
```

**Why this works:**
- Retains "advanced" qualifier and component context
- Distills goals to one essential line (not removed)
- Keeps Key Technologies section with condensed entries
- Preserves critical developer conventions
- Still concise (reduced from verbose original) but not minimal to the point of uselessness

## Red Flags You're Over-Simplifying

1. You removed an entire section that had multiple paragraphs → probably should condense to 1-2 sentences instead
2. You removed qualifiers or relationships ("advanced", "X is part of Y") → these provide important context
3. The simplified version doesn't explain what makes this project different from alternatives
4. You removed all conventions/rules → keep the most critical 2-3 that prevent common mistakes

## Summary

**Simplify = compress and distill**  
**Simplify ≠ delete everything**

When in doubt, condense verbose explanations into concise statements rather than removing sections entirely.