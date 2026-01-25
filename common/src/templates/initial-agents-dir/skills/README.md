# Skills

Skills are reusable instruction sets that agents can load on-demand via the `skill` tool.

## Creating a Skill

1. Create a directory with your skill name (lowercase alphanumeric with hyphens):
   ```
   .agents/skills/my-skill/
   ```

2. Create a `SKILL.md` file with YAML frontmatter:
   ```markdown
   ---
   name: my-skill
   description: A short description of what this skill does
   license: MIT
   metadata:
     category: development
   ---

   # My Skill

   Instructions and content for the skill...
   ```

## Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill name (1-64 chars, lowercase alphanumeric with hyphens, must match directory name) |
| `description` | Yes | Short description (1-1024 chars) used for agent discovery |
| `license` | No | License identifier (e.g., "MIT", "Apache-2.0") |
| `metadata` | No | Key-value pairs for additional categorization |

## Name Validation

Skill names must:
- Be 1-64 characters long
- Use only lowercase letters, numbers, and hyphens
- Not start or end with a hyphen
- Not contain consecutive hyphens
- Match the directory name exactly

Valid examples: `git-release`, `api-design`, `review2`
Invalid examples: `Git-Release`, `my--skill`, `-skill`, `skill-`

## Discovery Locations

Skills are discovered from these locations (in order of precedence):
1. `~/.agents/skills/` (global, lowest priority)
2. `.agents/skills/` (project, highest priority)

Project skills override global skills with the same name.

## How Agents Use Skills

Agents see available skills listed in the `skill` tool description. When an agent needs a skill's instructions, it calls:

```
skill({ name: "my-skill" })
```

The full SKILL.md content is then returned to the agent.
