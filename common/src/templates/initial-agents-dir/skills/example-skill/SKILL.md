---
name: example-skill
description: An example skill demonstrating the SKILL.md format
license: MIT
metadata:
  category: examples
  audience: developers
---

# Example Skill

This is an example skill that demonstrates the SKILL.md format.

## When to use this skill

Use this skill when you need an example of how skills work.

## Instructions

1. Skills are loaded on-demand via the `skill` tool
2. The agent sees available skills listed in the tool description
3. When needed, the agent calls `skill({ name: "example-skill" })` to load the full content
4. The skill content is then available in the conversation context

## Notes

- Skills should have clear, specific descriptions
- The name must be lowercase alphanumeric with hyphens
- The name must match the directory name
