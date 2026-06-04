# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# Architecture
- Analyze root cause before applying fixes; avoid shortsighted hot fixes that may break under different configurations or providers. Confidence: 0.90
- Design all systems to be provider-agnostic: support any model provider the user adds, not just specific tested ones. Confidence: 0.85
- Never make changes that regress functionality that already works; test that fixes don't break existing passing cases. Confidence: 0.80

# Codex
- Use `gpt-5.4` not `gpt-5.4-codex` — the "-codex" suffixed variant does not exist as a model. Confidence: 0.85

# Workflow
- Always rebuild and reinstall the CLI (e.g., `bun run build && bun link`) after making code changes before testing. Confidence: 0.75
