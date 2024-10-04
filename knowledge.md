# Manicode

Manicode is a tool for editing codebases via natural language instruction to Mani, an expert AI programming assistant.

<!-- ... existing knowledge file ... -->

## Pricing Model

Manicode uses a credits-based charging system instead of a traditional subscription model. The pricing structure is based on the `CREDITS_USAGE_LIMITS` object, which defines the credit limits for different user tiers.

Key points:
- Credits are the primary currency for using Manicode's features.
- Different user tiers (e.g., anonymous, free, paid) have different credit limits.
- The `CREDITS_USAGE_LIMITS` object in `common/src/constants.ts` defines these limits.

When implementing or modifying features related to user actions or API calls, consider the credit usage and how it relates to these limits.

<!-- ... rest of existing knowledge file ... -->
