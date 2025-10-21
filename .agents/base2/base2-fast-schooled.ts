import { createBase2 } from './base2'

const base2Fast = createBase2('fast')
const definition = {
  ...base2Fast,
  id: 'base2-fast-schooled',
  displayName: 'Buffy the Schooled Orchestrator',
  systemPrompts: `# Agent Lessons

Lessons accumulated across previous agent runs. Each lesson identifies what went wrong (Issue) and what should have been done instead (Fix). Use these lessons to improve the agent's performance going forward!

## 2025-10-21T02:19:38.224Z — add-sidebar-fades (257cb37)

### Original Agent Prompt
Enhance the desktop docs sidebar UX by adding subtle top/bottom gradient fades that appear based on scroll position and a thin, themed custom scrollbar. The fades should show when there’s overflow in that direction (top when not at the top, bottom when not at the bottom), be non-interactive, and update on initial render and during scroll. Apply the custom scrollbar styles via a CSS class and use it on the scrollable sidebar container. Preserve the current hash-based smooth scrolling behavior and leave the mobile Sheet implementation unchanged.

### Lessons
- **Issue:** Custom scrollbar only used -webkit selectors; Firefox shows default thick scrollbar.
  **Fix:** Add cross-browser styles: scrollbar-width: thin; scrollbar-color: hsl(var(--border)/0.6) transparent alongside -webkit rules.

- **Issue:** Used @apply bg-sidebar-border for the thumb; token may not exist in Tailwind theme.
  **Fix:** Use stable theme tokens: bg-border or inline color via hsl(var(--border)) to ensure consistency across themes.

- **Issue:** Fade visibility isn’t updated when content height changes (e.g., async News load).
  **Fix:** Observe size/DOM changes: use ResizeObserver/MutationObserver or re-run handleScroll on content updates and window resize.

- **Issue:** Gradients set via inline style strings; harder to theme, lint, and CSP-safe.
  **Fix:** Prefer Tailwind utilities: bg-gradient-to-b/t, from-background to-transparent with transition-opacity for maintainability.

## 2025-10-21T02:24:18.953Z — validate-custom-tools (30dc486)

### Original Agent Prompt
Add schema-validated custom tool execution. Ensure the server validates custom tool inputs but forwards a sanitized copy of the original input (removing the end-of-step flag) to the client. In the SDK, parse custom tool inputs with the provided Zod schema before invoking the tool handler and update types so handlers receive fully parsed inputs. Keep built-in tool behavior and error handling unchanged.

### Lessons
- **Issue:** Server streamed tool_call with parsed input, not sanitized original; client sees schema-shaped payload instead of original minus cb_easp.
  **Fix:** In parseRawCustomToolCall, validate with Zod but return input as a clone of raw input with cb_easp removed; use that for toolCalls and onResponseChunk.

- **Issue:** Sanitization was applied only when calling requestToolCall; toolCalls array and tool_call events still used parsed input, causing inconsistency.
  **Fix:** Unify by returning the sanitized original from parseRawCustomToolCall and reusing toolCall.input everywhere (stream, toolCalls, requestToolCall).

- **Issue:** SDK run() isn’t generic, so CustomToolDefinition type params don’t propagate; handlers lose typed Output inference.
  **Fix:** Make CodebuffClient.run generic (e.g., run<A extends string,B,C>) and accept CustomToolDefinition<A,B,C>[]; pass toolDef through so handler gets Output type.

- **Issue:** Used any casts for SDK error handling, reducing type-safety and clarity.
  **Fix:** Prefer unknown with type guards or narrowing (e.g., error instanceof Error ? error.message : String(error)) to avoid any casts.

## 2025-10-21T02:25:18.751Z — filter-system-history (456858c)

### Original Agent Prompt
Improve spawned agent context handling so that parent system messages are not forwarded. Update both sync and async spawn flows to pass conversation history to sub-agents without any system-role entries, and add tests covering includeMessageHistory on/off, empty history, and system-only history. Keep the overall spawning, validation, and streaming behavior unchanged.

### Lessons
- **Issue:** Tests asserted raw strings in the serialized history (e.g., 'assistant', '[]'), making them brittle to formatting changes.
  **Fix:** Parse the JSON portion of conversationHistoryMessage and assert on structured fields (roles, length), not string substrings.

- **Issue:** Async tests implicitly depended on ASYNC_AGENTS_ENABLED and used a carrier.promise + timeout, making them flaky.
  **Fix:** Explicitly mock ASYNC_AGENTS_ENABLED (or path) and await loopAgentSteps via spy; avoid timeouts and internal promise hacks.

- **Issue:** System-role filtering was duplicated in both spawn-agents.ts and spawn-agents-async.ts.
  **Fix:** Extract a shared util (e.g., filterOutSystemRole(messages)) in util/messages and use it in both handlers; add a unit test for it.

- **Issue:** Role presence was verified by substring checks ('assistant') instead of checking message.role, risking false positives.
  **Fix:** Assert on exact role fields ("role":"assistant") or, better, parse JSON and check objects’ role values.

- **Issue:** Initial sync test expected a non-standard empty array format ('[\n  \n]'), requiring a later patch.
  **Fix:** Use JSON.stringify semantics from the start or parse JSON and assert length === 0 to avoid format assumptions.

## 2025-10-21T02:26:14.756Z — add-spawn-perms-tests (257c995)

### Original Agent Prompt
Add comprehensive unit tests to verify that the spawn_agents tool enforces parent-to-child spawn permissions and that agent ID matching works across publisher, name, and version combinations. Include edge cases and mixed-success scenarios. Also make the internal matching helper importable so the tests can target it directly. Keep the handler logic unchanged; focus on exporting the helper and covering behavior via tests.

### Lessons
- **Issue:** Imported TEST_USER_ID from '@codebuff/common/constants' and AgentTemplate from '../templates/types' causing type/resolve errors.
  **Fix:** Use correct paths: TEST_USER_ID from '@codebuff/common/old-constants' and AgentTemplate from '@codebuff/common/types/agent-template'.

- **Issue:** Omitted the 'agent template not found' scenario in handler tests, missing a key error path.
  **Fix:** Add a test where localAgentTemplates lacks the requested agent; assert the error message and no loopAgentSteps call.

- **Issue:** Reimplemented ProjectFileContext and MockWebSocket in tests instead of reusing shared utils.
  **Fix:** Import mockFileContext and MockWebSocket from backend/src/__tests__/test-utils to avoid drift and boilerplate.

- **Issue:** Assertions tightly coupled to exact report header strings, making tests brittle to formatting changes.
  **Fix:** Assert via displayName-derived headers or use regex/contains on content while verifying loopAgentSteps calls for success.

- **Issue:** Did not verify that loopAgentSteps received the resolved agentType from getMatchingSpawn.
  **Fix:** Assert loopAgentSteps was called with agentType equal to the matched spawnable (e.g., 'pub1/alpha@1.0.0').

- **Issue:** Used afterAll to restore mocks, risking cross-test leakage of spies/mocks.
  **Fix:** Restore spies/mocks in afterEach to isolate tests and prevent state leakage between cases.

- **Issue:** Duplicated local file context creator instead of shared mock, risking schema drift.
  **Fix:** Rely on mockFileContext from test-utils and adjust only fields needed per test to keep in sync with schema.

- **Issue:** Created success-case assertions initially using 'Agent (X):' which mismatched actual handler format.
  **Fix:** Base assertions on agentTemplate.displayName (e.g., '**Agent <id>:**'), or compute expected from makeTemplate.

## 2025-10-21T02:27:58.739Z — extract-agent-parsing (998b585)

### Original Agent Prompt
Please consolidate agent ID parsing across the backend by introducing a shared util and updating the registry and spawn logic:
- Add a common parser that can handle both published and local agent IDs, and a strict parser that only passes when a publisher is present.
- Update the agent registry to rely on the strict parser for DB lookups and to prefix with the default org when needed.
- Update the spawn-agents handler to use the shared general parser, with guards for optional fields, so that unprefixed, prefixed, and versioned forms are all matched correctly against the parent’s spawnable agents.
Keep the existing registry cache behavior and spawn matching semantics the same, and make sure existing tests pass without modification.

### Lessons
- **Issue:** Put new parsers in agent-name-normalization.ts, conflating concerns and diverging from the repo’s dedicated parsing util pattern.
  **Fix:** Create common/src/util/agent-id-parsing.ts exporting parseAgentId + parsePublishedAgentId; import these in registry and spawn-agents.

- **Issue:** Exposed parseAgentIdLoose/Strict; callers expect parseAgentId (optional fields, no null) and parsePublishedAgentId (strict).
  **Fix:** Implement parseAgentId to always return {publisherId?, agentId?, version?} and parsePublishedAgentId for strict published IDs; update call sites.

- **Issue:** agent-registry.ts imported parseAgentIdStrict from normalization; should use parsePublishedAgentId from the parsing util for DB lookups.
  **Fix:** Import parsePublishedAgentId from common/util/agent-id-parsing and use it (with DEFAULT_ORG_PREFIX fallback) for DB queries and cache logic.

- **Issue:** Only spawn-agents used the shared parser; async/inline spawners still rely on simplistic checks, risking inconsistent spawn matching.
  **Fix:** Adopt parseAgentId (loose) in spawn-agents-async and spawn-agent-inline matching to align behavior across all spawn paths with same guards.

## 2025-10-21T02:29:20.144Z — enhance-docs-nav (26140c8)

### Original Agent Prompt
Improve the developer docs experience: make heading clicks update the URL with the section hash and smoothly scroll to the heading, and ensure back/forward navigation to hashes also smoothly scrolls to the right place. Then refresh the Codebuff vs Claude Code comparison and agent-related docs to match current messaging: add SDK/programmatic bullets, expand Claude-specific enterprise reasons, standardize the feature comparison table, streamline the creating/customizing agent docs with concise control flow and field lists, and move domain-specific customization examples out of the overview into the customization page. Keep styles and existing components intact while making these UX and content updates.

### Lessons
- **Issue:** copy-heading.tsx onClick handler misses a closing brace/paren, causing a TS/compile error.
  **Fix:** Run typecheck/format before commit and ensure onClick closes with '})'. Build locally to catch syntax errors.

- **Issue:** Back/forward hash scrolling was added in mdx-components instead of at the app layout level.
  **Fix:** Add a single useEffect in web/src/app/docs/layout.tsx to handle hashchange/popstate and smooth-scroll to the target.

- **Issue:** Hash scroll logic was duplicated across mdx-components, TOC, and copy-heading, risking double listeners/bugs.
  **Fix:** Centralize: pushState + scroll in heading clicks; global hash scroll in docs layout; avoid per-component event listeners.

- **Issue:** Claude comparison table diverged from the standardized rows/wording (missing SDK/programmatic rows, dir context, templates).
  **Fix:** Replace the table with the exact standardized rows/order and phrasing from product messaging to ensure consistency.

- **Issue:** Overview.mdx omitted the Built-in Agents list present in the desired messaging/GT.
  **Fix:** Add a 'Built-in Agents' section listing base, reviewer, thinker, researcher, planner, file-picker in Overview.

- **Issue:** Cross-page anchors initially pointed to /docs/agents#customizing-agents though the page lives under 'advanced'.
  **Fix:** Audit and fix links to /docs/advanced#customizing-agents and verify troubleshooting slugs match actual routes.

## 2025-10-21T02:30:15.502Z — match-spawn-agents (9f0b66d)

### Original Agent Prompt
Enable flexible matching for spawning subagents. When a parent agent spawns children, the child agent_type string may include an optional publisher and/or version. Update the spawn-agents handler so a child can be allowed if its identifier matches any of the parent’s spawnable agents by agent name alone, by name+publisher, by name+version, or by exact name+publisher+version. Export the existing agent ID parser and use it to implement this matching, while preserving all current spawning, validation, and streaming behaviors.

### Lessons
- **Issue:** Matching was too strict: name-only child failed when parent allowed had publisher/version.
  **Fix:** Use asymmetric match: if names equal, allow regardless of extra qualifiers on either side.

- **Issue:** After allow-check, code still used the child id to load templates, ignoring allowed qualifiers.
  **Fix:** Resolve to the matched allowed id and use that for getAgentTemplate and execution to honor version/publisher.

- **Issue:** No tests were added for name-only, name+publisher, name+version, and full-id matching cases.
  **Fix:** Add unit tests covering all 4 modes (incl. mixed specificity) to prevent regressions and verify behavior.

- **Issue:** Helper was placed under handlers/tool, making it less reusable and harder to test.
  **Fix:** Move matching utility to a shared module (common util or templates) and import from handlers.

- **Issue:** Scope creep: updated async and inline handlers though request targeted spawn-agents only.
  **Fix:** Keep changes minimal to the requested handler unless necessary; refactor other paths separately.

- **Issue:** 'latest' was treated as a literal version, potentially rejecting valid matches.
  **Fix:** Define semantics for 'latest' (wildcard) and implement or document the intended matching behavior.

- **Issue:** Duplicated parsing via a new loose parser rather than extending the exported parser behavior.
  **Fix:** Wrap the exported parseAgentId with a minimal extension for name@version; avoid duplicating parse logic.

## 2025-10-21T02:31:29.648Z — add-deep-thinkers (6c362c3)

### Original Agent Prompt
Add a family of deep-thinking agents that orchestrate multi-model analysis. Create one coordinator agent that spawns three distinct sub-thinkers (OpenAI, Anthropic, and Gemini) and synthesizes their perspectives, plus a meta-coordinator that can spawn multiple instances of the coordinator to tackle different aspects of a problem. Each agent should define a clear purpose, model, and prompts, and the coordinators should be able to spawn their sub-agents. Ensure the definitions follow the existing agent typing, validation, and spawn mechanics used across the project.

### Lessons
- **Issue:** Sub-thinkers rely on stepPrompt to call end_turn; no handleSteps to guarantee completion.
  **Fix:** Add handleSteps that yields STEP_ALL (or STEP then end_turn) to deterministically end each sub-thinker.

- **Issue:** Deep-thinking sub-agents lack reasoningOptions, weakening the "deep" analysis intent.
  **Fix:** Set reasoningOptions (enabled, effort high/medium; exclude as needed) per model to emphasize deeper reasoning.

- **Issue:** New agents weren’t registered in AGENT_PERSONAS, reducing discoverability in CLI/UI.
  **Fix:** Add personas (displayName, purpose) for the sub-thinkers/coordinators in common/src/constants/agents.ts.

- **Issue:** Meta-coordinator doesn’t guard for empty params.aspects, risking a spawn with zero agents.
  **Fix:** Validate aspects; if empty, synthesize directly or spawn one coordinator focused on the overall prompt.

- **Issue:** Attempted to spawn a non-permitted 'validator' agent, violating spawn permissions.
  **Fix:** Use only allowed agents; for validation use run_terminal_command or CI scripts instead of spawning unknowns.

- **Issue:** Factory prompts aren’t trimmed/template-formatted, diverging from project style (e.g., thinker.ts).
  **Fix:** Use template literals with .trim() for system/instructions/step prompts to keep style consistent.

- **Issue:** Captured toolResult into unused vars (subResults/aspectResults), causing avoidable lint warnings.
  **Fix:** Prefix unused bindings with _ or omit them entirely to keep code lint-clean from the start.

- **Issue:** Coordinator synthesis depends solely on implicit instructions; no structured output path.
  **Fix:** Yield STEP_ALL and optionally switch to structured_output + set_output to enforce a concrete synthesis.

## 2025-10-21T02:33:02.024Z — add-custom-tools (212590d)

### Original Agent Prompt
Add end-to-end support for user-defined custom tools alongside the built-in tool set. Agents should be able to list custom tools by string name, the system should describe and document them in prompts, recognize their calls in streamed responses, validate their inputs, and route execution to the SDK client where the tool handler runs. Include options for tools that end the agent step, and support example inputs for prompt documentation. Update types, schemas, and test fixtures accordingly.

### Lessons
- **Issue:** CodebuffToolCall stays tied to ToolName; custom names break typing and casts to any in stream-parser/tool-executor.
  **Fix:** Broaden types to string tool names. Update CodebuffToolCall/clientTool schemas to accept custom names and map to runtime schemas.

- **Issue:** AgentTemplate lacks customTools in backend/types, yet code references AgentTemplate['customTools'] in strings.ts/tool-executor.
  **Fix:** Add customTools to AgentTemplate (record by name). Ensure assembleLocalAgentTemplates builds this map from agent defs.

- **Issue:** convertJsonSchemaToZod used in common/src/templates/agent-validation.ts without import/impl; likely compile error.
  **Fix:** Import from a shared util (e.g., common/util/zod-schema) or implement it. Add tests to verify conversion and errors.

- **Issue:** customTools defined as array in dynamic-agent-template, but prompts expect a record (customTools[name]).
  **Fix:** Normalize to Record<string, ToolDef> during validation. Store the record on AgentTemplate; use it everywhere.

- **Issue:** Changed sdk/src/client.ts for overrides, but actual routing uses sdk/src/websocket-client.ts handleToolCall.
  **Fix:** Document that clients must implement handleToolCall for custom tools or extend websocket-client to dispatch overrides.

- **Issue:** Example inputs aren’t rendered in tool docs; requirement asked for example inputs in prompts.
  **Fix:** Enhance getToolsInstructions/getShortToolInstructions to render exampleInputs blocks under each tool description.

- **Issue:** No tests added for custom tool parsing, execution routing, or prompt docs; fixtures not updated.
  **Fix:** Add tests: parseRawToolCall with custom schema, stream recognition, requestToolCall routing, prompt docs incl examples.

- **Issue:** Loosened toolNames to string[] without validating built-ins vs custom; invalid names can slip silently.
  **Fix:** Validate toolNames: each must be built-in or exist in customTools. Emit clear validation errors with file context.

- **Issue:** Duplicate import of renderToolResults added in backend/src/tools/tool-executor.ts.
  **Fix:** Remove duplicate import and run the build/tests locally to catch such issues early.

- **Issue:** processStreamWithTags autocompletes with cb_easp: true always; may invalidate non-end tools’ schemas.
  **Fix:** Only append cb_easp for tools marked endsAgentStep or relax schema to ignore unknown fields on autocomplete.

- **Issue:** Didn’t ensure custom tool defs are transported to backend prompts. strings.ts expects customTools but assembler not updated.
  **Fix:** Plumb customTools through fileContext->assembleLocalAgentTemplates->AgentTemplate so prompts receive full definitions.

- **Issue:** Types in common/src/tools/list still restrict CodebuffToolCall to ToolName; executeToolCall changed to string.
  **Fix:** Refactor common types: permit string tool names in CodebuffToolCall, update discriminators/schemas accordingly.

- **Issue:** SDK/server validation split is unclear; client handlers don’t validate inputs against schema.
  **Fix:** Validate on server (already) and optionally mirror validation client-side before execution for better DX/errors.

- **Issue:** Documentation example/guide added, but no wiring to surface example agent in init or tests.
  **Fix:** Add the example agent to fixtures and a test that loads it, documents tools, and executes a mocked custom tool.

## 2025-10-21T02:35:01.856Z — add-reasoning-options (fa43720)

### Original Agent Prompt
Add a template-level reasoning configuration that agents can specify and have it applied at runtime. Introduce an optional "reasoningOptions" field on agent definitions and dynamic templates (supporting either a max token budget or an effort level, with optional enable/exclude flags). Validate this field in the dynamic template schema. Update the streaming path so these options are passed to the OpenRouter provider as reasoning settings for each agent. Centralize any provider-specific options in the template-aware streaming code and remove such configuration from the lower-level AI SDK wrapper. Provide a baseline agent example that opts into high reasoning effort.

### Lessons
- **Issue:** Enabled reasoning in factory/base.ts, affecting all base-derived agents, instead of providing a single baseline example.
  **Fix:** Add reasoningOptions only in .agents/base-lite.ts to demo high-effort; keep factory defaults unchanged.

- **Issue:** Changed providerOptions key from 'gemini' to 'google' in prompt-agent-stream.ts, diverging from repo convention/GT.
  **Fix:** Preserve existing keys; use 'gemini' in prompt-agent-stream.ts per providerModelNames mapping.

- **Issue:** Used camelCase 'maxTokens' in types/schemas; OpenRouter expects 'max_tokens'. This adds unnecessary mapping debt.
  **Fix:** Use provider-compatible snake_case 'max_tokens' in AgentDefinition and dynamic schema for direct pass-through.

- **Issue:** Used any-casts when setting providerOptions.openrouter.reasoning, reducing type safety and clarity.
  **Fix:** Import OpenRouterProviderOptions and type providerOptions.openrouter; assign reasoningOptions without any casts.

- **Issue:** Removed thinkingBudget from promptAiSdkStream options signature, risking call-site breakage without need.
  **Fix:** Keep public function signatures stable; only relocate provider-specific config to prompt-agent-stream.

- **Issue:** Missed converting import to type-only in .agents/factory/base.ts (ModelName), causing unnecessary runtime import.
  **Fix:** Use \`import type { ModelName }\` to match repo style and avoid bundling types at runtime.

- **Issue:** Dynamic template schema used 'maxTokens' + superRefine, deviating from provider shape and GT expectations.
  **Fix:** Validate reasoningOptions as enabled/exclude + union of {max_tokens} or {effort} using Zod .and + union per GT.

- **Issue:** Conditional/gated mapping for reasoning (enabled/effort/maxTokens) adds complexity and diverges from GT.
  **Fix:** Pass template.reasoningOptions directly to providerOptions.openrouter.reasoning; let provider enforce flags.

- **Issue:** Re-declared reasoningOptions shape in AgentTemplate instead of referencing provider types, risking drift.
  **Fix:** Type AgentTemplate.reasoningOptions as OpenRouterProviderOptions['reasoning'] for consistency and safety.

## 2025-10-21T02:41:42.557Z — autodetect-knowledge (00e8860)

### Original Agent Prompt
Add automatic discovery of knowledge files in the SDK run state builder. When users call the SDK without providing knowledge files but do provide project files, detect knowledge files from the provided project files and include them in the session. Treat files as knowledge files when their path ends with knowledge.md or claude.md (case-insensitive). Leave explicit knowledgeFiles untouched when provided. Update the changelog for the current SDK version to mention this behavior change.

### Lessons
- **Issue:** Used an inline IIFE in sdk/src/run-state.ts to compute fallback knowledgeFiles, hurting readability.
  **Fix:** Build fallback in a small helper (e.g., detectKnowledgeFilesFromProjectFiles) or a simple block; avoid IIFEs.

- **Issue:** No tests cover auto-discovery in initialSessionState, risking regressions and edge-case bugs.
  **Fix:** Add unit tests: undefined vs empty {}, case-insensitive matches, non-matching paths, and explicit override preservation.

- **Issue:** CHANGELOG updated for 0.1.9 but sdk/package.json still at 0.1.8, creating version mismatch.
  **Fix:** Keep versions in sync: bump sdk/package.json to 0.1.9 or mark the changelog section as Unreleased until the bump.

- **Issue:** Public docs/JSDoc don’t reflect the new auto-discovery behavior, potentially confusing SDK users.
  **Fix:** Update JSDoc for CodebuffClient.run and initialSessionState options to mention auto-detection when knowledgeFiles is undefined.

## 2025-10-21T02:41:48.918Z — update-tool-gen (f8fe9fe)

### Original Agent Prompt
Update the tool type generator to write its output into the initial agents template types file and make the web search depth parameter optional. Ensure the generator creates any missing directories so it doesn’t fail on fresh clones. Keep formatting via Prettier and adjust logs accordingly. Confirm that the agent templates continue to import from the updated tools.ts file and that no code depends on the old tools.d.ts path. Depth should be optional and default to standard behavior where omitted.

### Lessons
- **Issue:** Edited .agents/types/tools.ts unnecessarily. This is user-scaffolded output, not the generator target.
  **Fix:** Only write to common/src/templates/initial-agents-dir/types/tools.ts via the generator; don’t touch .agents/ files.

- **Issue:** Didn’t fully verify consumers of old path common/src/util/types/tools.d.ts beyond the generator script.
  **Fix:** Search repo-wide (incl. non-TS files) for tools.d.ts and update imports/docs; then run a typecheck/build to confirm.

- **Issue:** Made depth optional but didn’t normalize at use sites (backend/src/tools/handlers/tool/web-search.ts).
  **Fix:** Default at usage: const d = depth ?? 'standard'; pass { depth: d } to searchWeb and use d for credit calc/logging.

- **Issue:** Used ripgrep -t flags for unrecognized types (e.g., mjs/tsx), risking missed matches during verification.
  **Fix:** Use broader search: rg -n "tools\.d\.ts" --no-ignore or file globs; avoid invalid -t filters to catch all refs.

- **Issue:** Manually edited the generated template file while also changing the generator, risking drift.
  **Fix:** Rely on the generator output (compile-tool-definitions.ts) to produce tools.ts; avoid hand edits to generated targets.

## 2025-10-21T02:42:27.076Z — enforce-agent-auth (27d87d7)

### Original Agent Prompt
Secure the agent name validation flow and improve UX. Require an API key for the backend agent validation endpoint, return the agent display name when a match is found (both built-in and published), and have the CLI print the selected agent name immediately after successful validation. Remove the early startup agent name print to avoid duplicate/racing messages. Update tests to cover the new auth requirement and the displayName in responses.

### Lessons
- **Issue:** Used API_KEY_ENV_VAR in npm-app/src/index.ts without importing it, causing a compile/runtime error.
  **Fix:** Import API_KEY_ENV_VAR from @codebuff/common/constants at the top of index.ts before referencing it.

- **Issue:** validateAgentNameHandler returned 401 with {error} for missing key; response shape inconsistent with others.
  **Fix:** Return 403 with { valid:false, message:'API key required' } to match API schema and project conventions.

- **Issue:** CLI validateAgent exits the process on 401, which is stricter than spec and harms UX.
  **Fix:** Show a clear auth warning (login or set API key) and continue, or align with project behavior without process.exit.

- **Issue:** Agent name printing used plain 'Using agent:' without colors/format; inconsistent with CLI style.
  **Fix:** Print with project style: console.log(green(\`\nAgent: \${bold(displayName)}\`)) for consistency and readability.

- **Issue:** Backend tests assert 401 and {error} for missing API key, diverging from intended contract.
  **Fix:** Update tests to expect 403 and {valid:false,message:'API key required'} and keep displayName checks for success.

- **Issue:** validateAgent returns void; misses chance to return displayName for downstream use/tests.
  **Fix:** Return string|undefined (displayName) from validateAgent; still print, but expose the value for callers.

- **Issue:** Added local agent print 'Using agent:' which doesn’t match the 'Agent:' label used elsewhere.
  **Fix:** Use the same 'Agent:' label as elsewhere to avoid mixed phrasing and potential user confusion.

- **Issue:** Chose 401 for missing API key without checking project-wide precedent; ground truth used 403.
  **Fix:** Check existing endpoints/tests and align status codes accordingly (use 403 here) to avoid mismatches.

## 2025-10-21T02:44:14.254Z — fix-agent-steps (fe667af)

### Original Agent Prompt
Unify the default for the agent step limit and fix SDK behavior so that the configured maxAgentSteps reliably applies each run. Add a shared constant for the default in the config schema, make the SDK use that constant as the default run() parameter, and ensure the SDK sets stepsRemaining on the session state based on the provided or defaulted value. Update the changelog to reflect the fix.

### Lessons
- **Issue:** Config schema imported MAX_AGENT_STEPS_DEFAULT (25) from constants/agents.ts, changing default from 12 and adding cross-module coupling.
  **Fix:** Define DEFAULT_MAX_AGENT_STEPS=12 in common/src/json-config/constants.ts and use it in the zod .default(); treat it as the shared source.

- **Issue:** SDK run() defaulted via agents MAX_AGENT_STEPS_DEFAULT, not the config’s shared constant, risking divergence from config behavior.
  **Fix:** Import DEFAULT_MAX_AGENT_STEPS from json-config/constants and set maxAgentSteps=DEFAULT_MAX_AGENT_STEPS in the run() signature.

- **Issue:** Did not update sdk/CHANGELOG.md; added a scripts/changelog MDX entry instead of the required SDK package changelog.
  **Fix:** Edit sdk/CHANGELOG.md and add a Fixed entry (e.g., “maxAgentSteps resets every run”); avoid unrelated docs changes.

- **Issue:** Computed default inside run() (effectiveMaxAgentSteps = ... ?? const) instead of defaulting the parameter, reducing clarity.
  **Fix:** Default the parameter in the signature: run({ ..., maxAgentSteps = DEFAULT_MAX_AGENT_STEPS }) and use it directly.

- **Issue:** Tests were modified to import MAX_AGENT_STEPS_DEFAULT from agents, binding tests to the wrong layer and the 25 value.
  **Fix:** If tests need updates, import DEFAULT_MAX_AGENT_STEPS from json-config/constants and assert the schema’s default (12).

- **Issue:** getDefaultConfig() was set to MAX_AGENT_STEPS_DEFAULT (25), diverging from the intended 12 config default.
  **Fix:** Keep getDefaultConfig in sync with the schema: use DEFAULT_MAX_AGENT_STEPS (12) from json-config/constants.ts.

## 2025-10-21T02:46:25.999Z — type-client-tools (af3f741)

### Original Agent Prompt
Strengthen and centralize typing for tool calls across the monorepo. Move the tool call types to the shared common package, define a discriminated union for client-invokable tools, and update the backend to consume these shared types. Remove the backend-local duplicates, ensure the main prompt API no longer exposes toolCalls, and align the eval scaffolding code with the new types. Keep runtime behavior unchanged—this is a typing and import refactor focused on safety and clarity.

### Lessons
- **Issue:** Added common/src/types/tools.ts duplicating schemas; lost Zod-backed runtime validation and created a second source of truth.
  **Fix:** Co-locate shared types with llmToolCallSchema in common/src/tools/list.ts and re-export; keep Zod-backed validation.

- **Issue:** Client tool union was hand-listed; not derived from publishedTools/llmToolCallSchema, risking drift and gaps.
  **Fix:** Derive ClientInvokableToolName from publishedTools and map params from llmToolCallSchema to a discriminated union.

- **Issue:** requestClientToolCall generic remained ToolName, allowing non-client tools through weak typing.
  **Fix:** Narrow requestClientToolCall to ClientInvokableToolName and update all handlers to pass precise union members.

- **Issue:** Handlers/stream-parser/tool-executor still rely on local types; partial migration weakens type safety.
  **Fix:** Import CodebuffToolCall/ClientToolCall from common everywhere and delete backend-local type exports.

- **Issue:** Changed loop-main-prompt to a single call, altering runtime behavior against the refactor-only requirement.
  **Fix:** Preserve loop semantics; only remove toolCalls from types/returns. If unused, delete file without logic changes.

- **Issue:** common/src/tools/list.ts wasn’t aligned with new shared types, leaving two divergent type sources.
  **Fix:** Centralize all tool type exports in common/tools/list.ts (or constants) and re-export elsewhere to avoid drift.

- **Issue:** Evals scaffolding updated imports only; logic ignores client-invokable subset and special input shapes.
  **Fix:** Type toolCalls as ClientToolCall, restrict to client tools, and adapt FileChange and run_terminal_command modes.

- **Issue:** websocket requestToolCall path not constrained to client tools; accepts arbitrary tool names/params.
  **Fix:** Type requestToolCall and all callers to ClientInvokableToolName with params inferred from schema.

- **Issue:** tool-executor/parseRawToolCall kept local types; not wired to shared unions or client-call constraints.
  **Fix:** Refactor parseRawToolCall/executeToolCall to use common types and emit ClientToolCall for client-executed tools.

- **Issue:** Unrelated import changes (e.g., @codebuff/common/old-constants) add risk and scope creep.
  **Fix:** Limit edits to tool typing/import refactor only; avoid touching unrelated constants or behavior.

## 2025-10-21T02:48:00.593Z — unify-api-auth (12511ca)

### Original Agent Prompt
Unify HTTP authentication between the CLI and backend by standardizing on a single API key header. Introduce small utilities to construct this header on the CLI and to extract it on the server, then update the agent validation and repository coverage endpoints, as well as the admin middleware, to use it. Keep existing response shapes and behaviors intact and ensure tests still pass.

### Lessons
- **Issue:** Used header name 'X-Codebuff-API-Key' vs canonical 'x-codebuff-api-key', causing inconsistency across CLI/server and tests.
  **Fix:** Standardize on 'x-codebuff-api-key' everywhere. Define a single constant and use it for both creation and extraction.

- **Issue:** Returned generic 401 text ('Missing or invalid authorization header') instead of explicit 'Missing x-codebuff-api-key header'.
  **Fix:** Preserve exact error strings. Respond with 401 { error: 'Missing x-codebuff-api-key header' } to match spec/tests.

- **Issue:** Server extractor accepted Bearer tokens, undermining the goal to standardize on one header for HTTP endpoints.
  **Fix:** Only accept x-codebuff-api-key on HTTP endpoints. Remove Bearer fallback from server extractor used by routes.

- **Issue:** Placed extractor in common/src, increasing cross-package coupling; task called for a small server utility.
  **Fix:** Create a backend-local helper (e.g., backend/src/util/auth-helpers.ts) and use it in API routes/middleware.

- **Issue:** Modified backend/src/api/usage.ts, which was not within the requested endpoints, adding scope risk.
  **Fix:** Limit changes to the specified areas (agent validation, repo coverage, admin middleware) to reduce regression risk.

- **Issue:** Logging used info-level for auth header presence in validate-agent handler, adding noise to logs.
  **Fix:** Use debug-level logging for header presence checks to avoid elevating routine diagnostics to info.

- **Issue:** Did not align server error text to explicitly reference the new header, reducing developer guidance.
  **Fix:** Update 401/403 texts to explicitly mention 'x-codebuff-api-key' where relevant, while preserving status shapes.

## 2025-10-21T02:48:14.602Z — add-agent-validation (26066c2)

### Original Agent Prompt
Add a lightweight agent validation system that prevents running with unknown agent IDs.

On the server, expose a GET endpoint to validate an agent identifier. It should accept a required agentId query parameter, respond with whether it's valid, and include a short-lived cache for positive results. A valid agent can be either a built-in agent or a published agent, and the response should clarify which source it came from and return a normalized identifier. Handle invalid input with a 400 status and structured error. Log when authentication info is present.

On the CLI, when a specific agent is provided, validate it before starting the session. If the agent is already loaded locally, skip remote validation. Otherwise, call the backend endpoint, include any available credentials, show a spinner while checking, and exit early with a helpful message when the agent is unknown. If there is a network problem, warn and continue. Add minimal tests to cover pass-through and short-circuit cases.

### Lessons
- **Issue:** Used getBuiltInAgents (not in repo) in backend/npm utils/tests; will not compile.
  **Fix:** Use AGENT_PERSONAS/AGENT_IDS from common/src/constants/agents to detect built-ins by ID.

- **Issue:** Client only sent Authorization; ignored API key env. Missed 'include any credentials'.
  **Fix:** Attach both Authorization (authToken) and X-API-Key from API_KEY_ENV_VAR when calling backend.

- **Issue:** Server logs only noted Authorization presence; didn’t log X-API-Key as requested.
  **Fix:** In handler, log hasAuthHeader and hasApiKey (no secrets) alongside agentId for auditability.

- **Issue:** No backend tests added for the new GET endpoint; regressions unguarded.
  **Fix:** Add tests under backend/src/api/__tests__ covering 400, builtin, published, unknown, cache hit.

- **Issue:** CLI tests didn’t verify agentId pass-through in query string to backend.
  **Fix:** Add a test asserting URLSearchParams agentId equals the original (publisher/name@version).

- **Issue:** Redundant loadLocalAgents call before session; duplicates earlier startup loading.
  **Fix:** Reuse the initial load result or expose loadedAgents; pass to validation to short-circuit.

- **Issue:** Built-in check compared raw id; no basic normalization could yield false negatives.
  **Fix:** Trim input and match against AGENT_IDS; optionally normalize case if IDs are case-insensitive.

- **Issue:** Positive cache in server never prunes; Map can grow unbounded under varied queries.
  **Fix:** Implement TTL sweep or size-capped LRU eviction to bound memory usage.

- **Issue:** Server handler didn’t log success/failure context (e.g., source, cache hits).
  **Fix:** Add debug/info logs for cache hit/miss, source chosen, normalizedId (no secrets).

- **Issue:** Validation behavior lives in utils only; no exported CLI-level function for e2e tests.
  **Fix:** Export a validateAgent helper used by index.ts so tests can verify full pre-check behavior.

## 2025-10-21T02:48:36.995Z — refactor-agent-validation (90f0246)

### Original Agent Prompt
Refactor the CLI agent validation so that the agent name resolution happens in the CLI module rather than the main index entrypoint. Move the agent validation function into the CLI code, have it return the resolved display name without printing, and adjust the CLI startup to display the resolved agent name before the greeting. Remove the old validation function and its usage from the entry file, clean up unused imports, and update the corresponding unit test to import from the new location. Keep the existing backend endpoint contract intact.

### Lessons
- **Issue:** CLI.validateAgent returns undefined for local agents, so the caller can’t print the resolved name.
  **Fix:** On local hit, return the displayName (id->config or name match), e.g., localById?.displayName || localByDisplay?.displayName || agent.

- **Issue:** printInitialPrompt uses loadedAgents without ensuring they’re loaded, risking race/unnecessary backend calls.
  **Fix:** await loadLocalAgents({verbose:false}) before validateAgent; pass agents into it, then print name, then displayGreeting.

- **Issue:** validateAgent defaults to getCachedLocalAgentInfo which may be empty/stale, breaking local resolution.
  **Fix:** Require a localAgents param or load if missing (call loadLocalAgents) to ensure deterministic local matching.

- **Issue:** Test didn’t assert returned name for local agents, so missing local displayName return went unnoticed.
  **Fix:** Add test: expect(await validateAgent(agent,{[agent]:{displayName:'X'}})).toBe('X'); also cover displayName-only lookup.

- **Issue:** validateAgent compares against raw loadedAgents structure, risking mismatch when checking displayName.
  **Fix:** Normalize local agents to {id:{displayName}} before checks; compare consistently by id and displayName.

## 2025-10-21T02:51:02.634Z — add-run-state-helpers (6a107de)

### Original Agent Prompt
Add new run state helper utilities to the SDK to make it easy to create and modify runs, and refactor the client and exports to use them. Specifically: introduce a module that can initialize a fresh SessionState and wrap it in a RunState, provide helpers to append a new message or replace the entire message history for continuing a run, update the client to use this initializer instead of its local implementation, and expose these helpers from the SDK entrypoint. Update the README to show a simple example where a previous run is augmented with an image message before continuing, and bump the SDK version and changelog accordingly.

### Lessons
- **Issue:** Helper names diverged from expected API (used create*/make*/append*/replace* vs initialSessionState/generate*/withAdditional*/withMessageHistory).
  **Fix:** Match the intended names: initialSessionState, generateInitialRunState, withAdditionalMessage, withMessageHistory; update client/README accordingly.

- **Issue:** Kept exporting getInitialSessionState from SDK entrypoint and omitted a removal/deprecation note in the changelog, causing API ambiguity.
  **Fix:** Remove (or deprecate) getInitialSessionState from index exports and add a changelog entry noting its removal or deprecation for clarity.

- **Issue:** README image message uses Anthropic-style base64 'source' shape, not CodebuffMessage/modelMessageSchema; likely types/runtime mismatch.
  **Fix:** Use modelMessageSchema format, e.g. { type: 'image', image: new URL('https://...') }, and show withAdditionalMessage on a RunState.

- **Issue:** appendMessageToRun/replaceMessageHistory only shallow-copy session state; callers can mutate shared nested state inadvertently.
  **Fix:** Deep clone before modifying (e.g., JSON.parse(JSON.stringify(runState)) or structuredClone) to ensure immutability of nested state.

- **Issue:** SDK entrypoint exports renamed helpers (createInitialSessionState/makeInitialRunState) instead of the intended helper names.
  **Fix:** Export initialSessionState, generateInitialRunState, withAdditionalMessage, withMessageHistory from sdk/src/index.ts as the public API.

- **Issue:** README doesn’t show creating a fresh RunState, reducing discoverability of the initializer helper.
  **Fix:** Add a minimal example using generateInitialRunState (or equivalent) to create an empty run, then augment via withAdditionalMessage.

## 2025-10-21T02:52:33.654Z — fix-agent-publish (4018082)

### Original Agent Prompt
Update the agent publishing pipeline so the publish API accepts raw agent definitions, validates them centrally, and allows missing prompts. On the validator side, return both compiled agent templates and their validated dynamic forms. In the CLI, adjust agent selection by id/displayName and send raw definitions to the API. Ensure that optional prompts are treated as empty strings during validation and that the API responds with clear validation errors when definitions are invalid.

### Lessons
- **Issue:** Publish request schema still enforces DynamicAgentDefinitionSchema[] (common/src/types/api/agents/publish.ts), rejecting truly raw defs.
  **Fix:** Accept fully raw input: data: z.record(z.string(), z.any()).array(). Validate centrally via validateAgents in the API route.

- **Issue:** Validator naming drift: validateAgents returns dynamicDefinitions and validateSingleAgent returns dynamicDefinition (vs dynamicTemplates).
  **Fix:** Standardize names to dynamicTemplates/dynamicAgentTemplate to reflect parsed forms and keep API/route usage consistent.

- **Issue:** CLI publish still matches by map key (file key) using Object.entries in npm-app/src/cli-handlers/publish.ts; can select by filename.
  **Fix:** Match only by id or displayName using Object.values; build matchingTemplates keyed by template.id to avoid file-key collisions.

- **Issue:** validateSingleAgent doesn't re-default prompts when constructing AgentTemplate, relying solely on schema defaults.
  **Fix:** Set systemPrompt/instructionsPrompt/stepPrompt to '' when building AgentTemplate for robustness if schema defaults change.

## 2025-10-21T02:56:18.897Z — centralize-placeholders (29d8f3f)

### Original Agent Prompt
Unify agent prompt placeholders by centralizing PLACEHOLDER and its types in the secret agent definitions and updating all agent prompt/factory modules to import from there. Remove the old backend prompt files that duplicated this logic. Make sure there are no dangling references and that prompt formatting still injects the same values at runtime.

### Lessons
- **Issue:** Imported PLACEHOLDER from a non-existent path (@codebuff/common/.../secret-agent-definition), causing dangling refs.
  **Fix:** Only import from existing modules or add the file first. Create the common secret-agent-definition.ts before updating imports.

- **Issue:** Changed common/agent-definition.ts to re-export from './secret-agent-definition' which doesn’t exist in common.
  **Fix:** Either add common/.../secret-agent-definition.ts or re-export from an existing module. Don’t point to files that aren’t there.

- **Issue:** Left duplicated backend prompt files (backend/src/templates/{ask-prompts,base-prompts}.ts) instead of removing them.
  **Fix:** Delete the old backend prompt files per spec. Ensure all references point to the unified agents prompts; no duplicate logic remains.

- **Issue:** Modified backend prompt files that were meant to be removed, increasing diff noise and risk of drift.
  **Fix:** Avoid editing files scheduled for deletion. Remove them and update imports/usage sites to the single source of truth.

- **Issue:** Centralized across packages without a clear plan, introducing cross-package breakage and unresolved imports.
  **Fix:** Pick one canonical location (common). Add the file there, then re-export via backend/src/templates/types.ts to keep consumers stable.

- **Issue:** Did not ensure all backend consumers import via a single re-export point; mixed direct and central imports.
  **Fix:** Make backend/src/templates/types.ts the sole backend import point. Update backend files to import PLACEHOLDER/typing from './types'.

- **Issue:** Did not validate the repo after refactor (no typecheck/build), so broken imports slipped in.
  **Fix:** Run a full typecheck/build after edits. Fix any unresolved modules before concluding to meet the “no dangling refs” requirement.

- **Issue:** Changed import paths in backend/strings.ts to a path that wasn’t created, risking runtime failures.
  **Fix:** Update strings.ts only after the target module exists. If centralizing, add the module first, then adjust imports.

- **Issue:** Did not verify that prompt formatting still injects the same values at runtime post-refactor.
  **Fix:** Smoke-test formatPrompt before/after (or add a snapshot test) to confirm identical placeholder replacements and values.

- **Issue:** Inconsistent type exports (PlaceholderValue) across modules, risking type import breaks.
  **Fix:** Re-export PlaceholderValue alongside PLACEHOLDER at the central file and ensure all imports consistently use that re-export.

## 2025-10-21T02:58:10.976Z — add-sdk-terminal (660fa34)

### Original Agent Prompt
Add first-class SDK support for running terminal commands via the run_terminal_command tool. Implement a synchronous, cross-platform shell execution helper with timeout and project-root cwd handling, and wire it into the SDK client’s tool-call flow. Ensure the tool-call-response uses the standardized output object instead of the previous result string and that errors are surfaced as text output. Match the behavior and message schema used by the server and the npm app, but keep the SDK implementation minimal without background mode.

### Lessons
- **Issue:** Used spawnSync, blocking Node’s event loop during command runs; hurts responsiveness even for short commands.
  **Fix:** Use spawn with a Promise and a kill-on-timeout guard. Keep SYNC semantics at tool level without blocking the event loop.

- **Issue:** Did not set color-forcing env vars, so some CLIs may not emit rich output (then stripped to plain).
  **Fix:** Match npm app env: add FORCE_COLOR=1, CLICOLOR=1, CLICOLOR_FORCE=1 (and PAGER/GIT_PAGER) to command env.

- **Issue:** Status text omitted cwd context shown by npm app (e.g., cwd line). Minor parity gap.
  **Fix:** Append a cwd line in status (project-root resolved path) to mirror npm-app output and aid debugging.

- **Issue:** When returning a terminal_command_error payload, success stayed true and error field was empty.
  **Fix:** If output contains a terminal_command_error, also populate error (and optionally set success=false) for clearer signaling.

- **Issue:** handleToolCall lacked an explicit return type tied to WebSocketHandler, risking drift from schema.
  **Fix:** Annotate return type as ReturnType<WebSocketHandler['handleToolCall']> to lock to the expected schema.

- **Issue:** Timeout/termination status omitted the signal, reducing diagnostic clarity on killed processes.
  **Fix:** Include res.signal (e.g., 'Terminated by signal: SIGTERM') in status when present to improve parity and debuggability.

## 2025-10-21T02:59:05.311Z — align-agent-types (ea45eda)

### Original Agent Prompt
Unify the .agents local agent typing and examples with the repository’s established tool call and schema shapes. Ensure all tool calls use an input object (not args), and require JsonObjectSchema for input/output object schemas. Align the documentation comments and the three example agents under .agents/examples with these conventions without changing backend or common packages.

### Lessons
- **Issue:** Example 01 used find_files with input.prompt; param name likely mismatched the tool schema, risking runtime/type errors.
  **Fix:** Check .agents/types/tools.ts and use the exact params find_files expects (e.g., correct key names) inside input.

- **Issue:** Example 03 set_output passed toolResult directly but outputSchema requires findings: string[]. Likely schema mismatch.
  **Fix:** Transform toolResult to match outputSchema, e.g., findings: Array.isArray(x)? x : [String(x)] before calling set_output.

- **Issue:** Example 03 spawned 'file-picker' locally; repo examples use fully-qualified ids like codebuff/file-picker@0.0.1.
  **Fix:** Use fully-qualified spawnable agent ids (e.g., codebuff/file-picker@0.0.1) to match repository conventions.

- **Issue:** Docblocks in .agents/types/agent-definition.ts weren’t comprehensively updated to emphasize input-object calls.
  **Fix:** Revise all handleSteps examples/comments to consistently show toolName + input object usage and remove args mentions.

- **Issue:** Not all examples validated against actual tool schemas; subtle param drift (e.g., set_output payload shape) slipped in.
  **Fix:** Cross-check every example’s input payload against tool typings before committing; align shapes to types precisely.

- **Issue:** Spawnable agent list in Example 03 didn’t reflect the agent store naming used elsewhere in repo examples.
  **Fix:** Mirror repo examples: declare spawnableAgents with fully-qualified ids and ensure toolNames include spawn_agents and set_output.

- **Issue:** No explicit note added in examples/readme reinforcing JsonObjectSchema requirement for object schemas.
  **Fix:** Add concise comments in examples/docs: object schemas must use JsonObjectSchema (type: 'object') for input/output.

## 2025-10-21T03:00:16.042Z — surface-history-access (6bec422)

### Original Agent Prompt
Make dynamic agents not inherit prior conversation history by default. Update the generated spawnable agents description so that, for any agent that can see the current message history, the listing explicitly states that capability. Keep showing each agent’s input schema (prompt and params) when available, otherwise show that there is none. Ensure the instructions prompt includes tool instructions, the spawnable agents description, and output schema details where applicable.

### Lessons
- **Issue:** Added extra visibility lines (negative/unknown) in spawnable agents description beyond spec.
  **Fix:** Only append "This agent can see the current message history." when includeMessageHistory is true; omit else/unknown lines.

- **Issue:** Built the description with unconditional strings, risking noise and blank lines.
  **Fix:** Use buildArray to conditionally include the visibility line and schema blocks, then join for clean, minimal output.

- **Issue:** Added "Visibility: Unknown" for unknown agent templates, increasing verbosity.
  **Fix:** Keep unknown agents minimal: show type and input schema details only; don’t mention visibility for unknowns.

## 2025-10-21T03:04:04.761Z — move-agent-templates (26e84af)

### Original Agent Prompt
Centralize the built-in agent templates and type definitions under a new common/src/templates/initial-agents-dir. Update the CLI to scaffold user .agents files by copying from this new location instead of bundling from .agents. Update all imports in the SDK and common to reference the new AgentDefinition/ToolCall types path. Remove the old re-export that pointed to .agents so consumers can’t import from the legacy location. Keep runtime loading of user-defined agents from .agents unchanged and ensure the codebase builds cleanly.

### Lessons
- **Issue:** Kept common/src/types/agent-definition.ts as a re-export (now to new path) instead of removing it, weakening path enforcement.
  **Fix:** Delete the file or stop re-exporting. Force consumers to import from common/src/templates/.../agent-definition directly.

- **Issue:** Missed updating test import in common/src/types/__tests__/dynamic-agent-template.test.ts to the new AgentDefinition path.
  **Fix:** Change import to '../../templates/initial-agents-dir/types/agent-definition' so type-compat tests build and validate correctly.

- **Issue:** Introduced types/secret-agent-definition.ts under initial-agents-dir, which wasn’t requested and adds scope creep.
  **Fix:** Keep scope tight. Only move README, examples, tools.ts, agent-definition.ts, and my-custom-agent.ts as specified.

- **Issue:** Did not mirror GT change to import AGENT_TEMPLATES_DIR from '@codebuff/common/old-constants' in the CLI scaffolder.
  **Fix:** Update npm-app/src/cli-handlers/agents.ts to import AGENT_TEMPLATES_DIR from '@codebuff/common/old-constants'.

- **Issue:** No exhaustive repo-wide sweep; some AgentDefinition/ToolCall refs still used legacy paths (e.g., tests).
  **Fix:** Search for '.agents' and 'AgentDefinition' and update all imports across common/sdk/tests to the new templates path.

- **Issue:** Did not verify builds; cross-package "text" imports risk missing assets in release bundles.
  **Fix:** Run monorepo typecheck/build and ensure package includes/bundler ship common/src/templates/initial-agents-dir assets.

## 2025-10-21T03:04:54.094Z — add-agent-resolution (de3ea46)

### Original Agent Prompt
Add agent ID resolution and improve the CLI UX for traces, agents listing, and publishing. Specifically: create a small utility that resolves a CLI-provided agent identifier by preserving explicit org prefixes, leaving known local IDs intact, and defaulting unknown unprefixed IDs to a default org prefix. Use this resolver in both the CLI and client when showing the selected agent and when sending requests. Replace usage of the old subagent trace viewer with a new traces handler that improves the status hints and allows pressing 'q' to go back (in both the trace buffer and the trace list). Update the agents menu to group valid custom agents by last modified time, with a "Recently Updated" section for the past week and a "Custom Agents" section for the rest; show a placeholder when none exist. Finally, make publishing errors clearer by printing a concise failure line, optional details, and an optional hint, and ensure the returned error contains non-duplicated fields for callers. Keep the implementation consistent with existing patterns in the codebase.

### Lessons
- **Issue:** Kept using cli-handlers/subagent.ts; no new traces handler or import updates in cli.ts/client.ts/subagent-list.ts.
  **Fix:** Create cli-handlers/traces.ts, move trace UI there, and update all imports to './traces' with improved status and 'q' support.

- **Issue:** Trace list 'q' exit checks key.name==='q' without guarding ctrl/meta; Ctrl+Q may exit unintentionally.
  **Fix:** Only exit on plain 'q': use (!key?.ctrl && !key?.meta && str==='q') in both trace list and buffer handlers.

- **Issue:** Agents menu doesn’t filter to valid custom agents and ignores metadata; shows all files with generic desc.
  **Fix:** Use loadedAgents to filter entries with def.id && def.model, group by mtime, and show def.description; add placeholder if none.

- **Issue:** Resolver added in common/agent-name-normalization.ts and no tests; deviates from npm-app pattern and untested.
  **Fix:** Add npm-app/src/agents/resolve.ts and npm-app/src/agents/resolve.test.ts covering undefined/prefixed/local/default-prefix cases.

- **Issue:** Resolver knownIds built via getAllAgents(...), not strictly "known local IDs" as spec requested.
  **Fix:** Derive knownIds from Object.keys(localAgentInfo) (local IDs only) to decide when to prefix; still preserve explicit org prefixes.

- **Issue:** Publish flow doesn’t propagate server 'hint' to callers or print it; returns only error/details.
  **Fix:** Include hint in publishAgentTemplates error object and print yellow 'Hint: ...' when present; keep fields non-duplicated.

## 2025-10-21T03:10:54.539Z — add-prompt-error (9847358)

### Original Agent Prompt
Introduce a distinct error channel for user prompts. Add a new server action that specifically reports prompt-related failures, wire server middleware and the main prompt execution path to use it when the originating request is a prompt, and update the CLI client to listen for and display these prompt errors just like general action errors. Keep existing success and streaming behaviors unchanged.

### Lessons
- **Issue:** Defined prompt-error with promptId; codebase standardizes on userInputId (e.g., response-chunk). Inconsistent ID naming.
  **Fix:** Use userInputId in prompt-error schema/payload and pass action.promptId into it. Keep ID fields consistent across actions.

- **Issue:** onPrompt sent error response-chunks and a prompt-response in addition to new prompt-error, causing duplicate/noisy output.
  **Fix:** On failure, emit only prompt-error and skip response-chunk/prompt-response. Preserve success streaming, not error duplication.

- **Issue:** Middleware duplicated prompt vs non-prompt branching in 3 places, risking drift and errors.
  **Fix:** Create a helper (e.g., getServerErrorAction) that returns prompt-error or action-error based on action.type; reuse it.

- **Issue:** CLI added a separate prompt-error subscriber duplicating action-error handling logic.
  **Fix:** Extract a shared onError handler and subscribe both 'action-error' and 'prompt-error' to it to avoid duplication.

- **Issue:** Left ServerAction/ClientAction types non-generic, reducing type precision and ergonomics across handlers.
  **Fix:** Export generic ServerAction<T>/ClientAction<T> and use Extract-based typing for subscribers/handlers for safer code.

- **Issue:** Kept augmenting message history and scheduling prompt-response on errors, altering prompt session semantics.
  **Fix:** Do not modify history or send prompt-response on error; just emit prompt-error to report failure cleanly.

## 2025-10-21T03:12:06.098Z — stop-think-deeply (97178a8)

### Original Agent Prompt
Update the agent step termination so that purely reflective planning tools do not cause another step. Introduce a shared list of non-progress tools (starting with think_deeply) and adjust the end-of-step logic to end the turn whenever only those tools were used, while still ending on explicit end_turn. Keep the change minimal and localized to the agent step logic and shared tool constants.

### Lessons
- **Issue:** Termination checked only toolCalls; toolResults were ignored. If a result from a progress tool appears, the step might not end correctly.
  **Fix:** Filter both toolCalls and toolResults by non-progress list; end when no progress items remain in either array (mirrors ground-truth logic).

- **Issue:** Used calls.length>0 && every(nonProgress). This duplicates the no-tools case and is brittle for edge cases and unexpected results.
  **Fix:** Compute hasNoProgress = calls.filter(!list).length===0 && results.filter(!list).length===0; set shouldEndTurn = end_turn || hasNoProgress.

- **Issue:** End-of-step debug log omitted shouldEndTurn (and flags), reducing observability when diagnosing loop behavior changes.
  **Fix:** Include shouldEndTurn (and the computed flag like hasNoProgress) in the final logger.debug payload for the step.

- **Issue:** Unnecessary type cast (call.toolName as ToolName) and non-type import of ToolName hurt type clarity.
  **Fix:** Use import type { ToolName } and avoid casts by relying on existing typing of toolCalls or narrowing via generics.

- **Issue:** Constant name nonProgressTools lacks intent about step control, making semantics less clear to future readers.
  **Fix:** Name the shared list to reflect behavior (e.g., TOOLS_WHICH_WONT_FORCE_NEXT_STEP) and keep it in common constants.

## 2025-10-21T03:13:08.010Z — update-agent-builder (ab4819b)

### Original Agent Prompt
Update the agent builder and example agents to support a new starter custom agent and align example configurations. Specifically: make the agent builder gather both existing diff-reviewer examples and a new your-custom-agent starter template; copy the starter template directly into the top-level agents directory while keeping examples under the examples subfolder; remove advertised spawnable agents from the builder; fix the agent personas to remove an obsolete entry and correct a wording typo; and refresh the diff-reviewer examples to use the current Anthropic model, correct the file-explorer spawn target, and streamline the final step behavior. Also add a new your-custom-agent file that scaffolds a Git Committer agent ready to run and publish.

### Lessons
- **Issue:** Removed wrong persona in common/src/constants/agents.ts (deleted claude4_gemini_thinking, left base_agent_builder).
  **Fix:** Remove base_agent_builder entry and keep others. Also fix typo to 'multi-agent' in agent_builder purpose.

- **Issue:** diff-reviewer-3 spawn target set to 'file-explorer' not a published id, breaking validation.
  **Fix:** Use fully qualified id: spawnableAgents: ['codebuff/file-explorer@0.0.1'] in both common and .agents examples.

- **Issue:** Streamlining left an extra add_message step in diff-reviewer-3 before final STEP_ALL.
  **Fix:** Remove the intermediate 'yield STEP' and the extra add_message; go directly to 'yield STEP_ALL' after step 4.

- **Issue:** Starter scaffold in common/src/util/your-custom-agent.ts used id 'your-custom-agent' and lacked spawn_agents/file-explorer.
  **Fix:** Create a Git Committer starter: id 'git-committer', include 'spawn_agents', spawnableAgents ['codebuff/file-explorer@0.0.1'].

- **Issue:** Builder injected publisher/version into starter via brittle string replaces and './constants' import.
  **Fix:** Author the starter file ready-to-use; builder should copy as-is to .agents root without string mutation/injection.

- **Issue:** Updated .agents/examples/* directly (generated outputs), causing duplication and drift.
  **Fix:** Only update source examples under common/src/util/examples; let the builder copy them to .agents/examples.

- **Issue:** diff-reviewer-3 example text wasn’t aligned with streamlined flow (kept separate review message step).
  **Fix:** Merge intent into step 4 message (spawn explorer then review) and end with a single 'yield STEP_ALL'.

- **Issue:** Left unused symbols (e.g., DEFAULT_MODEL) in backend/src/templates/agents/agent-builder.ts.
  **Fix:** Remove or use unused constants/imports to avoid noUnusedLocals warnings after refactors.

## 2025-10-21T03:13:39.771Z — overhaul-agent-examples (bf5872d)

### Original Agent Prompt
Overhaul the example agents and CLI scaffolding. Replace the older diff-reviewer-* examples with three new examples (basic diff reviewer, intermediate git committer, advanced file explorer), update the CLI to create these files in .agents/examples, enhance the changes-reviewer agent to be able to spawn the file explorer while reviewing diffs or staged changes, add structured output to the file-explorer agent, and revise the default my-custom-agent to focus on reviewing changes rather than committing. Keep existing types and README generation intact.

### Lessons
- **Issue:** changes-reviewer spawnPurposePrompt didn’t mention staged changes.
  **Fix:** Update spawnPurposePrompt to “review code in git diff or staged changes” in .agents/changes-reviewer.ts.

- **Issue:** changes-reviewer didn’t guide spawning the file explorer during review.
  **Fix:** Inject an add_message hint before STEP_ALL to prompt spawning file-explorer and add spawn_agents usage.

- **Issue:** Old .agents/examples/diff-reviewer-*.ts files were left in repo.
  **Fix:** Delete diff-reviewer-1/2/3.ts to fully replace them with the new examples and avoid confusion.

- **Issue:** Advanced example agent lacks an outputSchema while using structured_output.
  **Fix:** Add outputSchema to .agents/examples/advanced-file-explorer.ts matching its set_output payload.

- **Issue:** Advanced example uses local 'file-picker' id instead of a fully qualified ID.
  **Fix:** Set spawnableAgents to 'codebuff/file-picker@0.0.1' and spawn that ID for clarity and portability.

- **Issue:** changes-reviewer kept 'end_turn' in toolNames while also using STEP/STEP_ALL.
  **Fix:** Remove 'end_turn' from toolNames to reduce model confusion; rely on STEP/STEP_ALL to end turns.

- **Issue:** Unused imports (e.g., AgentStepContext) remained in example files.
  **Fix:** Remove unused imports in examples to prevent lint/type warnings and keep code clean.

- **Issue:** File-explorer example output didn’t clearly align outputSchema with actual data shape.
  **Fix:** Ensure set_output fields match outputSchema (e.g., files: string[]) and keep names consistent across both.

## 2025-10-21T03:14:43.174Z — update-validation-api (0acdecd)

### Original Agent Prompt
Simplify the agent validation flow to not require authentication and to use an array-based payload. Update the CLI helper to send an array of local agent configs and call the web validation API without any auth. Update the web validation endpoint to accept an array, convert it to the format expected by the shared validator, and return the same response structure. Make sure initialization validates local agents even when the user is not logged in, and keep logging and error responses clear.

### Lessons
- **Issue:** Changed validate API payload to a top-level array, breaking callers expecting { agentConfigs }. See utils/agent-validation.ts and web route.
  **Fix:** Keep request envelope { agentConfigs: [...] } in client and server; convert to record internally; remove auth only.

- **Issue:** Renamed helper to validateLocalAgents, risking broken imports/tests. Prior name was used elsewhere (client, potential future refs).
  **Fix:** Preserve export name validateAgentConfigsIfAuthenticated; drop the user param and accept an array; update call sites only.

- **Issue:** Dropped typed request shape in web route; used unknown + Array.isArray. Lost explicit contract and validation detail.
  **Fix:** Define a typed ValidateAgentsRequest (or Zod schema) with agentConfigs: any[]; validate and return clear 400 errors on shape.

- **Issue:** No per-item validation in route; primitives or missing id entries are accepted and keyed as agent-i silently.
  **Fix:** Validate each item is an object with string id; reject or report which entries are invalid before calling validateAgents.

## 2025-10-21T03:17:32.159Z — migrate-agents (02ef7c0)

### Original Agent Prompt
Migrate custom agent scaffolding to a first-class .agents directory and shift file generation to the CLI. Add TypeScript type modules for agent definitions and tools under .agents/types, include a starter agent and three example diff reviewers, and provide a concise README for users. Update the backend agent builder to be model-only (no file I/O) and embed the type content for reference in its instructions. Remove legacy type/example copies in common, fix imports across common and sdk to point at the canonical types exported by common/src/types, and adjust the CLI to create the .agents directories/files using bundled text imports. Ensure the example agents use the modern model and spawnable agent IDs, and streamline their step flow.

### Lessons
- **Issue:** Did not add .agents/types modules; used inline .d.ts strings from CLI scaffolding.
  **Fix:** Create .agents/types/agent-definition.ts and tools.ts files and bundle them; import as text where needed.

- **Issue:** Agent builder performed fs/path I/O and copied files; not model-only.
  **Fix:** Remove file ops and handleSteps side effects; embed types via text imports and set outputMode to 'last_message'.

- **Issue:** Agent builder toolNames included add_message/set_output and excess tools.
  **Fix:** Use minimal tools: ['write_file','str_replace','run_terminal_command','read_files','code_search','spawn_agents','end_turn'].

- **Issue:** Examples used outdated model IDs (e.g., openai/gpt-5) contrary to spec.
  **Fix:** Update example models to anthropic/claude-4-sonnet-20250522 per modern baseline.

- **Issue:** diff-reviewer-3 spawnableAgents used a non-canonical ID.
  **Fix:** Set spawnableAgents to ['codebuff/file-explorer@0.0.1'] to match the agent store IDs.

- **Issue:** diff-reviewer-3 step flow was verbose with multiple STEP/add_message calls.
  **Fix:** Streamline flow and end with a single 'STEP_ALL' after priming any assistant message.

- **Issue:** Starter agent not created or named incorrectly (starter.ts).
  **Fix:** Add .agents/my-custom-agent.ts with a simple, runnable starter (e.g., Git Committer) using modern IDs.

- **Issue:** README in .agents was missing/minimal and not helpful.
  **Fix:** Provide a concise .agents/README.md with getting started, file structure, tool list, and usage tips.

- **Issue:** Legacy common/src/util/types and util/examples were left in place or neutered, not removed.
  **Fix:** Delete those legacy directories after fixing references; or replace files with pure re-exports and then remove dirs.

- **Issue:** Mixed re-exports with legacy declarations in common/src/util/types/tools.d.ts causing duplicate types.
  **Fix:** Replace file contents entirely with re-exports to canonical types; avoid any duplicated declarations.

- **Issue:** Introduced common/src/types.ts which conflicts with existing types directory.
  **Fix:** Avoid a top-level types.ts; add common/src/types/agent-definition.ts and re-export canonical .agents types.

- **Issue:** SDK build scripts still copy legacy util/types; risk breakage after deletion.
  **Fix:** Remove copy-types step in sdk/package.json; have sdk/src/types/* re-export from @codebuff/common/types.

- **Issue:** Imports across common/sdk not fully updated to canonical common/src/types.
  **Fix:** Point all imports (including tests) to '@codebuff/common/types' or local common/src/types re-exports.

- **Issue:** CLI scaffolding wrote raw strings instead of using bundled text imports for templates.
  **Fix:** Bundle the type/example/starter/README text and write files via ESM text imports in the CLI.

## 2025-10-21T03:18:26.438Z — restore-subagents-field (b30e2ef)

### Original Agent Prompt
Migrate the AgentState structure to use a 'subagents' array instead of 'spawnableAgents' across the schema, state initialization, spawn handlers, and tests. Ensure all places that construct or validate AgentState use 'subagents' consistently while leaving AgentTemplate.spawnableAgents intact. Update developer-facing JSDoc to clarify how to specify spawnable agent IDs. Keep the existing agent spawning behavior unchanged.

### Lessons
- **Issue:** Missed migrating async spawn handler: spawn-agents-async.ts still sets AgentState.spawnableAgents: [].
  **Fix:** Update backend/src/tools/handlers/tool/spawn-agents-async.ts to set subagents: [] when constructing child AgentState.

- **Issue:** Tests not updated: sandbox-generator.test.ts still builds AgentState with spawnableAgents: [].
  **Fix:** Change mock AgentState in backend/src/__tests__/sandbox-generator.test.ts to use subagents: [] to match AgentStateSchema.

- **Issue:** JSDoc for spawnable agent IDs is vague; doesn’t mandate fully-qualified IDs with publisher and version.
  **Fix:** Update docs to require 'publisher/name@version' or local '.agents' id. Mirror this in common/src/util/types/agent-config.d.ts.

- **Issue:** Refactor audit was incomplete; not all AgentState constructors were checked, leading to inconsistency.
  **Fix:** Run repo-wide search for AgentState literals and ‘spawnableAgents:’ and fix all to ‘subagents’, especially all spawn handlers.

- **Issue:** Didn’t validate behavior parity; leaving async path unmigrated risks runtime/type errors and altered spawn flow.
  **Fix:** After schema change, typecheck and verify spawning via sync, async, and inline paths to ensure unchanged behavior.

## 2025-10-21T03:23:52.779Z — expand-agent-types (68e4f6c)

### Original Agent Prompt
We need to let our internal .agents declare a superset of tools (including some client-only/internal tools) without affecting public agent validation. Add a new SecretAgentDefinition type for .agents that accepts these internal tools, switch our built-in agents to use it, and keep dynamic/public agents constrained to the public tool list. Also relocate the publishedTools constant from the tools list module to the tools constants module and update any imports that depend on it. No runtime behavior should change—this is a type/constant refactor that must compile cleanly and keep existing tests green.

### Lessons
- **Issue:** Did not add a dedicated SecretAgentDefinition for .agents to allow internal tools.
  **Fix:** Create .agents/types/secret-agent-definition.ts extending AgentDefinition with toolNames?: AllToolNames[].

- **Issue:** Modified the public AgentDefinition instead of isolating secret typing.
  **Fix:** Leave AgentDefinition untouched for public/dynamic agents; add a separate SecretAgentDefinition used only by .agents.

- **Issue:** Built-in .agents still used AgentDefinition.
  **Fix:** Switch all built-in agents to import/use SecretAgentDefinition (e.g., .agents/base.ts, ask.ts, base-lite.ts, base-max.ts, superagent.ts).

- **Issue:** publishedTools stayed in common/src/tools/list.ts.
  **Fix:** Move publishedTools to common/src/tools/constants.ts and export it alongside toolNames.

- **Issue:** Imports weren’t updated after moving publishedTools.
  **Fix:** Update import sites to use tools/constants (e.g., common/src/tools/compile-tool-definitions.ts and tests).

- **Issue:** Dynamic/public agent validation wasn’t constrained to public tools.
  **Fix:** Keep DynamicAgentDefinitionSchema using z.enum(toolNames) and ensure only public ToolName is allowed.

- **Issue:** Internal tool union was not defined as a clean superset of public tools.
  **Fix:** Define AllToolNames = Tools.ToolName | 'add_subgoal'|'browser_logs'|'create_plan'|'spawn_agents_async'|'spawn_agent_inline'|'update_subgoal'.

- **Issue:** Changes risked runtime behavior (editing core types/handlers).
  **Fix:** Make a type/constant-only refactor; do not change llmToolCallSchema, handlers, or runtime code paths.

- **Issue:** Missed updating all agent files to the new type (some remained on AgentDefinition).
  **Fix:** Grep all .agents/*.ts and replace AgentDefinition with SecretAgentDefinition consistently (incl. oss agents).

- **Issue:** Didn’t validate the refactor with a compile/test pass.
  **Fix:** Run typecheck/tests locally to catch missing imports or schema mismatches and keep tests green.

## 2025-10-21T03:26:22.005Z — migrate-agent-validation (2b5651f)

### Original Agent Prompt
Move dynamic agent validation out of the WebSocket init path and into a dedicated authenticated web API, and have the CLI validate locally loaded agents through that API when a user is logged in. Introduce a small CLI utility to call the API and print any validation warnings. Update the project file context to load local agent configs directly at initialization and avoid mixing agent templates into knowledge files. Finally, simplify the server init response to just usage data so the CLI no longer expects WebSocket-delivered agent names or validation messages.

### Lessons
- **Issue:** API route expects 'agents' but CLI util posts 'agentConfigs' (utils/agent-validation.ts) → 400s get swallowed.
  **Fix:** Standardize payload to 'agentConfigs' across route and callers; validate and return clear errors.

- **Issue:** Validation API auth used checkAuthToken and body authToken, diverging from NextAuth cookie session.
  **Fix:** Rely on getServerSession(authOptions) only; require NextAuth cookie from CLI for auth.

- **Issue:** CLI command /agents-validate sends authToken in JSON body instead of session cookie; inconsistent auth.
  **Fix:** Send Cookie: next-auth.session-token (like other CLI calls); drop authToken from body.

- **Issue:** dynamic-agents.knowledge.md was not removed; stale doc risks being ingested as knowledge.
  **Fix:** Delete backend/src/templates/dynamic-agents.knowledge.md to avoid mixing templates into knowledge.

- **Issue:** ProjectFileContext still sources agentTemplates from global loadedAgents (implicit state).
  **Fix:** Assign agentTemplates from await loadLocalAgents(...) return; avoid globals to prevent staleness.

- **Issue:** onInit removed fileContext from destructure while clients still send it; risks type/API drift.
  **Fix:** Keep fileContext in the init signature (even if unused) to match ClientAction and avoid regressions.

- **Issue:** Silent try/catch around startup validation hides API errors; no debug trail for failures.
  **Fix:** Log validation failures at debug/info and print a concise warning when validation cannot run.
  
${base2Fast.systemPrompt}`,
}
export default definition
