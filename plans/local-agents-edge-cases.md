# Local Agent Handling Edge Cases

| # | Edge Case | Expected CLI Behavior | Notes / Status |
|---|-----------|-----------------------|----------------|
| 1 | `.agents` directory missing | Initialize without error and default to built-in agents only. | `findAgentsDirectory` returns null and `loadAgentDefinitions` falls back to `[]` (`cli/src/utils/load-agent-definitions.ts:66`). |
| 2 | `.agents` directory present but contains no loadable files | Log that no agents were found; continue running. | Directory traversal yields `[]`, so validation and runs proceed with built-ins (`cli/src/utils/load-agent-definitions.ts:71`, `cli/src/hooks/use-send-message.ts:503`). |
| 3 | Agent file missing `displayName` or `id` metadata | Skip unreadable files without crashing. | Files without either regex match are skipped during discovery (`cli/src/utils/load-agent-definitions.ts:50`). |
| 4 | Agent definition missing required fields (e.g., `model`) | Exclude invalid definitions; surface validation warnings. | Loader filters out objects lacking `id` or `model` (`cli/src/utils/load-agent-definitions.ts:83`) and startup validation reports issues (`cli/src/index.tsx:83`). |
| 5 | Duplicate agent IDs across files | Detect duplicates and decide precedence or warn user. | SDK validation rejects duplicates and surfaces error messages (`cli/src/index.tsx:84`, `sdk/src/__tests__/validate-agents.test.ts:259`). |
| 6 | Agent module throws on require (syntax/runtime error) | Skip problematic file and continue loading others. | Loader wraps `require` in `try/catch` and simply continues (`cli/src/utils/load-agent-definitions.ts:75`). |
| 7 | Agent module lacks a default export object | Handle gracefully by ignoring the file. | Missing `default` export fails `agentDef` check and skips push (`cli/src/utils/load-agent-definitions.ts:78`). |
| 8 | Agent generator (`handleSteps`) definitions need to stay live after edits | Reload modified files on each run so changes take effect immediately. | Loader invalidates `require.cache` per file and `client.run` reloads definitions for every message (`cli/src/utils/load-agent-definitions.ts:80`, `cli/src/hooks/use-send-message.ts:501`). |
| 9 | Deeply nested agent directories (excluding known skip folders) | Traverse subdirectories and include eligible files. | Recursive walk adds entries while ignoring known system folders (`cli/src/utils/load-agent-definitions.ts:26`). |
|10 | Non-TypeScript artifacts (`.js`, `.d.ts`, build outputs) alongside agent sources | Ignore non-agent artifacts reliably. | Discovery only includes `.ts` files that match agent metadata (`cli/src/utils/load-agent-definitions.ts:41`). |
|11 | Validation errors reported by SDK (`validateAgents`) | Surface errors to UI so users can fix definitions. | Startup validation captures `validationErrors` and passes them to the app (`cli/src/index.tsx:81`). |
|12 | CLI runtime without authentication token | Create client lazily but allow agent validation to run without API key. | `getCodebuffClient` warns and returns null when no token, leaving validation unaffected (`cli/src/utils/codebuff-client.ts:11`). |

We will assess each edge case to verify the current implementation’s behavior.
