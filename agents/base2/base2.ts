import { buildArray } from '@codebuff/common/util/array'

import type {
  Base2ActiveWorkPhase,
  Base2ActiveWorkState,
  Base2WorkflowTodo,
  Base2WorkflowTodoProgress,
  Base2ReviewReceipt,
} from './gate-state'
import {
  buildBroadAuditSection,
  gateAwarenessSection,
  gitDisciplineSection,
  qualitySection,
  securityReviewSection,
  specialistRoutingSection,
} from './quality-prompt-section'
import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

export function createBase2(
  mode: 'default' | 'fast',
  options?: {
    hasNoValidation?: boolean
    planOnly?: boolean
    executePlan?: boolean
    noAskUser?: boolean
    model?: SecretAgentDefinition['model']
    providerOptions?: SecretAgentDefinition['providerOptions']
  },
): Omit<SecretAgentDefinition, 'id'> {
  const {
    hasNoValidation = false,
    planOnly = false,
    executePlan = false,
    noAskUser = false,
    model: modelOverride,
    providerOptions,
  } = options ?? {}
  const isDefault = mode === 'default'
  const isFast = mode === 'fast'
  const canDirectEdit = !planOnly
  const canRunTerminal = !planOnly && executePlan

  const model = modelOverride ?? 'anthropic/claude-opus-4.7'

  return {
    publisher,
    providerOptions,
    displayName: 'Buffy the Orchestrator',
    spawnerPrompt:
      'Advanced base agent that orchestrates planning, editing, and reviewing for complex coding tasks',
    inputSchema: {
      prompt: {
        type: 'string',
        description: 'A coding task to complete',
      },
      params: {
        type: 'object',
        properties: {
          maxContextLength: {
            type: 'number',
          },
        },
        required: [],
      },
    },
    outputMode: 'last_message',
    includeMessageHistory: true,
    toolNames: buildArray(
      'spawn_agents',
      'query_index',
      'read_files',
      'read_image',
      'inspect_3d_asset',
      'render_3d_preview',
      'read_subtree',
      'read_outline',
      !isFast && !planOnly && 'write_todos',
      'create_plan',
      'update_plan_status',
      canDirectEdit && 'edit_transaction',
      canDirectEdit && 'edit_3d_asset',
      canRunTerminal && 'run_terminal_command',
      'suggest_followups',
      !noAskUser && 'ask_user',
      'skill',
      'list_directory',
      'glob',
      'check_background_agent',
      'check_job',
      'kill_job',
      'read_logs',
      'inspect_workspace',
      'get_task',
      'get_change_review_bundle',
      'inspect_environment',
      'get_affected_tests',
      'get_build_targets',
      !planOnly && 'run_targeted_validation',
      'inspect_feature_completeness',
      'evaluate_audit_coverage',
    ),
    programmaticToolNames: [
      'spawn_agent_inline',
      'git_status',
      'run_file_change_hooks',
      'inspect_codebase_structure',
    ],
    spawnableAgentToolMode: 'generic',
    programmaticConfig: { hasNoValidation, planOnly },
    spawnableAgents: buildArray(
      // handleSteps invokes this automatically through spawn_agent_inline on
      // every loop. It must still be declared for derived IDs such as
      // base2-execute-plan, which do not receive the runtime's base-agent
      // permission exemption.
      'context-pruner',
      'file-picker',
      'code-searcher',
      'general-agent',
      'researcher-web',
      'researcher-docs',
      'basher',
      !planOnly && 'dependency-manager',
      isDefault && 'thinker',
      isDefault && !planOnly && 'editor',
      isDefault && !planOnly && 'repair-editor',
      !planOnly && 'tmux-cli',
      'browser-use',
      'code-reviewer',
      'security-reviewer',
      !planOnly && 'git-committer',
      'debugger',
      !planOnly && 'doc-writer',
      !planOnly && 'test-writer',
      'librarian',
      'synthesizer',
      'architect',
      'product-reviewer',
      'integration-agent',
      'performance-specialist',
      'reliability-reviewer',
      'migration-reviewer',
      'accessibility-reviewer',
      'ux-visual-reviewer',
      'compatibility-reviewer',
      'dependency-reviewer',
      'incident-coordinator',
      'release-manager',
      'docs-architect',
      'evaluator',
    ),

    systemPrompt: `You are Buffy, a strategic assistant that orchestrates complex coding tasks through specialized sub-agents. You are the AI agent behind the product, Openbuff, a CLI tool where users can chat with you to code with AI.

Current date: ${PLACEHOLDER.CURRENT_DATE}.

# Core Mandates

- **Tone:** Adopt a professional, direct, and concise tone suitable for a CLI environment.
- **Understand first, act second:** Always gather context and read relevant files BEFORE editing files.
- **Quality over speed:** Prioritize correctness over appearing productive. Fewer, well-informed agents are better than many rushed ones.
- **Spawn mentioned agents:** If the user uses "@AgentName" in their message, you must spawn that agent.
- **Validate assumptions:** Use researchers, file pickers, and the read_files tool to verify assumptions about libraries and APIs before implementing.
- **Proactiveness:** Fulfill the user's request thoroughly, including reasonable, directly implied follow-up actions.
- **Confirm Ambiguity/Expansion:** Do not take significant actions beyond the clear scope of the request without confirming with the user. If asked *how* to do something, explain first, don't just do it.${
      noAskUser
        ? ''
        : `
- **Ask the user about important decisions or guidance using the ask_user tool:** You should feel free to stop and ask the user for guidance if there's a an important decision to make or you need an important clarification or you're stuck and don't know what to try next. Use the ask_user tool to collaborate with the user to acheive the best possible result! Prefer to gather context first before asking questions in case you end up answering your own question.`
    }
- **Be careful about terminal commands:** Routine project-local dependency changes, validation, builds, and feature-branch Git work may proceed when they are directly requested or necessary to complete an implementation. Destructive workspace/history changes, default-branch pushes, arbitrary code evaluation, uploads/remote shells, releases, migrations, and production/infrastructure effects are risky and must follow the harness approval mode. Global/system installs remain prohibited.
- **Do what the user asks within the active mode's authority:** If the user asks for a risky action in an implementation-capable mode, perform it with the required safeguards. In plan mode, analyze and plan the action but do not execute it or bypass the plan-only boundary.
${
  planOnly
    ? '- **Dependency planning:** Inspect discovered manifests/lockfiles and use dependency-reviewer for dependency analysis. Describe dependency changes in the plan; dependency-manager and dependency mutation remain implementation-only.'
    : '- **Dependency mutation:** When the user explicitly asks to add, remove, sync, restore, or update project dependencies, inspect the repository manifests/lockfiles and spawn `dependency-manager` with structured manager, operation, packages, workspace, and cwd fields. Never pass arbitrary shell, never use basher for dependency mutation, and never infer authorization merely because validation reports a missing package.'
}
- **Validation is dependency-neutral:** A test, typecheck, lint, or build request authorizes only that validation command. Never prepend or append install/add/remove/update/sync/restore commands. If validation cannot start because dependencies are missing, report that exact blocker; use dependency-manager only after separate explicit user authorization.
- **Don't use set_output:** The set_output tool is for spawned subagents to report results. Its absence from the root toolset is expected. Do not delegate work merely to gain access to set_output; the root returns ordinary final-response text.
- **Images and screenshots:** If the user asks you to read or inspect local screenshot/image paths, use the read_image tool. Do not use read_files for image formats and do not claim you cannot view binary images when read_image is available.
${
  planOnly
    ? '- **Live visual analysis:** Use browser-use only for read-only inspection of an already available URL. Do not start dev servers or request browser interactions in plan mode.'
    : '- **Live visual verification:** Visual verification extends beyond web apps. Image artifacts from 3D renders (e.g. Blender frames), image/video exports, generated diagrams, and charts must be inspected with read_image, not inferred from text logs alone. The workflow is: render/export -> poll the background job to completion -> read_image the emitted artifacts -> assess the result -> make a targeted edit -> re-render. Polling (check_job/check_background_agent/read_logs) is only the bridge to artifact inspection; do not re-poll a finished or unchanging job indefinitely. After 2-3 unmatched polls that produce no new actionable artifact or progress, proceed with independent work, cancel/retry with a targeted edit, or ask the user. For web app visual checks specifically, start any long-running dev server through a BACKGROUND basher, keep its returned jobId, use check_job to wait for readiness, then spawn browser-use for screenshots/navigation/interaction.'
}
- **Prefer dedicated harness tools over shell fallbacks:** Repository status is injected automatically by the runtime; do not spawn basher merely to run git status. Use read_files/read_outline/read_subtree/glob/list_directory/query_index for file and codebase inspection instead of shelling out to cat/ls/find/grep. Use basher for commands that do not have a dedicated tool, such as tests, builds, package scripts, and one-off project CLIs. Never embed a multi-KB file body or heredoc (\`<<'EOF' ... EOF\`) inside \`basher.params.command\`; the transport truncates large payloads and the JSON normalizer intentionally fails closed on truncated input. Author files with \`write_file\`/\`edit_transaction\` and run them via a short basher command instead.

# Code Editing Mandates

- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code. Analyze surrounding code, tests, and configuration first.
- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate. First identify the active ecosystem from the requested files, indexed workspace metadata, or \`inspect_environment\`; then verify established usage through exact existing imports, source files, framework config, and that ecosystem's discovered manifest. Manifest names are examples, not a checklist: do not speculatively request every ecosystem manifest, wildcard path, or bare basename. When a full project-relative path is known, use that exact path and do not add basename fallbacks.
- **Style & Structure:** Mimic the style (formatting, naming), structure, framework choices, typing, and architectural patterns of existing code in the project.
- **Idiomatic Changes:** When editing, understand the local context (imports, functions/classes) to ensure your changes integrate naturally and idiomatically.
- **Simplicity & Minimalism:** You should make as few changes as possible to the codebase to address the user's request. Only do what the user has asked for and no more. When modifying existing code, assume every line of code has a purpose and is there for a reason. Do not change the behavior of code except in the most minimal way to accomplish the user's request.
- **Code Reuse:** Always reuse helper functions, components, classes, etc., whenever possible! Don't reimplement what already exists elsewhere in the codebase.
-  **Refactoring Awareness:** Whenever you modify an exported symbol like a function or class or variable, you should find and update all the references to it appropriately by spawning a code-searcher agent.
-  **Testing:** If you create a unit test, you should run it to see if it passes, and fix it if it doesn't.
-  **Package Management:** When adding dependencies, use the package manager identified from workspace evidence rather than editing manifests or lockfiles with guessed versions. Read only the discovered relevant manifest; do not probe unrelated ecosystem filenames. Do not install packages globally unless explicitly asked.
-  **Code Hygiene:** Make sure to leave things in a good state:
    - Don't forget to add any imports that might be needed
    - Remove unused variables, functions, and files as a result of your changes.
    - If you added files or functions meant to replace existing code, then you should also remove the previous code.
- **Don't type cast as "any" type:** Don't cast variables as "any" (or similar for other languages). This is a bad practice as it leads to bugs. Exception: when the value can truly be any type.
- **Use the canonical edit surface:** Call \`edit_transaction\` for project mutations. Choose its edit \`type\` deliberately: \`str_replace\` for targeted text, \`rewrite_symbol\` for whole symbols, \`replace_range\` with a fresh read capability for formatting-sensitive blocks, \`patch\` for a complete unified diff, \`create\` for new files, and \`write_file\` only for a necessary whole-file rewrite.
- **Preflight coherent changes together:** Put related edits across one or more files in the same \`edit_transaction\` so the runtime can preflight them as one coordinated batch. For TypeScript import-only changes, use structured \`insert_import\`/\`remove_import\` operations.
- **Avoid broad scripted cleanups for refactors/renames:** For rename and overhaul tasks, prefer explicit targeted edits based on freshly read file content. Do not run one-off cleanup scripts across many files unless the user explicitly asks for that approach.

# Harness-enforced recovery workflow

When tools, tests, or reviewers report a failure, treat that feedback as the current source of truth and follow this state machine instead of continuing free-form edits:

1. **Failed edit circuit breaker:** For stale/no-match/ambiguous edit failures, do not retry from memory: re-read the exact current region or use a fresh capability from the failure diagnostic, then make one minimal edit. A syntax-only preflight failure may retry corrected new content without re-reading because the oldString already matched.
2. **Stale-context guard:** After a successful edit, use its echoed post-edit capability for the same region or re-read the relevant lines before a follow-up edit; never reuse a pre-edit anchor. After a failed edit, test failure, or reviewer comment, follow the exact fresh-read requirement in its diagnostic.
3. **Atomic edit recovery:** If an \`edit_transaction\` aborts, no requested changes were applied. Re-read the failed file ranges named in the diagnostic, rebuild the entire transaction from one fresh snapshot, and do not peel off remembered edits into alternating success/failure retries.
4. **Validation failure mode:** After a test/typecheck/lint failure, do not make broad or unrelated changes. Read the exact failure, read the exact source/test lines it references, explain the mismatch briefly, make one targeted fix, then rerun the same validation command.

5. **Reviewer blockers are blocking:** If a reviewer returns \`BLOCKING:\` or asks for a specific action (rerun tests, fix a case, revert a change, or inspect a file), treat that exact finding as the controlling next action. Copy or paraphrase the specific blocker into your todos/progress state, do that action next, and do not run another review, continue unrelated implementation, or finalize while it is unresolved. In the next review prompt, explicitly state the blocker you fixed and how you fixed it.
6. **Repeated reviewer blocker loop:** If a reviewer reports substantially the same blocker twice, stop and acknowledge the loop. Re-read the relevant code/test lines, make one targeted fix for that exact blocker, add or update a regression test when applicable, rerun the required validation, then request review once with the validation result and the exact blocker-resolution summary.
7. **Loop detection:** If the same edit or validation fails twice, stop the current approach. Summarize the current diff, the exact repeated failure, and the next deterministic action before proceeding.
8. **Parallelism discipline:** Parallelize context gathering, tests, and review only when they do not depend on each other. During a fragile debug/fix loop, run read → one edit → validation sequentially to avoid state drift.
9. **Validation/review join discipline:** A reviewer spawned in parallel with tests/typechecks can only provide static code review; it cannot know validation results that are still running. Do not treat parallel reviewer approval as final approval until validation has completed. If validation fails or times out, fix or rerun validation before finalizing, regardless of reviewer output. For fragile harness/editor changes, prefer running validation first, then run reviewer with the validation summary.

# Spawning agents guidelines

Use the spawn_agents tool to spawn specialized agents to help you complete the user's request.

- **Spawn multiple agents in parallel:** This increases the speed of your response **and** allows you to be more comprehensive by spawning more total agents to synthesize the best response. Each spawn_agents call accepts at most **8** agents — count before you call. If you need more, split into multiple bounded waves of ≤8, joining each wave before launching the next. Keep simple tasks simple; do not spawn agents when a direct answer or tiny edit is enough.
- **Task-scope classification:** Before editing, classify the task as tiny, focused, multi-file, cross-subsystem, or unknown surface. Tiny tasks require only the directly relevant read; focused tasks require reading the target file plus nearby tests/callers; multi-file tasks require search plus representative reads; cross-subsystem or unknown-surface tasks start with the runtime-injected query_index result, then use bounded parallel discovery waves for uncovered domains until the inventory and coverage checks are complete.
- **Evidence context packet:** For non-trivial edits, organize discovery into a compact task packet: request and acceptance criteria; relevant symbols with a reason, confidence, and freshness proof; callers/callees; nearby tests and public contracts; current diagnostics; prior failed hypotheses; and explicitly excluded irrelevant context. Label inference and unknowns explicitly.
- **Hypothesis checkpoint:** Before editing, state current behavior, desired behavior, source-backed hypothesis, intended observable change, and the falsifying signal. If the same hypothesis fails twice or the same diagnostic survives two targeted edits, switch to root-cause analysis.
- **Vertical slices and diff budget:** Prefer the smallest coherent type/schema -> implementation -> direct test -> caller slice. Avoid speculative file breadth; expand only when evidence requires it. Detect generated files and edit their source-of-truth instead.
- **Phase-triggered delegation:** ${
      planOnly
        ? 'Spawn agents deterministically at analysis boundaries: context and general agents during discovery, thinker after context for complex design choices, read-only Basher for inspection/non-emitting checks, debugger for diagnosis, and advisory reviewers for risks and coverage. Mutation agents remain implementation-only.'
        : 'Spawn agents deterministically at phase boundaries, not randomly: context agents during discovery, thinker after context for complex design choices, editor for non-trivial implementation, bashers for validation, debugger after repeated validation/runtime failures, reviewers after edits, and doc/test writers when docs or tests are part of the acceptance criteria.'
    }
- **Context breadth:** For unclear or cross-cutting tasks, consume the runtime-injected query_index result first and deduplicate its relatedFiles/matchedSnippets. Spawn bounded, non-overlapping file-picker/code-searcher waves for explicit coverage gaps, joining each wave before deciding whether another is needed. Add web/docs researchers only for external APIs, then verify candidates with read_files/read_outline/read_subtree before editing. For tiny obvious edits, read only the directly relevant files.
- **Ask-user decisions:** Ask only after context gathering, and only when the answer materially changes scope, UX, risk, data loss, migration, deployment, or API/contract behavior. Require confirmation before destructive commands, public API/contract changes, dependency additions, schema/data migrations, release/publish/deploy actions, production-affecting scripts, and ambiguous product behavior. Do not ask obvious questions; if you are >80% confident or the decision is easily reversible, choose the most conservative implementation and proceed.
- **Editor delegation:** In default mode, use the editor for non-trivial source edits after discovery. Do not delegate tiny one-file edits or direct answers. The editor prompt must be implementation-only and self-contained; parent-only validation, review, git, terminal cleanup, and plan/todo work stays with you.
- **Direct-edit exception:** Treat orchestrator source editing as a narrow exception. It is eligible only for one file, at most roughly 12 changed lines, no behavior/public-contract change, no required tests, no security/concurrency risk, and no open reviewer findings. Otherwise delegate implementation to editor. Validation/reviewer repairs must use repair-editor with exact diagnostics or finding IDs.
- **Typed handoffs and receipts:** Specialist prompts must carry a self-contained role packet: task ID, objective, requirements, acceptance criteria, evidence with freshness/confidence, current/desired behavior, invariants, non-goals, risks, unknowns, findings, and allowed paths/tools. Reconcile the specialist's changed-file/requirements/findings receipt against actual mutation results; do not trust completion prose alone.
- **Thinker delegation:** Spawn thinker only after enough context exists for complex architecture, design tradeoff, risk, debugging strategy, spec/plan critique, or repeated-failure reasoning. Do not use thinker as a substitute for reading files or for straightforward edits.
- **Release/deployment flow:** Treat releases, deployments, publishing, migrations against shared environments, production-affecting scripts, git commits, and git pushes as high-impact actions. Do not run or ask subagents to run them unless the user explicitly requested that action in this task or confirms after you explain the exact command, target environment, and rollback/verification plan. When requested, follow the deterministic sequence: inspect worktree, fetch remote state/tags, decide rebase/merge with the user when non-fast-forward or conflicts appear, push, wait for CI/CD, trigger the release, verify artifact/tag/package publication, then sync and report local branch state.
- **Plan artifact maintenance:** In PLAN mode create and maintain durable artifacts; in EXECUTE_PLAN keep STATUS.md and LESSONS.md current at phase boundaries, blocker discovery/resolution, validation/review results, and finalization. Use update_plan_status for incremental STATUS/LESSONS updates and create_plan for SPEC/PLAN rewrites or missing artifacts. Do not update plan artifacts for ordinary implementation mode unless the user requested plan/session work.
- **Tool choice:** Prefer dedicated tools over shell fallbacks: repository status and configured file-change hooks are runtime-owned and injected automatically; use read_files/read_outline/read_subtree/glob/list_directory/query_index for source inspection, inspect_3d_asset/render_3d_preview for 3D assets, read_image for other screenshots/images, edit_3d_asset for guarded Blender changes, edit_transaction for text project mutations, browser_use/codebuff_local_cli for visual smoke tests, and basher only for commands without a dedicated tool.
- **Sequence agents properly:** Keep in mind dependencies when spawning different agents. Don't spawn agents in parallel that depend on each other.
- **Subagent deadlines:** Omit top-level \`timeout_seconds\` for editor and other productive subagents; omitted and \`-1\` mean no wall-clock deadline. Set a positive deadline only when the user explicitly requests one or the child is intentionally bounded diagnostic work.
- **Parallel join discipline:** When spawning agents in parallel, wait for every required result before moving to the next dependent phase. A timeout, failed validation, or \`BLOCKING:\` reviewer/security finding blocks completion until repaired or explicitly scoped out.
- **Validation selection:** Validate every non-trivial or risky edit with the narrowest relevant typecheck/test/lint/build command or configured file-change hooks. Map changed paths to suites deterministically when possible: agents/base2/* -> agents typecheck plus prompt/gate tests or e2e subset when behavior changes; agents/* -> agents typecheck and relevant agent tests; packages/sdk/* -> SDK typecheck/tests; packages/agent-runtime/* -> runtime typecheck/tests; common/* -> common checks plus dependent package typechecks; cli/src/components/* or cli/src/hooks/* -> CLI typecheck plus CLI visual smoke; docs/prompt-only changes -> configured hooks or explicit skip reason. Skip validation only for docs/prompt-only changes, tiny low-risk edits, explicit no-validation modes, or when the user forbids it; state the skip reason. Validation failures/timeouts are blocking and must be repaired or explicitly scoped out.
- **Reviewer selection:** Use the automated reviewer gate for edited code in default mode. Spawn code-reviewer manually only for user-requested extra review, advisory/pre-edit review, significant diffs outside the automated gate, or changed code whose risk warrants another perspective; spawn security-reviewer for auth, crypto, secrets, permissions, injection, sandboxing, path/process/network handling, supply-chain, or production-risk changes; spawn test-writer when behavior changes lack coverage; spawn debugger after repeated validation failure, runtime failure, or unclear crash behavior. Do not duplicate the same post-edit review manually.
- **Validation/reviewer coordination:** It is fine to run validation bashers and reviewers in parallel only when the reviewer is asked for static code review that explicitly does not depend on validation output. Always wait for both. Treat the final decision as a join of both results: validation failure/timeout blocks completion even if review looks good, and reviewer \`BLOCKING:\` blocks completion even if validation passes. When the review needs validation results, run validation first and include the completed validation summary in the reviewer prompt.
  ${buildArray(
    "- For broad codebase questions or tasks where relevant files are not already obvious, call query_index early yourself to get indexed file candidates, then verify the best candidates with read_files/read_subtree and/or spawn file-picker/code-searcher agents as needed. Use mode: 'commands' for project scripts, CI, task runners, or validation-suite command discovery. Do not rely on query_index alone for correctness.",
    '- Spawn context-gathering agents (file pickers, code searchers, and web/docs researchers) before making edits when the relevant files, APIs, or commands are not already obvious. Use query_index, list_directory, and glob directly for searching and exploring the codebase.',
    isDefault &&
      '- Spawn the editor agent after discovery for non-trivial source changes. Keep the handoff self-contained and implementation-only because the editor does not inherit parent conversation history.',
    isDefault &&
      '- Spawn the thinker after gathering context for complex design, architecture, risk, or debugging strategy decisions. Use the semantic agent name rather than model-specific variants.',
    '- Spawn bashers for validation/test coverage after edits when validation is appropriate; if validation fails, repair the exact failure before broadening scope.',
    '- Spawn the debugger after repeated validation failures, runtime failures, or unclear crash behavior where focused diagnosis is needed.',
    '- Spawn code-reviewer/security-reviewer after meaningful edits when user scope or risk calls for review. Spawn doc-writer/test-writer when documentation or test coverage is required or directly implied by acceptance criteria.',
    '- Spawn bashers sequentially if the second command depends on the the first.',
    '- For a long-running or never-exiting process (dev server, build watcher, log tail), spawn a basher with params.process_type set to BACKGROUND: it returns a jobId immediately instead of blocking. Then call the check_job tool to poll new output and status, or to follow it (pass wait_for to block until a readiness/error pattern appears, with a timeout_seconds bound). Use kill_job when a background job is no longer needed. To watch an existing log file, start a BACKGROUND `tail -f <file>` and check_job it.',
    '- For local screenshots or other image files, call read_image with the image paths. Do not call read_files on image formats. Treat image artifacts emitted by 3D/render/export jobs (Blender frames, exported PNG/frames, generated diagrams, charts) as read_image inputs as well: finishing a background job is not visual verification until you have inspected its emitted image output with read_image.',
  ).join('\n  ')}
- **No need to include context:** When prompting an agent, realize that many agents can already see the entire conversation history, so you can be brief in prompting them without needing to include context.
- **Never spawn the context-pruner agent:** This agent is spawned automatically for you and you don't need to spawn it yourself.
${isDefault ? gateAwarenessSection : ''}
# Openbuff Meta-information

You are running on the ${model} model.

Users send prompts to you in one of a few user-selected modes, like DEFAULT or PLAN.

Every prompt sent consumes provider API credits based on the models used.

The user can use the "/usage" command to see token usage for the current session.

For other questions, you can direct them to openbuff.dev, or especially openbuff.dev/docs for detailed information about the product.

# Other response guidelines

${buildArray(
  !isFast &&
    '- Your goal is to produce the highest quality results, even if it comes at the cost of more provider API tokens used.',
  !isFast && '- Speed is important, but a secondary goal.',
  isFast &&
    '- Prioritize speed: quickly getting the user request done is your first priority. Do not call any unnecessary tools. Spawn more agents in parallel to speed up the process. Be extremely concise in your responses. Use 2 words where you would have used 2 sentences.',
  '- If a tool fails, follow its recovery guidance and the harness-enforced recovery workflow above; do not blindly retry the same remembered payload.',
  '- **Fetching logs:** Prefer tail -n or ranged reads (e.g. read_files with ranges) over dumping whole log files into context. For a live or long-running process, capture its output incrementally (e.g. tail a log file across steps) rather than blocking indefinitely on a single command.',
  isDefault &&
    '- **Use <think></think> tags for moderate reasoning:** When you need to work through something moderately complex (e.g., understanding code flow, planning a small refactor, reasoning about edge cases, planning which agents to spawn), wrap your thinking in <think></think> tags. Spawn the thinker agent for anything more complex.',
  '- Context is managed for you. The context-pruner agent will automatically run as needed. Gather as much context as you need without worrying about it.',
  '- **Keep final summary extremely concise:** Write only a few words for each change you made in the final summary.',
).join('\n')}

# Response examples

<example>

<user>please implement [a complex new feature]</user>

<response>
[ You spawn 3 file-pickers, 2 code-searchers, and a docs researcher in parallel to find relevant files and do research online. You use the list_directory and glob tools directly to search the codebase. ]

[ You read a few of the relevant files using the read_files tool in two separate tool calls ]

[ You spawn another file-picker and code-searcher to find more relevant files, and use glob tools ]

[ You read a few other relevant files using the read_files tool ]${
      !noAskUser
        ? `\n\n[ You ask the user for important clarifications on their request or alternate implementation strategies using the ask_user tool ]`
        : ''
    }
${
  isDefault
    ? `[ You implement the changes using the editor agent ]`
    : '[ You implement the changes using edit_transaction ]'
}

${
  isDefault
    ? `[ The runtime detects changed files, runs configured validation hooks, and invokes the code-reviewer gate before finalization ]`
    : '[ You spawn a basher to typecheck the changes and another basher to run tests, all in parallel ]'
}

${
  isDefault
    ? `[ You fix the issues found by the code-reviewer and type/test errors ]`
    : '[ You fix the issues found by the type/test errors and spawn more bashers to confirm ]'
}

[ All tests & typechecks pass -- you write a very short final summary of the changes you made ]
 </response>

</example>

<example>

<user>what's the best way to refactor [x]</user>

<response>
[ You collect codebase context, and then give a strong answer with key examples, and ask if you should make this change ]
</response>

</example>

${PLACEHOLDER.FILE_TREE_PROMPT_SMALL}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}
${PLACEHOLDER.ROUTED_KNOWLEDGE_FILES}
${PLACEHOLDER.PATTERNS_INDEX}
${PLACEHOLDER.LANGUAGE_PROFILE}
${PLACEHOLDER.SYSTEM_INFO_PROMPT}

# Repository state

The runtime injects a fresh, compact Git-status observation before coding work and after model steps. Use that path list to preserve unrelated dirty work, then read only task-relevant files instead of loading the full initial diff into every request.

${qualitySection}

${PLACEHOLDER.FRONTEND_SECTION}

${gitDisciplineSection}

${securityReviewSection}

${specialistRoutingSection}
`,

    instructionsPrompt: planOnly
      ? buildPlanOnlyInstructionsPrompt({})
      : executePlan
        ? buildExecutePlanInstructionsPrompt({
            isFast,
            isDefault,

            hasNoValidation,
            noAskUser,
          })
        : buildImplementationInstructionsPrompt({
            isFast,
            isDefault,

            hasNoValidation,
            noAskUser,
          }),
    stepPrompt: planOnly
      ? buildPlanOnlyStepPrompt({})
      : executePlan
        ? buildExecutePlanStepPrompt({})
        : buildImplementationStepPrompt({
            isDefault,
            isFast,
          }),

    handleSteps: function* ({ agentState, prompt, params, config }) {
      function isConversationOnlyPrompt(value: unknown): boolean {
        if (typeof value !== 'string') return false
        const normalized = value
          .trim()
          .replace(/[.!?,]+$/g, '')
          .trim()
        return /^(?:hi|hello|hey|hiya|good morning|good afternoon|good evening|thanks|thank you|thanks a lot|thank you very much)$/i.test(
          normalized,
        )
      }

      type Base2AgentState = NonNullable<typeof agentState> & {
        base2ActiveWork?: Base2ActiveWorkState
        canSuggestFollowups?: boolean
        workspaceState?: {
          revision: number
          snapshotId: string
        }
        discoveryCoverage?: any
        workflowStates?: Record<string, any>
      }

      const mutableAgentState = (agentState ?? {}) as Base2AgentState
      const agentId = mutableAgentState.agentId
      const configuredHasNoValidation = config?.hasNoValidation
      const runValidationGate =
        typeof configuredHasNoValidation === 'boolean'
          ? !configuredHasNoValidation
          : agentId !== 'base2-fast' && agentId !== 'base2-fast-no-validation'
      // M3 (R1a–R1d) automated phase-gate predicates. These mirror the
      // advisory glob list in securityReviewSection (quality-prompt-section.ts)
      // so the automated gate and the advisory prompt agree on what is
      // security-sensitive. Self-contained string/regex matching (no
      // module-scope imports) because handleSteps is serialized via
      // .toString() and reconstructed with new Function(...): module-scope
      // bindings such as an imported `micromatch` would be undefined at
      // reconstruction time.
      const SECURITY_SENSITIVE_GLOBS = [
        'auth',
        'oauth',
        'credentials',
        'session',
        'crypto',
        'keys',
        'secrets',
        'vault',
        'billing',
        'payment',
        'stripe',
        'permissions',
        'rbac',
        'policy',
      ]
      const SECURITY_SENSITIVE_NAME_SUBSTRINGS = ['secret', 'token', 'apikey']
      const runReviewerGate = runValidationGate
      const reviewerAgentType = 'code-reviewer'
      const MAX_REPAIR_ROUNDS = 3
      const MAX_REVIEWER_NO_VERDICT_RETRIES = 1
      // static-review-only concurrency (M3.1): when the reviewer is configured
      // for static-only review, it can run concurrently with the blocking
      // validation hooks. Defaults to false so the existing sequential
      // validation-then-reviewer behavior is preserved.
      const staticReviewOnlyEnabled = !!(
        mutableAgentState.base2ActiveWork?.staticReviewOnly ?? false
      )
      const existingActiveWorkState = mutableAgentState.base2ActiveWork
      const hadPendingGateFiles =
        !!existingActiveWorkState &&
        Object.prototype.hasOwnProperty.call(
          existingActiveWorkState,
          'pendingGateFiles',
        )
      const hadCurrentPhase =
        !!existingActiveWorkState &&
        Object.prototype.hasOwnProperty.call(
          existingActiveWorkState,
          'currentPhase',
        )
      const activeWorkState = existingActiveWorkState ?? {
        touchedFiles: [],
        changedFiles: [],
        pendingGateFiles: [],
        currentPhase: 'idle',
        latestWorkSummary: '',
        openReviewerBlockers: [],
        openReviewerFindings: [],
        lastValidationSummary: '',
        nextRequiredAction: '',
        lastPinnedStateMessage: '',
        gatePassedFiles: [],
        gatePassedPendingFiles: [],
        gatePassedReviewerVerdict: '',
        gatePassedValidationSummary: '',
        gatePassedFingerprint: '',
        lastReviewerGateSkipReason: '',
        preEditSecurityReviewDone: false,
        securityReviewGateDone: false,
        reviewerCrashCount: 0,
        reviewerProtocolRetryCount: 0,
        reviewerRepairRoundCount: 0,
        reviewerNoVerdictCount: 0,
        reviewerBypassChallenge: undefined,
        reviewerGateBypassReason: '',
        reviewerGateBypassRecord: undefined,
        validationAssurance: 'none',
        testWriterGateDone: false,
        docWriterGateDone: false,
        specialistReviewGatesDone: [],
        reviewReceipts: [],
        auxGatesLastPendingFiles: [],
      }
      activeWorkState.touchedFiles ??= []
      activeWorkState.changedFiles ??= []
      activeWorkState.pendingGateFiles ??= []
      activeWorkState.gatePassedFiles ??= []
      activeWorkState.gatePassedPendingFiles ??= []
      activeWorkState.gatePassedReviewerVerdict ??= ''
      activeWorkState.gatePassedValidationSummary ??= ''
      activeWorkState.gatePassedFingerprint ??= ''
      activeWorkState.lastReviewerGateSkipReason ??= ''
      activeWorkState.openReviewerBlockers ??= []
      activeWorkState.openReviewerFindings ??= []
      activeWorkState.validationEvidence ??= []
      activeWorkState.latestWorkSummary ??= ''
      activeWorkState.lastValidationSummary ??= ''
      activeWorkState.nextRequiredAction ??= ''
      activeWorkState.lastPinnedStateMessage ??= ''
      activeWorkState.preEditSecurityReviewDone ??= false
      activeWorkState.securityReviewGateDone ??=
        activeWorkState.preEditSecurityReviewDone
      activeWorkState.reviewerCrashCount ??= 0
      activeWorkState.reviewerProtocolRetryCount ??= 0
      activeWorkState.reviewerRepairRoundCount ??= 0
      activeWorkState.reviewerNoVerdictCount ??= 0
      activeWorkState.reviewerGateBypassReason ??= ''
      activeWorkState.validationAssurance ??= 'none'
      activeWorkState.testWriterGateDone ??= false
      activeWorkState.docWriterGateDone ??= false
      activeWorkState.specialistReviewGatesDone ??= []
      activeWorkState.reviewReceipts ??= []
      activeWorkState.auxGatesLastPendingFiles ??= []
      activeWorkState.workflowTodoProgress = normalizeWorkflowTodoProgress(
        activeWorkState.workflowTodoProgress,
      )
      activeWorkState.touchedFiles = normalizeGateFileList(
        activeWorkState.touchedFiles,
      )
      activeWorkState.changedFiles = normalizeGateFileList(
        activeWorkState.changedFiles,
      )
      activeWorkState.pendingGateFiles = normalizeGateFileList(
        activeWorkState.pendingGateFiles,
      )
      activeWorkState.gatePassedFiles = normalizeGateFileList(
        activeWorkState.gatePassedFiles,
      )
      activeWorkState.gatePassedPendingFiles = normalizeGateFileList(
        activeWorkState.gatePassedPendingFiles,
      )
      updateWorkflowTodoProgressFromMessages(mutableAgentState.messageHistory)
      if (!hadCurrentPhase) {
        activeWorkState.currentPhase = inferActiveWorkPhase(activeWorkState)
      }
      if (
        !hadPendingGateFiles &&
        !hadCurrentPhase &&
        activeWorkState.pendingGateFiles.length === 0 &&
        activeWorkState.changedFiles.length > 0 &&
        (activeWorkState.openReviewerBlockers.length > 0 ||
          activeWorkState.nextRequiredAction.trim().length > 0)
      ) {
        activeWorkState.pendingGateFiles = [...activeWorkState.changedFiles]
        activeWorkState.currentPhase = 'blocked'
        activeWorkState.lastPinnedStateMessage = ''
      }
      mutableAgentState.base2ActiveWork = activeWorkState
      let processedMessageHistoryLength = Array.isArray(
        mutableAgentState.messageHistory,
      )
        ? mutableAgentState.messageHistory.length
        : 0
      let currentConversationMessages: unknown =
        mutableAgentState.messageHistory

      const hasActiveWork =
        activeWorkState.pendingGateFiles.length > 0 ||
        activeWorkState.openReviewerBlockers.length > 0 ||
        activeWorkState.nextRequiredAction.trim().length > 0
      if (isConversationOnlyPrompt(prompt) && !hasActiveWork) {
        yield {
          toolName: 'spawn_agent_inline',
          input: {
            agent_type: 'context-pruner',
            params: params ?? {},
          },
          includeToolCall: false,
        } as any
        mutableAgentState.canSuggestFollowups = false
        yield 'STEP'
        return
      }

      const retrievalDecision = classifyProactiveRetrieval(prompt)
      if (retrievalDecision) {
        if (retrievalDecision.scope === 'cross-subsystem') {
          yield {
            toolName: 'inspect_codebase_structure',
            input: {},
          } as any
          yield {
            toolName: 'list_directory',
            input: { path: '.' },
          } as any
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content:
                '<system>Production breadth guard: this request was deterministically classified as cross-subsystem. The preceding native structural inventory and its snapshot ID control this audit. Use vertical feature slices plus structural/domain shards, call inspect_feature_completeness for every claimed feature, and call evaluate_audit_coverage before claiming completeness. Explicitly cover or exclude every subsystem. A single search/read path or Markdown structural map is insufficient.</system>',
            },
            includeToolCall: false,
          } as any
        }
        const proactiveRetrievalResult = yield {
          toolName: 'query_index',
          input: {
            query: prompt,
            limit: retrievalDecision.limit,
            mode: retrievalDecision.mode,
          },
        }
        const discoveryCoordinator = (params as any)?.orchestrationControlPlane
          ?.planDiscoveryBatch
        if (typeof discoveryCoordinator === 'function') {
          try {
            mutableAgentState.discoveryCoverage = discoveryCoordinator({
              existing: mutableAgentState.discoveryCoverage,
              query: prompt ?? '',
              result:
                (proactiveRetrievalResult as any)?.toolResult ??
                proactiveRetrievalResult,
              workspaceRevision: mutableAgentState.workspaceState?.revision,
            })
          } catch {
            // Retrieval output remains usable even if optional coverage
            // bookkeeping cannot parse a third-party index result.
          }
        }
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content: `<system>Proactive retrieval route: scope=${retrievalDecision.scope}; mode=${retrievalDecision.mode}; reason=${retrievalDecision.reason}. Verify retrieved candidates against the live filesystem before editing.</system>`,
          },
          includeToolCall: false,
        } as any
      }

      const initialGitStatus = yield {
        toolName: 'git_status',
        input: {},
      } as any
      const initialGitStatusFiles = extractGitStatusFiles(
        (initialGitStatus as any)?.toolResult,
      ).filter((file) => !activeWorkState.gatePassedFiles.includes(file))
      const initialGitStatusLineMap = extractGitStatusLineMap(
        (initialGitStatus as any)?.toolResult,
      )
      const changedFiles = new Set<string>(activeWorkState.changedFiles)
      const pendingGateFiles = new Set<string>(activeWorkState.pendingGateFiles)
      let editsHappened =
        pendingGateFiles.size > 0 ||
        ((activeWorkState.currentPhase === 'awaiting_validation' ||
          activeWorkState.currentPhase === 'awaiting_review') &&
          activeWorkState.changedFiles.length > 0)
      let gatePassedForCurrentEdits = false
      let finalResponseGateOpen =
        activeWorkState.currentPhase === 'final_response_allowed' &&
        pendingGateFiles.size === 0 &&
        activeWorkState.openReviewerBlockers.length === 0 &&
        activeWorkState.nextRequiredAction.trim().length === 0
      const gatePassedFiles = new Set<string>(activeWorkState.gatePassedFiles)
      if (
        activeWorkState.gatePassedPendingFiles.length > 0 &&
        activeWorkState.gatePassedFingerprint &&
        !hasFreshGateFingerprintForPendingFiles(
          activeWorkState.gatePassedPendingFiles,
          initialGitStatusLineMap,
          activeWorkState.gatePassedValidationSummary ||
            activeWorkState.lastValidationSummary ||
            'No configured file-change hooks ran.',
        )
      ) {
        for (const file of activeWorkState.gatePassedPendingFiles) {
          changedFiles.add(file)
          pendingGateFiles.add(file)
          gatePassedFiles.delete(file)
        }
        activeWorkState.pendingGateFiles = Array.from(pendingGateFiles)
        activeWorkState.gatePassedFiles = Array.from(gatePassedFiles)
        activeWorkState.gatePassedPendingFiles = []
        activeWorkState.gatePassedReviewerVerdict = ''
        activeWorkState.gatePassedValidationSummary = ''
        activeWorkState.gatePassedFingerprint = ''
        activeWorkState.currentPhase = 'awaiting_validation'
        activeWorkState.latestWorkSummary =
          'Previously reviewed files changed after the gate passed; validation and review were reopened.'
        editsHappened = true
        finalResponseGateOpen = false
        markActiveWorkStateChanged()
      }
      while (true) {
        yield {
          toolName: 'spawn_agent_inline',
          input: {
            agent_type: 'context-pruner',
            params: params ?? {},
          },
          includeToolCall: false,
        } as any

        mutableAgentState.canSuggestFollowups =
          !runValidationGate || finalResponseGateOpen

        const pinnedStateMessage = buildPinnedActiveWorkMessage(activeWorkState)
        if (
          pinnedStateMessage &&
          pinnedStateMessage !== activeWorkState.lastPinnedStateMessage
        ) {
          activeWorkState.lastPinnedStateMessage = pinnedStateMessage
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content: pinnedStateMessage,
            },
            includeToolCall: false,
          } as any
        }

        const stepResult = yield 'STEP'
        const { stepsComplete, hitStepCap } = stepResult as {
          stepsComplete: boolean
          hitStepCap?: boolean
        }
        // If the LLM step hit an explicit fixed cap (stepsRemaining === 0), the turn
        // is over. Break out immediately instead of falling through to the
        // validation/reviewer gate: the gate would re-yield STEP, which would
        // re-trigger the step-cap (stepsRemaining is still 0), looping forever.
        if (hitStepCap) {
          activeWorkState.currentPhase = 'blocked'
          activeWorkState.nextRequiredAction =
            'Step cap reached before required validation/review completed. Resume this work first and complete the pending gate files before finalizing.'
          activeWorkState.latestWorkSummary =
            'Step-cap guard interrupted the turn with validation/review still pending.'
          mutableAgentState.canSuggestFollowups = false
          finalResponseGateOpen = false
          markActiveWorkStateChanged()
          break
        }
        if (Array.isArray((stepResult as any)?.agentState?.messageHistory)) {
          currentConversationMessages = (stepResult as any).agentState
            .messageHistory
        }
        let editsThisStep = false
        const files = extractChangedFiles(
          (stepResult as any) && (stepResult as any).toolResult,
        )
        if (files.length > 0) {
          editsHappened = true
          editsThisStep = true
          recordChangedFiles(files)
          activeWorkState.latestWorkSummary = `Latest detected edit/work touched: ${files.join(', ')}`
          markActiveWorkStateChanged()
        }
        const messageHistory = (stepResult as any)?.agentState?.messageHistory
        const messageFiles = extractChangedFilesFromMessages(
          messageHistory,
          processedMessageHistoryLength,
        )
        if (Array.isArray(messageHistory)) {
          currentConversationMessages = messageHistory
          updateWorkflowTodoProgressFromMessages(messageHistory)
          processedMessageHistoryLength = messageHistory.length
        }
        if (messageFiles.length > 0) {
          editsHappened = true
          editsThisStep = true
          recordChangedFiles(messageFiles)
          activeWorkState.latestWorkSummary = `Latest direct edit/work from message history touched: ${messageFiles.join(', ')}`
          markActiveWorkStateChanged()
        }
        if (editsThisStep) {
          gatePassedForCurrentEdits = false
          finalResponseGateOpen = false
          // Keep canSuggestFollowups in sync with finalResponseGateOpen so that
          // edits made in an earlier tool-call batch of this step immediately
          // retract suggest_followups permission (which was computed at the top
          // of the loop from the prior gate state). Without this, an LLM could
          // make edits and then call suggest_followups in the same step before
          // the gate has a chance to re-run.
          mutableAgentState.canSuggestFollowups = false
          activeWorkState.currentPhase = 'awaiting_validation'
          markActiveWorkStateChanged()
        }

        if (!stepsComplete) continue

        const currentGitStatus = yield {
          toolName: 'git_status',
          input: {},
        } as any
        const gitStatusFiles = extractGitStatusFiles(
          (currentGitStatus as any)?.toolResult,
        )
        const currentGitStatusLineMap = extractGitStatusLineMap(
          (currentGitStatus as any)?.toolResult,
        )
        for (const file of gitStatusFiles) {
          if (
            !initialGitStatusFiles.includes(file) &&
            !gatePassedFiles.has(file)
          ) {
            editsHappened = true
            recordChangedFiles([file], { fromStatusObservation: true })
            activeWorkState.latestWorkSummary = `Git status shows pending changed files: ${Array.from(pendingGateFiles).join(', ')}`
            markActiveWorkStateChanged()
            if (!gatePassedForCurrentEdits) editsThisStep = true
          }
        }
        if (editsThisStep) {
          gatePassedForCurrentEdits = false
          finalResponseGateOpen = false
          // Same mid-step resync as above: git-status-detected edits must also
          // retract suggest_followups permission for the remainder of this step.
          mutableAgentState.canSuggestFollowups = false
          activeWorkState.currentPhase = 'awaiting_validation'
          markActiveWorkStateChanged()
        }

        if (finalResponseGateOpen && !editsThisStep) break

        const currentPendingGateFiles = Array.from(pendingGateFiles)
        // M3 (R1d) — reset the aux-gate done-flags when the AUX-RELEVANT
        // pending gate file set changes, so security-reviewer / test-writer
        // / doc-writer each get exactly one spawn per distinct edited file
        // set. We compare the aux-relevant subset (files at least one aux
        // predicate would act on) rather than the raw set so that aux
        // OUTPUTS (test files, doc files, etc.) added in the next top-of-loop
        // extractChangedFilesFromMessages sweep do NOT perturb the snapshot
        // and do NOT trigger a *GateDone reset — preventing an infinite
        // re-spawn loop (e.g. test-writer writes foo.test.ts -> next iter
        // adds it to pendingGateFiles -> raw detectPendingGateFileSetChange
        // returns TRUE -> resetAuxGateFlags clears testWriterGateDone ->
        // test-writer re-spawns for the original source file, forever). The
        // reset snapshot stored in auxGatesLastPendingFiles is therefore the
        // aux-relevant subset.
        const auxRelevantPendingFiles = selectAuxRelevantFiles(
          currentPendingGateFiles,
        )
        if (
          detectPendingGateFileSetChange(
            activeWorkState,
            auxRelevantPendingFiles,
          )
        ) {
          resetAuxGateFlags(activeWorkState, auxRelevantPendingFiles)
          markActiveWorkStateChanged()
        }
        // Unified pre-reviewer aux gates (M3). These fire BEFORE the
        // validation/reviewer gate (which is now the FINAL gate), in order:
        // test-writer -> doc-writer -> security-reviewer. Each is predicate-
        // gated and skips silently (sets its *GateDone=true and marks work
        // state changed) when no pending file matches its relevance
        // predicate, exactly like the existing else-blocks. Each spawn uses
        // spawn_agent_inline; the runtime blocks the generator until the
        // child completes (the yield is the blocking point, and
        // finalResponseGateOpen stays false while aux work runs), so the
        // orchestrator waits for each aux spawn to finish before proceeding
        // to the next gate. After all three run (or skip), continue so the
        // loop re-enters and reaches the existing validation+reviewer loop
        // unchanged. Idempotent per pending gate file set via the done-flags
        // above.
        let auxGateFiredThisIteration = false
        const requestRequiresTests =
          !/\b(?:do not|don't|without|no)\b[^\n]{0,32}\b(?:tests?|test coverage)\b/i.test(
            prompt ?? '',
          ) &&
          /\b(?:add|write|update|fix|increase|improve)\b[^\n]{0,40}\btests?\b|\btest coverage\b/i.test(
            prompt ?? '',
          )
        const requestRequiresDocs =
          !/\b(?:do not|don't|without|no)\b[^\n]{0,32}\b(?:docs?|documentation|readme|guide)\b/i.test(
            prompt ?? '',
          ) &&
          /\b(?:docs?|documentation|document|readme|guide)\b/i.test(
            prompt ?? '',
          )
        let writerEnvironmentSummary = ''
        let projectTestWriterSelection:
          | {
              groups: Array<{
                targetFiles: string[]
                testCommand: string
                candidateTests: string[]
                manifest?: string
                packageRoot: string
              }>
            }
          | undefined
        if (
          (requestRequiresTests && !activeWorkState.testWriterGateDone) ||
          (requestRequiresDocs && !activeWorkState.docWriterGateDone)
        ) {
          const environmentInspection = yield {
            toolName: 'inspect_environment',
            input: {},
            includeToolCall: false,
          } as any
          writerEnvironmentSummary = summarizeWriterEnvironment(
            (environmentInspection as any)?.toolResult ?? environmentInspection,
          )
          if (requestRequiresTests && !activeWorkState.testWriterGateDone) {
            const affectedTests = yield {
              toolName: 'get_affected_tests',
              input: { files: currentPendingGateFiles },
              includeToolCall: false,
            } as any
            const buildTargets = yield {
              toolName: 'get_build_targets',
              input: { files: currentPendingGateFiles },
              includeToolCall: false,
            } as any
            projectTestWriterSelection = selectProjectAwareTestWriterTargets(
              currentPendingGateFiles,
              (affectedTests as any)?.toolResult ?? affectedTests,
              (buildTargets as any)?.toolResult ?? buildTargets,
            )
          }
        }
        // 1) test-writer gate
        if (
          runValidationGate &&
          editsHappened &&
          currentPendingGateFiles.length > 0 &&
          !activeWorkState.testWriterGateDone
        ) {
          const testWriterSelection =
            projectTestWriterSelection ??
            selectTestWriterTargets(currentPendingGateFiles)
          if (requestRequiresTests && testWriterSelection.groups.length > 0) {
            auxGateFiredThisIteration = true
            let testWriterCrash = ''
            for (const group of testWriterSelection.groups) {
              const testWriterResult = yield {
                toolName: 'spawn_agent_inline',
                input: {
                  agent_type: 'test-writer',
                  prompt: [
                    'Write the requested regression/behavior coverage for the verified source contract.',
                    `User request: ${prompt ?? ''}`,
                    `Source files: ${group.targetFiles.join(', ')}`,
                    `Workspace snapshot: ${mutableAgentState.workspaceState?.snapshotId ?? 'unknown'}`,
                    `Project environment: ${writerEnvironmentSummary || 'not reported'}`,
                    `Existing affected test candidates: ${group.candidateTests.join(', ') || '(none found)'}`,
                    `Parent validation command: ${group.testCommand}`,
                    'Return the declared structured writer receipt. Empty or partial output blocks finalization.',
                  ].join('\n'),
                  params: {
                    target_files: group.targetFiles,
                    test_command: group.testCommand,
                  },
                  handoff: {
                    schemaVersion: 1,
                    taskId: `test-writer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    role: 'test-writer',
                    objective:
                      'Add focused tests for the requested behavior without modifying production source.',
                    requirements: [
                      {
                        id: 'tests-required',
                        text: prompt ?? 'Add the requested test coverage.',
                        required: true,
                      },
                    ],
                    acceptanceCriteria: [
                      {
                        id: 'tests-written',
                        behavior:
                          'Focused tests are added in the existing project test structure.',
                        verification: group.testCommand,
                      },
                    ],
                    context: group.targetFiles.map((path: string) => ({
                      path,
                      symbols: [],
                      reason: 'Changed source contract requiring coverage.',
                      confidence: 'confirmed' as const,
                    })),
                    invariants: ['Do not modify production source files.'],
                    nonGoals: [
                      'Unrelated test refactors or framework changes.',
                    ],
                    risks: ['Tests must match the live source snapshot.'],
                    unknowns: [],
                    findings: [],
                    permissions: {
                      readablePaths: [
                        ...group.targetFiles,
                        ...group.candidateTests,
                        ...(group.manifest ? [group.manifest] : []),
                        ...testWriterScopePatterns(group.packageRoot),
                      ],
                      writablePaths: [
                        ...testWriterScopePatterns(group.packageRoot),
                      ],
                      allowedTools: [
                        'read_files',
                        'read_outline',
                        'write_file',
                        'str_replace',
                        'set_output',
                      ],
                    },
                    workspaceRevision:
                      mutableAgentState.workspaceState?.revision,
                    workspaceSnapshotId:
                      mutableAgentState.workspaceState?.snapshotId,
                    artifacts: [],
                    successCriteria: [
                      'Writer receipt reports changed test files.',
                    ],
                    constraints: ['Use the existing test framework.'],
                  },
                },
                includeToolCall: false,
              } as any
              testWriterCrash =
                detectReviewerCrash(
                  (testWriterResult as any)?.toolResult ?? testWriterResult,
                ) ?? ''
              const testWriterReceipt = extractAgentReceipt(
                (testWriterResult as any)?.toolResult ?? testWriterResult,
              )
              const testWriterOutcome = extractWriterOutcome(
                (testWriterResult as any)?.toolResult ?? testWriterResult,
              )
              if (
                !testWriterCrash &&
                (!testWriterReceipt ||
                  testWriterReceipt.status !== 'completed' ||
                  (!(
                    testWriterOutcome?.completionKind === 'changed' &&
                    testWriterReceipt.changedFiles.length > 0
                  ) &&
                    !(
                      testWriterOutcome?.completionKind === 'noop' &&
                      testWriterReceipt.changedFiles.length === 0 &&
                      testWriterOutcome.evidence.length > 0
                    )))
              ) {
                testWriterCrash =
                  'Test-writer did not return a completed changed-files receipt or an evidence-backed no-op receipt.'
              }
              if (!testWriterCrash && group.testCommand) {
                const testValidation = yield {
                  toolName: 'spawn_agents',
                  input: {
                    agents: [
                      {
                        agent_type: 'basher',
                        params: {
                          command: group.testCommand,
                          what_to_summarize:
                            'Report whether the writer-requested validation command passed, including exact failure lines.',
                          timeout_seconds: 300,
                        },
                      },
                    ],
                  },
                  includeToolCall: false,
                } as any
                testWriterCrash =
                  detectCommandFailure(
                    (testValidation as any)?.toolResult ?? testValidation,
                  ) ?? ''
              }
              if (testWriterCrash) break
            }
            if (testWriterCrash) {
              activeWorkState.testWriterGateDone = true
              activeWorkState.validationAssurance = 'reduced'
              activeWorkState.latestWorkSummary = `Test-writer failed: ${testWriterCrash}; continuing with reduced assurance.`
              markActiveWorkStateChanged()
            } else {
              activeWorkState.testWriterGateDone = true
              markActiveWorkStateChanged()
              emitGateTelemetry({
                currentPhase: 'awaiting_validation',
                pendingFileCount: currentPendingGateFiles.length,
                pendingFiles: currentPendingGateFiles,
                validationStatus: 'passed',
                reviewerStatus: 'passed',
                reuseReason: 'aux-gate:test-writer',
              })
            }
          } else {
            activeWorkState.testWriterGateDone = true
            markActiveWorkStateChanged()
          }
        }
        // 2) doc-writer gate
        if (
          runValidationGate &&
          editsHappened &&
          currentPendingGateFiles.length > 0 &&
          !activeWorkState.docWriterGateDone
        ) {
          const docTargets = selectDocWriterTargets(currentPendingGateFiles)
          if (requestRequiresDocs && docTargets.length > 0) {
            auxGateFiredThisIteration = true
            const docWriterResult = yield {
              toolName: 'spawn_agent_inline',
              input: {
                agent_type: 'doc-writer',
                prompt: [
                  'Document the verified public contract affected by the current change.',
                  `User request: ${prompt ?? ''}`,
                  `Source files: ${docTargets.join(', ')}`,
                  `Workspace snapshot: ${mutableAgentState.workspaceState?.snapshotId ?? 'unknown'}`,
                  `Project environment: ${writerEnvironmentSummary || 'not reported'}`,
                  'Return the declared structured writer receipt. Empty or partial output blocks finalization.',
                ].join('\n'),
                params: {
                  source_files: docTargets,
                },
                handoff: {
                  schemaVersion: 1,
                  taskId: `doc-writer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  role: 'doc-writer',
                  objective:
                    'Update documentation for the requested public behavior without modifying production source.',
                  requirements: [
                    {
                      id: 'docs-required',
                      text: prompt ?? 'Update the requested documentation.',
                      required: true,
                    },
                  ],
                  acceptanceCriteria: [
                    {
                      id: 'docs-written',
                      behavior:
                        'Documentation accurately reflects the live public contract.',
                      verification:
                        'Final code review checks documentation accuracy against the source snapshot.',
                    },
                  ],
                  context: docTargets.map((path: string) => ({
                    path,
                    symbols: [],
                    reason: 'Changed public contract requiring documentation.',
                    confidence: 'confirmed' as const,
                  })),
                  invariants: ['Do not modify production source files.'],
                  nonGoals: [
                    'Marketing copy or unrelated documentation cleanup.',
                  ],
                  risks: [
                    'Documentation must not invent unsupported behavior.',
                  ],
                  unknowns: [],
                  findings: [],
                  permissions: {
                    readablePaths: [
                      ...docTargets,
                      ...docTargets.map((f: string) =>
                        f.includes('/')
                          ? f.split('/').slice(0, -1).join('/')
                          : '.',
                      ),
                      ...docWriterScopePatterns(docTargets),
                    ],
                    writablePaths: docWriterScopePatterns(docTargets),
                    allowedTools: [
                      'read_files',
                      'read_outline',
                      'read_subtree',
                      'str_replace',
                      'write_file',
                      'set_output',
                    ],
                  },
                  workspaceRevision: mutableAgentState.workspaceState?.revision,
                  workspaceSnapshotId:
                    mutableAgentState.workspaceState?.snapshotId,
                  artifacts: [],
                  successCriteria: [
                    'Writer receipt reports changed documentation files.',
                  ],
                  constraints: ['Match adjacent documentation style.'],
                },
              },
              includeToolCall: false,
            } as any
            const docWriterCrash = detectReviewerCrash(
              (docWriterResult as any)?.toolResult ?? docWriterResult,
            )
            const docWriterReceipt = extractAgentReceipt(
              (docWriterResult as any)?.toolResult ?? docWriterResult,
            )
            const docWriterOutcome = extractWriterOutcome(
              (docWriterResult as any)?.toolResult ?? docWriterResult,
            )
            const docWriterFailure =
              docWriterCrash ??
              (!docWriterReceipt ||
              docWriterReceipt.status !== 'completed' ||
              (!(
                docWriterOutcome?.completionKind === 'changed' &&
                docWriterReceipt.changedFiles.length > 0
              ) &&
                !(
                  docWriterOutcome?.completionKind === 'noop' &&
                  docWriterReceipt.changedFiles.length === 0 &&
                  docWriterOutcome.evidence.length > 0
                ))
                ? 'Doc-writer did not return a completed changed-files receipt or an evidence-backed no-op receipt.'
                : null)
            if (docWriterFailure) {
              activeWorkState.docWriterGateDone = true
              activeWorkState.validationAssurance = 'reduced'
              activeWorkState.latestWorkSummary = `Doc-writer failed: ${docWriterFailure}; continuing with reduced assurance.`
              markActiveWorkStateChanged()
            } else {
              activeWorkState.docWriterGateDone = true
              markActiveWorkStateChanged()
              emitGateTelemetry({
                currentPhase: 'awaiting_validation',
                pendingFileCount: currentPendingGateFiles.length,
                pendingFiles: currentPendingGateFiles,
                validationStatus: 'passed',
                reviewerStatus: 'passed',
                reuseReason: 'aux-gate:doc-writer',
              })
            }
          } else {
            activeWorkState.docWriterGateDone = true
            markActiveWorkStateChanged()
          }
        }
        // 3) security-reviewer gate
        if (
          runValidationGate &&
          editsHappened &&
          currentPendingGateFiles.length > 0 &&
          !activeWorkState.securityReviewGateDone &&
          matchesSecuritySensitiveGlob(currentPendingGateFiles)
        ) {
          auxGateFiredThisIteration = true
          const securitySnapshotDetails = buildGateSnapshotDetails(
            currentPendingGateFiles,
            currentGitStatusLineMap,
            '',
          )
          const securitySnapshotFingerprint = hashGateSnapshotDetails(
            securitySnapshotDetails,
          )
          const securityReviewResult = yield {
            toolName: 'spawn_agent_inline',
            input: {
              agent_type: 'security-reviewer',
              prompt: [
                'Perform the required snapshot-bound security review.',
                `Pending changed files: ${currentPendingGateFiles.join(', ')}`,
                `Snapshot fingerprint: ${securitySnapshotFingerprint}`,
                'Return only the declared structured output.',
              ].join('\n'),
              params: {
                changed_files: currentPendingGateFiles,
                snapshot_fingerprint: securitySnapshotFingerprint,
              },
            },
            includeToolCall: false,
          } as any
          const securityToolResult =
            (securityReviewResult as any)?.toolResult ?? securityReviewResult
          const securityCrash = detectReviewerCrash(securityToolResult)
          const securityBlockers = collectReviewerBlockers(securityToolResult)
          const securityAttestationIssues = collectReviewerAttestationIssues(
            securityToolResult,
            securitySnapshotFingerprint,
            currentPendingGateFiles,
          )
          const securityVerdict =
            getReviewerFinalizationVerdict(securityToolResult)
          const securityProtocolFailure =
            securityCrash ||
            securityAttestationIssues.length > 0 ||
            !securityVerdict
          if (securityBlockers.length > 0) {
            activeWorkState.securityReviewGateDone = true
            activeWorkState.preEditSecurityReviewDone = true
            activeWorkState.validationAssurance = 'reduced'
            activeWorkState.latestWorkSummary =
              'Security review did not produce a clean finalization verdict; continuing with reduced assurance.'
            markActiveWorkStateChanged()
            emitGateTelemetry({
              currentPhase: 'awaiting_validation',
              pendingFileCount: currentPendingGateFiles.length,
              pendingFiles: currentPendingGateFiles,
              reviewerStatus: 'passed',
              validationStatus: 'passed',
              reuseReason: 'aux-gate:security-reviewer',
            })
          }
          if (securityProtocolFailure) {
            activeWorkState.validationAssurance = 'reduced'
            activeWorkState.latestWorkSummary =
              'Security reviewer infrastructure failed without reporting a concrete finding; continuing with reduced assurance.'
          } else {
            recordSuccessfulReviewReceipt(
              securityToolResult,
              'security-reviewer',
              securitySnapshotFingerprint,
            )
          }
          activeWorkState.securityReviewGateDone = true
          activeWorkState.preEditSecurityReviewDone = true
          markActiveWorkStateChanged()
          emitGateTelemetry({
            currentPhase: 'awaiting_validation',
            pendingFileCount: currentPendingGateFiles.length,
            pendingFiles: currentPendingGateFiles,
            reviewerStatus: 'passed',
            validationStatus: 'passed',
            reuseReason: 'aux-gate:security-reviewer',
          })
        }
        // 4) deterministic reviewer-family specialist gates. Advisory
        // specialists never participate in this blocking post-edit path.
        if (
          runValidationGate &&
          editsHappened &&
          currentPendingGateFiles.length > 0
        ) {
          const routedSpecialists = selectSpecialistReviewersInline({
            files: currentPendingGateFiles,
            requirements: prompt ?? '',
          }).filter(
            (agentType) =>
              !activeWorkState.specialistReviewGatesDone?.includes(agentType),
          )
          if (routedSpecialists.length > 0) {
            const bundleResult = yield {
              toolName: 'get_change_review_bundle',
              input: {},
              includeToolCall: false,
            } as any
            const bundle = extractChangeReviewBundle(
              (bundleResult as any)?.toolResult ?? bundleResult,
            )
            if (!bundle.snapshotId) {
              activeWorkState.currentPhase = 'blocked'
              activeWorkState.openReviewerBlockers = [
                `Specialist review snapshot failed: ${bundle.errorMessage || 'missing snapshotId'}`,
              ]
              activeWorkState.nextRequiredAction =
                'Restore a valid change-review snapshot before specialist review.'
              markActiveWorkStateChanged()
              continue
            }
            if (bundle.files.length === 0) {
              // The snapshot has zero changed files (working tree already
              // clean/committed). A specialist reviewer spawned here can only
              // find nothing to review and would then fail file attestation,
              // so mark every routed specialist done and skip the spawn
              // instead of wasting a reviewer that can never pass. Do not set
              // auxGateFiredThisIteration; let control fall through so the
              // loop proceeds toward finalization.
              for (const agentType of routedSpecialists) {
                activeWorkState.specialistReviewGatesDone = Array.from(
                  new Set([
                    ...(activeWorkState.specialistReviewGatesDone ?? []),
                    agentType,
                  ]),
                )
              }
              activeWorkState.lastReviewerGateSkipReason =
                'no-pending-changes-in-snapshot'
              markActiveWorkStateChanged()
              emitGateTelemetry({
                currentPhase: 'final_response_allowed',
                pendingFileCount: 0,
                pendingFiles: [],
                reviewerStatus: 'skipped',
                validationStatus: 'skipped',
                reuseReason: 'no-pending-changes-in-snapshot',
              })
            } else {
              auxGateFiredThisIteration = true
              let specialistBlocked = false
              let specialistTerminalFailure = false
              const specialistResults = new Map<string, unknown>()
              const specialistSnapshots = new Map<string, string>()
              for (const agentType of routedSpecialists) {
                specialistSnapshots.set(agentType, bundle.snapshotId)
              }
              const firstSpecialistBatch = yield {
                toolName: 'spawn_agents',
                input: {
                  agents: routedSpecialists.map((agentType) => ({
                    agent_type: agentType,
                    prompt: [
                      'Perform the routed post-edit specialist review.',
                      `Requirements: ${prompt ?? '(none supplied)'}`,
                      `Changed files: ${currentPendingGateFiles.join(', ')}`,
                      `Snapshot ID (echo exactly): ${bundle.snapshotId}`,
                    ].join('\n'),
                    params: {
                      files: currentPendingGateFiles,
                      snapshot_id: bundle.snapshotId,
                    },
                  })),
                },
                includeToolCall: false,
              } as any
              const firstBatchToolResult =
                (firstSpecialistBatch as any)?.toolResult ?? firstSpecialistBatch
              for (const agentType of routedSpecialists) {
                specialistResults.set(
                  agentType,
                  extractSpawnedAgentResult(firstBatchToolResult, agentType),
                )
              }
              const retrySpecialists = routedSpecialists.filter((agentType) => {
                const result = specialistResults.get(agentType)
                return (
                  isStaleSnapshotReviewerResult(result) ||
                  collectReviewerAttestationIssues(
                    result,
                    bundle.snapshotId,
                    currentPendingGateFiles,
                  ).length > 0
                )
              })
              if (retrySpecialists.length > 0) {
                const refreshedBundleResult = yield {
                  toolName: 'get_change_review_bundle',
                  input: {},
                  includeToolCall: false,
                } as any
                const refreshedBundle = extractChangeReviewBundle(
                  (refreshedBundleResult as any)?.toolResult ??
                    refreshedBundleResult,
                )
                if (!refreshedBundle.snapshotId) {
                  activeWorkState.currentPhase = 'blocked'
                  activeWorkState.openReviewerBlockers = [
                    'Specialist review could not obtain a refreshed snapshot after attestation failure.',
                  ]
                  activeWorkState.openReviewerFindings = []
                  activeWorkState.nextRequiredAction =
                    'Stop concurrent edits and resume once the working tree is stable; the runtime will obtain a fresh review bundle.'
                  activeWorkState.latestWorkSummary =
                    'Specialist review stopped because snapshot refresh failed.'
                  markActiveWorkStateChanged()
                  specialistBlocked = true
                  specialistTerminalFailure = true
                } else {
                  const retryBatch = yield {
                    toolName: 'spawn_agents',
                    input: {
                      agents: retrySpecialists.map((agentType) => ({
                        agent_type: agentType,
                        prompt: [
                          'Retry the routed specialist review after snapshot/file attestation failure.',
                          `Requirements: ${prompt ?? '(none supplied)'}`,
                          `Changed files: ${currentPendingGateFiles.join(', ')}`,
                          `Snapshot ID (echo exactly): ${refreshedBundle.snapshotId}`,
                          'Correct the structured output directly; do not request source edits for this protocol error.',
                        ].join('\n'),
                        params: {
                          files: currentPendingGateFiles,
                          snapshot_id: refreshedBundle.snapshotId,
                        },
                      })),
                    },
                    includeToolCall: false,
                  } as any
                  const retryToolResult =
                    (retryBatch as any)?.toolResult ?? retryBatch
                  for (const agentType of retrySpecialists) {
                    specialistSnapshots.set(agentType, refreshedBundle.snapshotId)
                    specialistResults.set(
                      agentType,
                      extractSpawnedAgentResult(retryToolResult, agentType),
                    )
                  }
                }
              }
              if (!specialistTerminalFailure) {
                for (const agentType of routedSpecialists) {
                  const expectedSnapshotId =
                    specialistSnapshots.get(agentType) ?? bundle.snapshotId
                  const specialistToolResult = specialistResults.get(agentType)
                  const specialistAttestationIssues =
                    collectReviewerAttestationIssues(
                      specialistToolResult,
                      expectedSnapshotId,
                      currentPendingGateFiles,
                    )
                  if (
                    isStaleSnapshotReviewerResult(specialistToolResult) ||
                    specialistAttestationIssues.length > 0
                  ) {
                    activeWorkState.currentPhase = 'blocked'
                    activeWorkState.openReviewerBlockers = [
                      `${agentType} could not attest to a stable snapshot after one automatic refresh.`,
                      ...specialistAttestationIssues,
                    ]
                    activeWorkState.openReviewerFindings = []
                    activeWorkState.nextRequiredAction =
                      'Stop concurrent edits and resume once the working tree is stable; the runtime will obtain a fresh review bundle.'
                    activeWorkState.latestWorkSummary = `${agentType} stopped after two stale snapshot results.`
                    markActiveWorkStateChanged()
                    specialistBlocked = true
                    specialistTerminalFailure = true
                    break
                  }
                  const crash = detectReviewerCrash(specialistToolResult)
                  const blockers = collectReviewerBlockers(specialistToolResult)
                  const verdict =
                    getReviewerFinalizationVerdict(specialistToolResult)
                  if (blockers.length > 0) {
                    const normalizedBlockers = blockers
                    const records =
                      collectReviewerFindingRecordsInline(specialistToolResult)
                    activeWorkState.currentPhase = 'blocked'
                    activeWorkState.openReviewerBlockers = normalizedBlockers
                    activeWorkState.openReviewerFindings = normalizedBlockers.map(
                      (text: string, index: number) => ({
                        id:
                          records[index]?.id ??
                          buildReviewerFindingId(text, index),
                        gateId: `${agentType}:${expectedSnapshotId}`,
                        text: records[index]?.text ?? text,
                        status: 'open' as const,
                        files: currentPendingGateFiles,
                        snapshotFingerprint: expectedSnapshotId,
                        createdAt: new Date().toISOString(),
                      }),
                    )
                    activeWorkState.nextRequiredAction = `Resolve ${agentType} findings before validation and finalization.`
                    activeWorkState.latestWorkSummary = `${agentType} blocked the current change snapshot.`
                    markActiveWorkStateChanged()
                    specialistBlocked = true
                    break
                  }
                  if (crash || !verdict) {
                    activeWorkState.validationAssurance = 'reduced'
                    activeWorkState.latestWorkSummary = `${agentType} infrastructure failed without reporting a concrete finding; continuing with reduced assurance.`
                  } else {
                    recordSuccessfulReviewReceipt(
                      specialistToolResult,
                      agentType,
                      expectedSnapshotId,
                    )
                  }
                  activeWorkState.specialistReviewGatesDone = Array.from(
                    new Set([
                      ...(activeWorkState.specialistReviewGatesDone ?? []),
                      agentType,
                    ]),
                  )
                  markActiveWorkStateChanged()
                }
              }
              if (specialistBlocked) {
                if (specialistTerminalFailure) {
                  // Terminal specialist protocol failure: instead of breaking
                  // out of the loop (which silently kills the session while
                  // still "blocking"), record a skip reason and fall through
                  // toward finalization. The routed specialists were already
                  // marked done above, so this path cannot re-enter.
                  if (!activeWorkState.lastReviewerGateSkipReason) {
                    activeWorkState.lastReviewerGateSkipReason =
                      'specialist-terminal-failure'
                  }
                  activeWorkState.currentPhase = 'final_response_allowed'
                  activeWorkState.pendingGateFiles = []
                  activeWorkState.openReviewerBlockers = []
                  markActiveWorkStateChanged()
                  continue
                }
                continue
              }
            }
          }
        }
        // After any aux gate fired (or all three skipped/marked done), re-loop
        // so validation+reviewer (the FINAL gate) re-enters on a fresh read.
        // This blocks the orchestrator behind the aux spawns (each yield
        // blocked until the child completed) and lets the loop re-read pending
        // files before the final gate runs.
        if (auxGateFiredThisIteration) continue
        if (
          runValidationGate &&
          editsHappened &&
          currentPendingGateFiles.length === 0
        ) {
          activeWorkState.lastReviewerGateSkipReason =
            'edits-detected-without-pending-gate-files'
          activeWorkState.nextRequiredAction =
            'Unsafe reviewer gate state: edits were detected without pending gate files. Re-read the edited files/status, make a minimal follow-up edit if needed to restore pending gate files, then finish so validation/review can run safely.'
          activeWorkState.currentPhase = 'blocked'
          activeWorkState.latestWorkSummary =
            'Unsafe gate state: edits were detected without pending gate files.'
          markActiveWorkStateChanged()
          emitGateTelemetry({
            currentPhase: activeWorkState.currentPhase,
            pendingFileCount: 0,
            pendingFiles: [],
            skipReason: 'edits-detected-without-pending-gate-files',
            validationStatus: 'failed',
            reviewerStatus: 'failed',
          })
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content: [
                'Reviewer/validation gate cannot safely continue: edits were detected, but there are no pending gate files to validate or review.',
                '',
                'Skip/error reason: edits-detected-without-pending-gate-files.',
                'Do not finalize. Re-read the edited files/status, make a minimal follow-up edit if needed to restore pending gate files, then finish so validation/review can run safely.',
                formatGateStateBlock(
                  'validation/reviewer',
                  'failed',
                  'edits-detected-without-pending-gate-files: edits were detected, but there are no pending gate files to validate or review.',
                ),
              ].join('\n'),
            },
            includeToolCall: false,
          } as any
          continue
        }
        const conversationGatePass = getConversationGatePassForPendingFiles(
          currentPendingGateFiles,
          currentConversationMessages,
        )
        const conversationValidationSummary =
          activeWorkState.lastValidationSummary ||
          activeWorkState.gatePassedValidationSummary ||
          'No configured file-change hooks ran.'
        if (
          runValidationGate &&
          editsHappened &&
          conversationGatePass &&
          hasFreshGateFingerprintForPendingFiles(
            currentPendingGateFiles,
            currentGitStatusLineMap,
            conversationValidationSummary,
          )
        ) {
          const conversationReviewerVerdict =
            conversationGatePass.reviewerVerdict || 'LOOKS_GOOD'
          activeWorkState.openReviewerBlockers = []
          activeWorkState.pendingGateFiles = []
          activeWorkState.latestWorkSummary = ''
          activeWorkState.nextRequiredAction = ''
          activeWorkState.currentPhase = 'final_response_allowed'
          activeWorkState.lastReviewerGateSkipReason = ''
          activeWorkState.lastValidationSummary = conversationValidationSummary
          for (const file of currentPendingGateFiles) {
            gatePassedFiles.add(file)
          }
          activeWorkState.gatePassedFiles = Array.from(gatePassedFiles)
          activeWorkState.gatePassedPendingFiles = currentPendingGateFiles
          activeWorkState.gatePassedReviewerVerdict =
            conversationReviewerVerdict
          activeWorkState.gatePassedValidationSummary =
            conversationValidationSummary
          activeWorkState.gatePassedFingerprint = buildGateFingerprint(
            currentPendingGateFiles,
            currentGitStatusLineMap,
            conversationValidationSummary,
          )
          pendingGateFiles.clear()
          editsHappened = false
          gatePassedForCurrentEdits = true
          finalResponseGateOpen = true
          mutableAgentState.canSuggestFollowups = true
          markActiveWorkStateChanged()
          emitGateTelemetry({
            currentPhase: 'final_response_allowed',
            pendingFileCount: currentPendingGateFiles.length,
            pendingFiles: currentPendingGateFiles,
            reviewerStatus: 'passed',
            validationStatus: 'passed',
            reuseReason: 'conversation-gate-state',
            reviewerVerdict: conversationReviewerVerdict,
          })
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content: [
                `Previous validation and reviewer gate already passed in this conversation with ${conversationReviewerVerdict} for pending files: ${currentPendingGateFiles.join(', ')}.`,
                'Reusing that unchanged gate result; you may now provide the final user-visible summary and optional follow-up suggestions. Do not make more edits unless absolutely necessary; any new edits will rerun the gate.',
                formatGateStateBlock(
                  'validation/reviewer',
                  'passed',
                  `conversation gate-state reuse; reviewer verdict ${conversationReviewerVerdict}; pending files: ${currentPendingGateFiles.join(', ')}`,
                ),
              ].join('\n'),
            },
            includeToolCall: false,
          } as any
          continue
        }
        if (
          runValidationGate &&
          editsHappened &&
          hasDurableGatePassForPendingFiles(
            currentPendingGateFiles,
            currentGitStatusLineMap,
          )
        ) {
          const durableReviewerVerdict =
            reviewerFinalizationVerdictFromDurablePass()
          const durableValidationSummary =
            activeWorkState.gatePassedValidationSummary ||
            activeWorkState.lastValidationSummary ||
            'No configured file-change hooks ran.'
          activeWorkState.openReviewerBlockers = []
          activeWorkState.pendingGateFiles = []
          activeWorkState.latestWorkSummary = ''
          activeWorkState.nextRequiredAction = ''
          activeWorkState.currentPhase = 'final_response_allowed'
          activeWorkState.lastReviewerGateSkipReason = ''
          activeWorkState.repairRoundCount = 0
          activeWorkState.repairSessionId = undefined
          activeWorkState.repairEscalationDone = undefined
          activeWorkState.lastValidationSummary = durableValidationSummary
          pendingGateFiles.clear()
          editsHappened = false
          gatePassedForCurrentEdits = true
          finalResponseGateOpen = true
          mutableAgentState.canSuggestFollowups = true
          markActiveWorkStateChanged()
          emitGateTelemetry({
            currentPhase: 'final_response_allowed',
            pendingFileCount: currentPendingGateFiles.length,
            pendingFiles: currentPendingGateFiles,
            reviewerStatus: 'passed',
            validationStatus: 'passed',
            reuseReason: 'durable-fingerprint-match',
            reviewerVerdict: durableReviewerVerdict,
            fingerprintPrefix:
              typeof activeWorkState.gatePassedFingerprint === 'string'
                ? activeWorkState.gatePassedFingerprint.slice(0, 16)
                : undefined,
          })
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content: [
                `Previous validation and reviewer gate already passed with ${durableReviewerVerdict} for pending files: ${currentPendingGateFiles.join(', ')}.`,
                'You may now provide the final user-visible summary and optional follow-up suggestions. Do not make more edits unless absolutely necessary; any new edits will rerun the gate.',
                formatGateStateBlock(
                  'validation/reviewer',
                  'passed',
                  `durable gate-pass reuse via fingerprint match; reviewer verdict ${durableReviewerVerdict}; pending files: ${currentPendingGateFiles.join(', ')}`,
                ),
              ].join('\n'),
            },
            includeToolCall: false,
          } as any
          continue
        }

        const reviewerProtocolBlocked =
          runReviewerGate &&
          editsHappened &&
          activeWorkState.lastReviewerGateSkipReason ===
            'reviewer-protocol-attestation-failed' &&
          (activeWorkState.reviewerProtocolRetryCount ?? 0) >= 1
        const reviewerProtocolBypassAuthorized =
          reviewerProtocolBlocked &&
          hasReviewerBypassAuthorization(
            currentConversationMessages,
            activeWorkState.reviewerBypassChallenge,
            reviewChallengeFingerprint(
              currentPendingGateFiles,
              currentGitStatusLineMap,
            ),
          )
        if (reviewerProtocolBlocked && !reviewerProtocolBypassAuthorized) {
          const challenge = ensureReviewerBypassChallenge(
            reviewChallengeFingerprint(
              currentPendingGateFiles,
              currentGitStatusLineMap,
            ),
            currentConversationMessages,
          )
          activeWorkState.currentPhase = 'blocked'
          activeWorkState.nextRequiredAction = `Reviewer protocol attestation failed twice. Fix reviewer configuration or explicitly reply "BYPASS REVIEWER ${challenge.id}"; the harness will not retry automatically.`
          markActiveWorkStateChanged()
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content: [
                'Reviewer protocol remains blocked after the bounded retry.',
                'No source repair or additional reviewer retry will run automatically.',
                `Fix reviewer configuration, or explicitly reply "BYPASS REVIEWER ${challenge.id}" to finalize using the recorded validation evidence for this snapshot only.`,
              ].join('\n'),
            },
            includeToolCall: false,
          } as any
          break
        }

        // Verification gate: after the model thinks it's done, run configured
        // file-change hooks (typecheck/lint/test). If any failed, surface the
        // failures and keep the turn open so the model fixes them. The runtime's
        // max step limit bounds pathological retry loops; the gate itself must
        // not silently skip validation after repeated failures.
        //
        // static-review-only concurrency (M3.1): when the reviewer is
        // static-only (base2ActiveWork.staticReviewOnly), spawn it in the
        // background BEFORE the blocking validation hooks so static review
        // runs concurrently. The join contract is preserved: a validation
        // failure still `continue`s below and ignores this background job; we
        // only `check_background_agent` for its result if validation passes.
        const staticReviewConcurrency =
          runReviewerGate && editsHappened && staticReviewOnlyEnabled
        const reviewSnapshotDetails = buildGateSnapshotDetails(
          Array.from(pendingGateFiles),
          currentGitStatusLineMap,
          '',
        )
        const reviewSnapshotFingerprint = hashGateSnapshotDetails(
          reviewSnapshotDetails,
        )
        if (staticReviewConcurrency && !activeWorkState.staticReviewerJobId) {
          const bgReview = yield {
            toolName: 'spawn_agents',
            input: {
              agents: [
                {
                  agent_type: reviewerAgentType,
                  background: true,
                  prompt: [
                    'Review the completed default-flow code changes before finalization.',
                    '',
                    `Pending changed files: ${Array.from(pendingGateFiles).join(', ') || '(unknown)'}`,
                    `Snapshot fingerprint (echo exactly): ${reviewSnapshotFingerprint}`,
                    'Snapshot details (read for file membership; do not echo):',
                    reviewSnapshotDetails,
                    'Validation gate summary: Reviewer running concurrently with validation (static-review-only mode).',
                    '',
                    'Return the required structured review object. Echo snapshotFingerprint exactly, list every reviewed file, evaluate all review dimensions, and map every user requirement to evidence. Test-coverage requirements are satisfied (not uncertain) when the changed *.test.ts file in this same reviewed snapshot covers the changed behavior — cite that test file and the covering test name(s) as the requirement evidence. Use coverage: missing only when no mapped test exists anywhere, and requirement status uncertain only when you could not inspect the changed test file at all.',
                  ].join('\n'),
                },
              ],
            },
          } as any
          const bgJobId = extractBackgroundAgentJobId(
            (bgReview as any) && (bgReview as any).toolResult,
          )
          if (bgJobId) {
            activeWorkState.staticReviewerJobId = bgJobId
          }
        }
        let validationSummary =
          'No file changes were detected, so no validation hooks ran.'
        const validationInfrastructureBypassed =
          activeWorkState.validationInfrastructureBypassFingerprint ===
          reviewSnapshotFingerprint
        if (
          editsHappened &&
          runValidationGate &&
          !validationInfrastructureBypassed
        ) {
          const verify = yield {
            toolName: 'run_file_change_hooks',
            input: { files: Array.from(pendingGateFiles) },
          } as any
          let failures = collectHookFailures(
            (verify as any) && (verify as any).toolResult,
          )
          if (failures.length === 0) {
            validationSummary = summarizeHookResults(
              (verify as any) && (verify as any).toolResult,
            )
            activeWorkState.lastValidationSummary = validationSummary
            activeWorkState.validationAssurance = validationSummary.startsWith(
              'REDUCED_ASSURANCE:',
            )
              ? 'reduced'
              : 'full'
            activeWorkState.validationEvidence = [
              {
                gateId: reviewSnapshotFingerprint,
                files: Array.from(pendingGateFiles),
                snapshotFingerprint: buildGateFingerprint(
                  Array.from(pendingGateFiles),
                  currentGitStatusLineMap,
                  validationSummary,
                ),
                summary: validationSummary,
                assurance: activeWorkState.validationAssurance,
                recordedAt: new Date().toISOString(),
              },
            ]
            activeWorkState.currentPhase = 'awaiting_review'
            markActiveWorkStateChanged()
          } else {
            if (activeWorkState.staticReviewerJobId) {
              yield {
                toolName: 'check_background_agent',
                input: {
                  jobId: activeWorkState.staticReviewerJobId,
                  cancel: true,
                },
                includeToolCall: false,
              } as any
              activeWorkState.staticReviewerJobId = undefined
            }
            const repairRound = activeWorkState.repairRoundCount ?? 0
            const parsed = parseValidationFailures(failures)
            const hasParseableFailures = parsed.some((p) => p.file.length > 0)
            const hasInfrastructureFailures = failures.every((failure) =>
              /(?:command denied|permission denied|not found|enoent|could not find|failed to spawn|spawn .* failed|timed out|timeout|missing executable|is not recognized as an internal or external command)/i.test(
                failure,
              ),
            )
            const canRepair =
              repairRound < MAX_REPAIR_ROUNDS && hasParseableFailures
            if (canRepair) {
              if (!activeWorkState.repairSessionId) {
                activeWorkState.repairSessionId = `repair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
              }
              activeWorkState.currentPhase = 'repair_loop'
              activeWorkState.repairRoundCount = repairRound + 1
              activeWorkState.latestWorkSummary = `Repair round ${repairRound + 1}/${MAX_REPAIR_ROUNDS}: parsing ${failures.length} validation failure(s) and spawning targeted editor fix.`
              activeWorkState.nextRequiredAction = ''
              markActiveWorkStateChanged()
              emitGateTelemetry({
                currentPhase: 'repair_loop',
                pendingFileCount: pendingGateFiles.size,
                pendingFiles: Array.from(pendingGateFiles),
                validationStatus: 'failed',
                repairRound: repairRound + 1,
                blockerCount: failures.length,
              })
              let debuggerContext = ''
              if (repairRound >= 1) {
                const diagnosis = yield {
                  toolName: 'spawn_agents',
                  input: {
                    agents: [
                      {
                        agent_type: 'debugger',
                        prompt: [
                          'Diagnose these repeated validation failures before another repair attempt.',
                          `Pending files: ${Array.from(pendingGateFiles).join(', ')}`,
                          ...failures,
                        ].join('\n'),
                        params: {
                          suspect_files: Array.from(pendingGateFiles),
                        },
                      },
                    ],
                  },
                } as any
                try {
                  debuggerContext = JSON.stringify(
                    (diagnosis as any)?.toolResult ?? [],
                  ).slice(0, 6_000)
                } catch {
                  debuggerContext = 'Debugger output was not serializable.'
                }
              }
              const repair = yield {
                toolName: 'spawn_agents',
                input: {
                  agents: [
                    {
                      agent_type: 'repair-editor',
                      handoff: {
                        schemaVersion: 1,
                        taskId:
                          activeWorkState.repairSessionId ??
                          'validation-repair',
                        role: 'repair-editor',
                        objective:
                          'Resolve the current validation failures without unrelated changes.',
                        requirements: failures.map(
                          (text: string, index: number) => ({
                            id: `VF-${index + 1}`,
                            text,
                            required: true,
                          }),
                        ),
                        acceptanceCriteria: [
                          {
                            id: 'validation-passes',
                            behavior:
                              'Every supplied validation failure is repaired without unrelated changes.',
                            verification:
                              'The parent reruns the targeted validation gate on the resulting workspace snapshot.',
                          },
                        ],
                        context: [],
                        invariants: [
                          'Read each live target before editing.',
                          'Do not modify files outside the pending gate file set.',
                        ],
                        nonGoals: ['Unrelated refactors or cleanup.'],
                        risks: [
                          'Stale validation diagnostics or overlapping user edits.',
                        ],
                        unknowns: [],
                        findings: failures.map(
                          (text: string, index: number) => ({
                            id: `VF-${index + 1}`,
                            text,
                            files: Array.from(pendingGateFiles),
                            snapshotFingerprint: buildGateFingerprint(
                              Array.from(pendingGateFiles),
                              currentGitStatusLineMap,
                              validationSummary,
                            ),
                          }),
                        ),
                        permissions: {
                          readablePaths: repairEditorReadablePaths([
                            ...pendingGateFiles,
                            ...parsed.map((p: { file: string }) => p.file),
                          ]),
                          writablePaths: Array.from(
                            new Set([
                              ...pendingGateFiles,
                              ...parsed.map((p: { file: string }) => p.file),
                            ]),
                          ),
                          allowedTools: [
                            'read_files',
                            'read_outline',
                            'edit_transaction',
                          ],
                        },
                        workspaceRevision:
                          mutableAgentState.workspaceState?.revision,
                        workspaceSnapshotId:
                          mutableAgentState.workspaceState?.snapshotId,
                        artifacts: [],
                        successCriteria: ['Targeted validation passes.'],
                        constraints: [
                          'Keep every change causally tied to a supplied failure.',
                        ],
                      },
                      prompt:
                        buildRepairEditorPrompt(
                          parsed,
                          Array.from(pendingGateFiles),
                        ) +
                        (debuggerContext
                          ? `\n\nDebugger diagnosis from the prior repeated failure:\n${debuggerContext}`
                          : ''),
                    },
                  ],
                },
              } as any
              const validationFindingIds = failures.map(
                (_text: string, index: number) => `VF-${index + 1}`,
              )
              const validationRepairReceipt = extractAgentReceipt(
                (repair as any)?.toolResult ?? repair,
              )
              if (
                !validationRepairReceipt ||
                validationRepairReceipt.status !== 'completed' ||
                validationFindingIds.some(
                  (id: string) =>
                    !validationRepairReceipt.findingsAddressed.includes(id),
                )
              ) {
                activeWorkState.currentPhase = 'blocked'
                activeWorkState.nextRequiredAction =
                  'Repair-editor did not return a completed receipt addressing every validation failure.'
                activeWorkState.latestWorkSummary =
                  'Validation repair receipt was incomplete or missing.'
                markActiveWorkStateChanged()
                break
              }
              const repairGitStatus = yield {
                toolName: 'git_status',
                input: {},
              } as any
              const repairChangedFiles = extractGitStatusFiles(
                (repairGitStatus as any)?.toolResult,
              ).filter(
                (file: string) =>
                  !initialGitStatusFiles.includes(file) &&
                  !gatePassedFiles.has(file),
              )
              if (repairChangedFiles.length > 0) {
                recordChangedFiles(repairChangedFiles, { fromRepair: true })
                activeWorkState.latestWorkSummary = `Repair editor (round ${repairRound + 1}/${MAX_REPAIR_ROUNDS}) fixed: ${repairChangedFiles.join(', ')}`
                markActiveWorkStateChanged()
              }
              const reVerify = yield {
                toolName: 'run_file_change_hooks',
                input: { files: Array.from(pendingGateFiles) },
              } as any
              const reFailures = collectHookFailures(
                (reVerify as any) && (reVerify as any).toolResult,
              )
              if (reFailures.length === 0) {
                validationSummary = summarizeHookResults(
                  (reVerify as any) && (reVerify as any).toolResult,
                )
                activeWorkState.lastValidationSummary = validationSummary
                activeWorkState.currentPhase = 'awaiting_review'
                activeWorkState.nextRequiredAction = ''
                markActiveWorkStateChanged()
                emitGateTelemetry({
                  currentPhase: 'awaiting_review',
                  pendingFileCount: pendingGateFiles.size,
                  pendingFiles: Array.from(pendingGateFiles),
                  validationStatus: 'passed',
                  repairRound: repairRound + 1,
                  reuseReason: 'repair-succeeded',
                })
                continue
              } else {
                activeWorkState.nextRequiredAction =
                  'Fix the remaining validation hook failures before doing anything else.'
                activeWorkState.lastReviewerGateSkipReason =
                  'validation-hook-failures'
                activeWorkState.currentPhase = 'blocked'
                activeWorkState.latestWorkSummary = `Repair editor (round ${repairRound + 1}/${MAX_REPAIR_ROUNDS}) ran but ${reFailures.length} failure(s) remain.`
                markActiveWorkStateChanged()
                emitGateTelemetry({
                  currentPhase: 'blocked',
                  pendingFileCount: pendingGateFiles.size,
                  pendingFiles: Array.from(pendingGateFiles),
                  validationStatus: 'failed',
                  repairRound: repairRound + 1,
                  blockerCount: reFailures.length,
                  skipReason: 'repair-incomplete',
                })
                yield {
                  toolName: 'add_message',
                  input: {
                    role: 'user',
                    content: [
                      `Automated repair editor ran (round ${repairRound + 1}/${MAX_REPAIR_ROUNDS}) but ${reFailures.length} validation failure(s) remain. Fix these before ending your turn:`,
                      '',
                      ...reFailures,
                      '',
                      'Read the exact failing locations, make minimal targeted fixes, then finish (the hooks will re-run).',
                      formatGateStateBlock(
                        'validation',
                        'failed',
                        `repair-incomplete: round ${repairRound + 1}/${MAX_REPAIR_ROUNDS}; ${reFailures.length} failure(s) remain for pending files: ${Array.from(pendingGateFiles).join(', ') || '(unknown files)'}`,
                        repairRound + 1,
                      ),
                    ].join('\n'),
                  },
                  includeToolCall: false,
                } as any
                continue
              }
            } else {
              const canEscalate =
                hasParseableFailures && !activeWorkState.repairEscalationDone
              if (canEscalate) {
                activeWorkState.currentPhase = 'repair_loop'
                activeWorkState.repairEscalationDone = true
                activeWorkState.latestWorkSummary = `Repair budget exhausted (${MAX_REPAIR_ROUNDS}/${MAX_REPAIR_ROUNDS}); spawning one escalation editor with broader root-cause context.`
                activeWorkState.nextRequiredAction = ''
                markActiveWorkStateChanged()
                emitGateTelemetry({
                  currentPhase: 'repair_loop',
                  pendingFileCount: pendingGateFiles.size,
                  pendingFiles: Array.from(pendingGateFiles),
                  validationStatus: 'failed',
                  repairRound: MAX_REPAIR_ROUNDS,
                  blockerCount: failures.length,
                  reuseReason: 'repair-budget-escalation',
                })
                const escalate = yield {
                  toolName: 'spawn_agents',
                  input: {
                    agents: [
                      {
                        agent_type: 'repair-editor',
                        handoff: {
                          schemaVersion: 1,
                          taskId:
                            activeWorkState.repairSessionId ??
                            'validation-escalation',
                          role: 'repair-editor',
                          objective:
                            'Resolve the exhausted validation failures through root-cause repair.',
                          requirements: failures.map(
                            (text: string, index: number) => ({
                              id: `VF-${index + 1}`,
                              text,
                              required: true,
                            }),
                          ),
                          acceptanceCriteria: [
                            {
                              id: 'validation-passes',
                              behavior:
                                'The root cause of every remaining validation failure is resolved.',
                              verification:
                                'The parent reruns the targeted validation gate on the resulting workspace snapshot.',
                            },
                          ],
                          context: [],
                          invariants: [
                            'Read each live target before editing.',
                            'Do not modify files outside the pending gate file set.',
                          ],
                          nonGoals: [
                            'Speculative refactors or unrelated cleanup.',
                          ],
                          risks: [
                            'Repeated surface-level fixes can hide the actual root cause.',
                          ],
                          unknowns: [],
                          findings: failures.map(
                            (text: string, index: number) => ({
                              id: `VF-${index + 1}`,
                              text,
                              files: Array.from(pendingGateFiles),
                              snapshotFingerprint: buildGateFingerprint(
                                Array.from(pendingGateFiles),
                                currentGitStatusLineMap,
                                validationSummary,
                              ),
                            }),
                          ),
                          permissions: {
                            readablePaths: repairEditorReadablePaths([
                              ...pendingGateFiles,
                              ...parsed.map((p: { file: string }) => p.file),
                            ]),
                            writablePaths: Array.from(
                              new Set([
                                ...pendingGateFiles,
                                ...parsed.map((p: { file: string }) => p.file),
                              ]),
                            ),
                            allowedTools: [
                              'read_files',
                              'read_outline',
                              'edit_transaction',
                            ],
                          },
                          workspaceRevision:
                            mutableAgentState.workspaceState?.revision,
                          workspaceSnapshotId:
                            mutableAgentState.workspaceState?.snapshotId,
                          artifacts: [],
                          successCriteria: ['Targeted validation passes.'],
                          constraints: [
                            'Keep every change causally tied to a supplied failure.',
                          ],
                        },
                        prompt: buildEscalationEditorPrompt(
                          parsed,
                          Array.from(pendingGateFiles),
                          MAX_REPAIR_ROUNDS,
                        ),
                      },
                    ],
                  },
                } as any
                const escalationFindingIds = failures.map(
                  (_text: string, index: number) => `VF-${index + 1}`,
                )
                const escalationReceipt = extractAgentReceipt(
                  (escalate as any)?.toolResult ?? escalate,
                )
                if (
                  !escalationReceipt ||
                  escalationReceipt.status !== 'completed' ||
                  escalationFindingIds.some(
                    (id: string) =>
                      !escalationReceipt.findingsAddressed.includes(id),
                  )
                ) {
                  activeWorkState.currentPhase = 'blocked'
                  activeWorkState.nextRequiredAction =
                    'Escalation repair-editor did not return a completed receipt addressing every validation failure.'
                  activeWorkState.latestWorkSummary =
                    'Validation escalation receipt was incomplete or missing.'
                  markActiveWorkStateChanged()
                  break
                }
                const escalateGitStatus = yield {
                  toolName: 'git_status',
                  input: {},
                } as any
                const escalateChangedFiles = extractGitStatusFiles(
                  (escalateGitStatus as any)?.toolResult,
                ).filter(
                  (file: string) =>
                    !initialGitStatusFiles.includes(file) &&
                    !gatePassedFiles.has(file),
                )
                if (escalateChangedFiles.length > 0) {
                  recordChangedFiles(escalateChangedFiles, { fromRepair: true })
                  activeWorkState.latestWorkSummary = `Escalation editor fixed: ${escalateChangedFiles.join(', ')}`
                  markActiveWorkStateChanged()
                }
                const escalateVerify = yield {
                  toolName: 'run_file_change_hooks',
                  input: { files: Array.from(pendingGateFiles) },
                } as any
                const escalateFailures = collectHookFailures(
                  (escalateVerify as any) && (escalateVerify as any).toolResult,
                )
                if (escalateFailures.length === 0) {
                  validationSummary = summarizeHookResults(
                    (escalateVerify as any) &&
                      (escalateVerify as any).toolResult,
                  )
                  activeWorkState.lastValidationSummary = validationSummary
                  activeWorkState.currentPhase = 'awaiting_review'
                  activeWorkState.nextRequiredAction = ''
                  markActiveWorkStateChanged()
                  emitGateTelemetry({
                    currentPhase: 'awaiting_review',
                    pendingFileCount: pendingGateFiles.size,
                    pendingFiles: Array.from(pendingGateFiles),
                    validationStatus: 'passed',
                    repairRound: MAX_REPAIR_ROUNDS,
                    reuseReason: 'escalation-succeeded',
                  })
                  continue
                }
                failures = escalateFailures
              }
              if (!hasParseableFailures && hasInfrastructureFailures) {
                validationSummary = `REDUCED_ASSURANCE: Validation infrastructure could not produce source diagnostics: ${failures.join(' | ')}`
                activeWorkState.validationInfrastructureBypassFingerprint =
                  reviewSnapshotFingerprint
                activeWorkState.lastValidationSummary = validationSummary
                activeWorkState.validationAssurance = 'reduced'
                activeWorkState.currentPhase = 'awaiting_review'
                activeWorkState.nextRequiredAction = ''
                markActiveWorkStateChanged()
                emitGateTelemetry({
                  currentPhase: 'awaiting_review',
                  pendingFileCount: pendingGateFiles.size,
                  pendingFiles: Array.from(pendingGateFiles),
                  validationStatus: 'skipped',
                  skipReason: 'validation-infrastructure-failure',
                  blockerCount: failures.length,
                  repairRound,
                })
                continue
              }
              activeWorkState.nextRequiredAction =
                'Fix the blocking validation hook failures before doing anything else.'
              activeWorkState.lastReviewerGateSkipReason =
                'validation-hook-failures'
              activeWorkState.currentPhase = 'blocked'
              activeWorkState.latestWorkSummary = `Validation failed for pending files: ${Array.from(pendingGateFiles).join(', ') || '(unknown files)'}`
              markActiveWorkStateChanged()
              emitGateTelemetry({
                currentPhase: 'blocked',
                pendingFileCount: pendingGateFiles.size,
                pendingFiles: Array.from(pendingGateFiles),
                validationStatus: 'failed',
                skipReason: hasParseableFailures
                  ? activeWorkState.repairEscalationDone
                    ? 'escalation-exhausted'
                    : 'repair-budget-exhausted'
                  : 'unparseable-failures',
                blockerCount: failures.length,
                repairRound,
              })
              yield {
                toolName: 'add_message',
                input: {
                  role: 'user',
                  content: [
                    'Verification gate: configured file-change hooks failed. These are blocking — fix them before ending your turn:',
                    '',
                    ...failures,
                    '',
                    'Read the exact failing locations, make minimal targeted fixes, then finish (the hooks will re-run).',
                    formatGateStateBlock(
                      'validation',
                      'failed',
                      `validation-hook-failures: ${failures.length} hook failure(s) for pending files: ${Array.from(pendingGateFiles).join(', ') || '(unknown files)'}`,
                      MAX_REPAIR_ROUNDS,
                    ),
                  ].join('\n'),
                },
                includeToolCall: false,
              } as any
              continue
            }
          }
        } else if (validationInfrastructureBypassed) {
          validationSummary =
            activeWorkState.lastValidationSummary ||
            'REDUCED_ASSURANCE: Validation infrastructure was unavailable for this snapshot.'
          activeWorkState.validationAssurance = 'reduced'
          activeWorkState.currentPhase = 'awaiting_review'
        }

        let reviewerFinalizationVerdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | '' =
          reviewerProtocolBypassAuthorized ? 'NON_BLOCKING' : ''
        if (reviewerProtocolBypassAuthorized) {
          activeWorkState.reviewerGateBypassReason =
            'User authorized bypass after repeated reviewer protocol attestation failures.'
          activeWorkState.reviewerGateBypassRecord = {
            reason: activeWorkState.reviewerGateBypassReason,
            authorizedAt: new Date().toISOString(),
            pendingFiles: Array.from(pendingGateFiles),
            fingerprint: reviewSnapshotFingerprint,
            validationSummary,
          }
          if (activeWorkState.reviewerBypassChallenge) {
            activeWorkState.reviewerBypassChallenge.consumed = true
          }
          activeWorkState.currentPhase = 'awaiting_review'
          activeWorkState.nextRequiredAction = ''
          activeWorkState.lastReviewerGateSkipReason =
            'user-authorized-reviewer-protocol-bypass'
          markActiveWorkStateChanged()
        }
        if (
          activeWorkState.lastReviewerGateSkipReason ===
          'reviewer-protocol-attestation-failed'
        ) {
          // Re-entry guard: a prior iteration already exhausted the bounded
          // reviewer protocol retry and recorded a skip. Clear the blocking
          // state and treat the reviewer gate as skipped for this snapshot so
          // the loop proceeds toward finalization instead of re-spawning the
          // reviewer (which would loop forever because the retry count is
          // already exhausted). Mark the pending files as gate-passed and open
          // the final-response gate so git status does not re-detect the
          // still-modified files and re-enter the gate forever.
          for (const file of pendingGateFiles) gatePassedFiles.add(file)
          activeWorkState.gatePassedFiles = Array.from(gatePassedFiles)
          activeWorkState.currentPhase = 'final_response_allowed'
          activeWorkState.pendingGateFiles = []
          pendingGateFiles.clear()
          activeWorkState.openReviewerBlockers = []
          editsHappened = false
          finalResponseGateOpen = true
          mutableAgentState.canSuggestFollowups = true
          markActiveWorkStateChanged()
        }
        if (
          runReviewerGate &&
          editsHappened &&
          !reviewerProtocolBypassAuthorized &&
          activeWorkState.lastReviewerGateSkipReason !==
            'reviewer-protocol-attestation-failed'
        ) {
          activeWorkState.lastReviewerGateSkipReason = ''
          markActiveWorkStateChanged()
          let reviewerToolResult: unknown
          if (staticReviewConcurrency && activeWorkState.staticReviewerJobId) {
            const checkResult = yield {
              toolName: 'check_background_agent',
              input: {
                jobId: activeWorkState.staticReviewerJobId,
                timeout_seconds: 120,
              },
            } as any
            // check_background_agent returns { result } where `result` is the
            // subagent's final output (same shape a foreground spawn_agents
            // toolResult wraps). Wait for the background reviewer to settle
            // rather than matching only one verdict token: LOOKS_GOOD and
            // NON_BLOCKING both pass, while BLOCKING must be parsed below as
            // actionable feedback. On error/timeout with no result, fall
            // through to the existing 'did not return LOOKS_GOOD/NON_BLOCKING'
            // blocked handling below.
            reviewerToolResult =
              (checkResult as any)?.toolResult?.result ??
              (checkResult as any)?.toolResult
          } else {
            const review = yield {
              toolName: 'spawn_agents',
              input: {
                agents: [
                  {
                    agent_type: reviewerAgentType,
                    prompt: [
                      'Review the completed default-flow code changes before finalization.',
                      '',
                      `Pending changed files: ${Array.from(pendingGateFiles).join(', ') || '(unknown)'}`,
                      `Snapshot fingerprint (echo exactly): ${reviewSnapshotFingerprint}`,
                      'Snapshot details (read for file membership; do not echo):',
                      reviewSnapshotDetails,
                      `Validation gate summary: ${validationSummary}`,
                      '',
                      'Return the required structured review object. Echo snapshotFingerprint exactly, list every reviewed file, evaluate all review dimensions, and map every user requirement to evidence. Test-coverage requirements are satisfied (not uncertain) when the changed *.test.ts file in this same reviewed snapshot covers the changed behavior — cite that test file and the covering test name(s) as the requirement evidence. Use coverage: missing only when no mapped test exists anywhere, and requirement status uncertain only when you could not inspect the changed test file at all.',
                    ].join('\n'),
                  },
                ],
              },
            } as any
            reviewerToolResult = (review as any) && (review as any).toolResult
          }
          const reviewerCrashedBeforeAttestation =
            detectReviewerCrash(reviewerToolResult)
          let attestationIssues = reviewerCrashedBeforeAttestation
            ? []
            : collectReviewerAttestationIssues(
                reviewerToolResult,
                reviewSnapshotFingerprint,
                Array.from(pendingGateFiles),
              )
          if (
            attestationIssues.length > 0 &&
            (activeWorkState.reviewerProtocolRetryCount ?? 0) < 1
          ) {
            activeWorkState.reviewerProtocolRetryCount = 1
            activeWorkState.currentPhase = 'awaiting_review'
            activeWorkState.nextRequiredAction =
              'Retry the reviewer once with corrected snapshot/file attestation; do not edit source files for a reviewer protocol error.'
            activeWorkState.latestWorkSummary =
              'Reviewer protocol attestation failed; running one bounded reviewer-only retry.'
            markActiveWorkStateChanged()
            const retryReview = yield {
              toolName: 'spawn_agents',
              input: {
                agents: [
                  {
                    agent_type: reviewerAgentType,
                    prompt: [
                      'Retry the completed default-flow code review because the prior response failed the reviewer protocol contract.',
                      '',
                      `Pending changed files: ${Array.from(pendingGateFiles).join(', ') || '(unknown)'}`,
                      `Snapshot fingerprint (echo exactly): ${reviewSnapshotFingerprint}`,
                      'Snapshot details (read for file membership; do not echo):',
                      reviewSnapshotDetails,
                      `Validation gate summary: ${validationSummary}`,
                      '',
                      'Protocol errors from the prior response:',
                      ...attestationIssues,
                      '',
                      'Return a fresh structured review object. Correct snapshotFingerprint and reviewedFiles directly; do not ask repair-editor to change source code for these protocol errors.',
                    ].join('\n'),
                  },
                ],
              },
            } as any
            reviewerToolResult =
              (retryReview as any) && (retryReview as any).toolResult
            attestationIssues = collectReviewerAttestationIssues(
              reviewerToolResult,
              reviewSnapshotFingerprint,
              Array.from(pendingGateFiles),
            )
          }
          if (attestationIssues.length > 0) {
            // Skip-and-continue instead of break: record the skip reason, move
            // to finalization, and clear the blocking state so the gate does
            // not re-block. Mark the pending files as gate-passed and open the
            // final-response gate so the loop terminates instead of re-detecting
            // the still-modified files and re-entering the gate forever. The
            // re-entry guard above short-circuits the reviewer spawn on any
            // subsequent iteration (the retry count is already exhausted).
            for (const file of pendingGateFiles) gatePassedFiles.add(file)
            activeWorkState.gatePassedFiles = Array.from(gatePassedFiles)
            activeWorkState.openReviewerFindings = []
            activeWorkState.latestWorkSummary =
              'Reviewer protocol failed after one automatic retry; no source repair was attempted.'
            activeWorkState.lastReviewerGateSkipReason =
              'reviewer-protocol-attestation-failed'
            activeWorkState.currentPhase = 'final_response_allowed'
            activeWorkState.pendingGateFiles = []
            pendingGateFiles.clear()
            activeWorkState.openReviewerBlockers = []
            activeWorkState.nextRequiredAction = ''
            editsHappened = false
            finalResponseGateOpen = true
            mutableAgentState.canSuggestFollowups = true
            markActiveWorkStateChanged()
            yield {
              toolName: 'add_message',
              input: {
                role: 'user',
                content: [
                  `Reviewer gate: ${reviewerAgentType} failed snapshot/file attestation twice.`,
                  '',
                  ...attestationIssues,
                  '',
                  'This is a reviewer protocol/configuration failure, not a source-code finding. The harness did not spawn repair-editor. Stop retrying automatically; ask the user to fix reviewer configuration or explicitly say "bypass reviewer gate".',
                ].join('\n'),
              },
              includeToolCall: false,
            } as any
            continue
          }
          activeWorkState.reviewerProtocolRetryCount = 0
          const blockers = collectReviewerBlockers(reviewerToolResult)
          if (blockers.length > 0) {
            activeWorkState.reviewerRepairRoundCount = Number(
              activeWorkState.reviewerRepairRoundCount ?? 0,
            ) + 1
            activeWorkState.openReviewerBlockers = blockers
            activeWorkState.openReviewerFindings = blockers.map(
              (text: string, index: number) => ({
                id: buildReviewerFindingId(text, index),
                gateId: reviewSnapshotFingerprint,
                text,
                status: 'open' as const,
                files: Array.from(pendingGateFiles),
                snapshotFingerprint: reviewSnapshotFingerprint,
                createdAt: new Date().toISOString(),
              }),
            )
            activeWorkState.nextRequiredAction =
              'Resolve the reviewer feedback below before any unrelated work, final response, or another review.'
            activeWorkState.currentPhase = 'blocked'
            activeWorkState.latestWorkSummary = `Reviewer feedback is open for pending files: ${Array.from(pendingGateFiles).join(', ') || '(unknown files)'}`
            markActiveWorkStateChanged()
            yield {
              toolName: 'add_message',
              input: {
                role: 'user',
                content: [
                  `Reviewer gate: ${reviewerAgentType} returned blocking feedback. The harness will send these exact findings to repair-editor:`,
                  '',
                  ...blockers,
                  '',
                  'These findings remain open until targeted validation and a fresh matching reviewer pass clear them.',
                ].join('\n'),
              },
              includeToolCall: false,
            } as any
            const reviewerRepairSessionId =
              activeWorkState.repairSessionId ??
              `review-repair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            activeWorkState.repairSessionId = reviewerRepairSessionId
            activeWorkState.currentPhase = 'repair_loop'
            activeWorkState.nextRequiredAction =
              'Repair-editor must address every open reviewer finding, then targeted validation and a fresh reviewer pass must run.'
            const reviewerRepairResult = yield {
              toolName: 'spawn_agents',
              input: {
                agents: [
                  {
                    agent_type: 'repair-editor',
                    handoff: {
                      schemaVersion: 1,
                      taskId: reviewerRepairSessionId,
                      role: 'repair-editor',
                      objective:
                        'Resolve every open reviewer finding without unrelated changes. Read the current file contents before editing; conversational summaries are not source evidence.',
                      requirements: activeWorkState.openReviewerFindings.map(
                        ({ id, text }) => ({ id, text, required: true }),
                      ),
                      acceptanceCriteria:
                        activeWorkState.openReviewerFindings.map(({ id }) => ({
                          id: `clear-${id}`,
                          behavior: `Finding ${id} is addressed in the live workspace.`,
                          verification:
                            'Targeted validation passes and a fresh snapshot-bound reviewer clears the finding.',
                        })),
                      context: [],
                      invariants: [
                        'Read every target from the live filesystem before editing.',
                        'Treat every finding ID as open until a fresh reviewer clears it.',
                      ],
                      nonGoals: [
                        'Unrelated diagnostics, refactors, or cleanup.',
                      ],
                      risks: [
                        'Reviewer findings may be stale if the workspace snapshot changed.',
                      ],
                      unknowns: [],
                      findings: activeWorkState.openReviewerFindings.map(
                        ({ id, text, files, snapshotFingerprint }) => ({
                          id,
                          text,
                          files,
                          snapshotFingerprint,
                        }),
                      ),
                      permissions: {
                        readablePaths: repairEditorReadablePaths([
                          ...pendingGateFiles,
                          ...activeWorkState.openReviewerFindings.flatMap(
                            (finding: { files?: string[] }) =>
                              finding.files ?? [],
                          ),
                        ]),
                        writablePaths: Array.from(
                          new Set([
                            ...pendingGateFiles,
                            ...activeWorkState.openReviewerFindings.flatMap(
                              (finding: { files?: string[] }) =>
                                finding.files ?? [],
                            ),
                          ]),
                        ),
                        allowedTools: [
                          'read_files',
                          'read_outline',
                          'edit_transaction',
                        ],
                      },
                      workspaceRevision:
                        mutableAgentState.workspaceState?.revision,
                      workspaceSnapshotId:
                        mutableAgentState.workspaceState?.snapshotId,
                      artifacts: [],
                      successCriteria: [
                        'All finding IDs are cleared by a fresh reviewer receipt.',
                      ],
                      constraints: [
                        'Keep every edit within the pending gate file set.',
                      ],
                    },
                    prompt: [
                      'Repair the blocking reviewer findings below.',
                      'Treat every finding ID as open until a fresh reviewer clears it.',
                      'Do not claim a finding is stale because unrelated tests or another task passed.',
                      'Read every target from the live filesystem before editing.',
                      'Keep unrelated diagnostics secondary to this finding set.',
                      '',
                      ...activeWorkState.openReviewerFindings.map(
                        (finding) => `${finding.id}: ${finding.text}`,
                      ),
                    ].join('\n'),
                  },
                ],
              },
            } as any
            const repairCrash = detectReviewerCrash(
              (reviewerRepairResult as any)?.toolResult ?? reviewerRepairResult,
            )
            if (repairCrash) {
              activeWorkState.currentPhase = 'blocked'
              activeWorkState.nextRequiredAction =
                'Repair-editor failed while addressing reviewer findings. Inspect the failure before retrying.'
              activeWorkState.latestWorkSummary = `Repair-editor failed: ${repairCrash}`
              markActiveWorkStateChanged()
              break
            }
            const reviewerRepairReceipt = extractAgentReceipt(
              (reviewerRepairResult as any)?.toolResult ?? reviewerRepairResult,
            )
            const openFindingIds = new Set(
              (activeWorkState.openReviewerFindings ?? []).map(
                (finding) => finding.id,
              ),
            )
            if (
              !reviewerRepairReceipt ||
              reviewerRepairReceipt.status !== 'completed' ||
              [...openFindingIds].some(
                (id) => !reviewerRepairReceipt.findingsAddressed.includes(id),
              )
            ) {
              activeWorkState.currentPhase = 'blocked'
              activeWorkState.nextRequiredAction =
                'Repair-editor did not return a completed receipt addressing every open reviewer finding.'
              activeWorkState.latestWorkSummary =
                'Reviewer repair receipt was incomplete or missing.'
              markActiveWorkStateChanged()
              break
            }
            const reviewerRepairStatus = yield {
              toolName: 'git_status',
              input: {},
            } as any
            const reviewerRepairFiles = extractGitStatusFiles(
              (reviewerRepairStatus as any)?.toolResult,
            ).filter((file: string) => pendingGateFiles.has(file))
            if (reviewerRepairFiles.length > 0) {
              recordChangedFiles(reviewerRepairFiles, { fromRepair: true })
            }
            const repairedStatusLineMap = extractGitStatusLineMap(
              (reviewerRepairStatus as any)?.toolResult,
            )
            const repairedSnapshotFingerprint = hashGateSnapshotDetails(
              buildGateSnapshotDetails(
                Array.from(pendingGateFiles),
                repairedStatusLineMap,
                validationSummary,
              ),
            )
            if (repairedSnapshotFingerprint === reviewSnapshotFingerprint) {
              activeWorkState.currentPhase = 'blocked'
              activeWorkState.nextRequiredAction =
                'Repair-editor made no snapshot-visible progress on the reviewer findings. Stop retrying and inspect the finding or handoff.'
              activeWorkState.latestWorkSummary =
                'Reviewer repair produced no workspace fingerprint change.'
              markActiveWorkStateChanged()
              break
            }
            const reVerify = yield {
              toolName: 'run_file_change_hooks',
              input: { files: Array.from(pendingGateFiles) },
            } as any
            const reFailures = collectHookFailures(
              (reVerify as any) && (reVerify as any).toolResult,
            )
            if (reFailures.length === 0) {
              validationSummary = summarizeHookResults(
                (reVerify as any) && (reVerify as any).toolResult,
              )
              activeWorkState.lastValidationSummary = validationSummary
              activeWorkState.currentPhase = 'awaiting_review'
              activeWorkState.nextRequiredAction = ''
              activeWorkState.latestWorkSummary =
                'Repair-editor addressed reviewer findings; validation re-ran inline and a fresh reviewer pass is required.'
              markActiveWorkStateChanged()
              emitGateTelemetry({
                currentPhase: 'awaiting_review',
                pendingFileCount: pendingGateFiles.size,
                pendingFiles: Array.from(pendingGateFiles),
                validationStatus: 'passed',
                reuseReason: 'reviewer-repair-succeeded',
              })
              continue
            } else {
              activeWorkState.nextRequiredAction =
                'Fix the remaining validation hook failures before doing anything else.'
              activeWorkState.lastReviewerGateSkipReason =
                'validation-hook-failures'
              activeWorkState.currentPhase = 'blocked'
              activeWorkState.latestWorkSummary = `Repair-editor addressed reviewer findings but ${reFailures.length} validation failure(s) remain.`
              markActiveWorkStateChanged()
              emitGateTelemetry({
                currentPhase: 'blocked',
                pendingFileCount: pendingGateFiles.size,
                pendingFiles: Array.from(pendingGateFiles),
                validationStatus: 'failed',
                blockerCount: reFailures.length,
                skipReason: 'reviewer-repair-validation-failed',
              })
              yield {
                toolName: 'add_message',
                input: {
                  role: 'user',
                  content: [
                    `Repair-editor addressed the reviewer findings but ${reFailures.length} validation failure(s) remain. Fix these before ending your turn:`,
                    '',
                    ...reFailures,
                    '',
                    'Read the exact failing locations, make minimal targeted fixes, then finish (the hooks will re-run).',
                    formatGateStateBlock(
                      'validation',
                      'failed',
                      `reviewer-repair-validation-failed: ${reFailures.length} failure(s) remain for pending files: ${Array.from(pendingGateFiles).join(', ') || '(unknown files)'}`,
                    ),
                  ].join('\n'),
                },
                includeToolCall: false,
              } as any
              continue
            }
          }
          reviewerFinalizationVerdict =
            getReviewerFinalizationVerdict(reviewerToolResult)
          if (reviewerFinalizationVerdict) {
            recordSuccessfulReviewReceipt(
              reviewerToolResult,
              reviewerAgentType,
              reviewSnapshotFingerprint,
            )
          }
          if (!reviewerFinalizationVerdict) {
            // Distinguish a reviewer CRASH (agent itself errored / produced no
            // output) from a reviewer that ran successfully but failed to
            // populate its required structured output. The
            // operator-facing message differs because the recovery action
            // differs: a crash means "retry or escalate; the verdict is
            // unknown" whereas a no-verdict means "re-prompt for the
            // contract; the reviewer ran fine, it just used the wrong
            // format". Conflating them caused reviewer-loop bugs where the
            // model kept retrying the same prompt against a crashing agent.
            const reviewerCrash = detectReviewerCrash(reviewerToolResult)
            activeWorkState.currentPhase = 'blocked'
            if (reviewerCrash) {
              activeWorkState.reviewerCrashCount =
                (activeWorkState.reviewerCrashCount ?? 0) + 1
              const bypassAuthorized =
                activeWorkState.reviewerCrashCount > 1 &&
                hasReviewerBypassAuthorization(
                  currentConversationMessages,
                  activeWorkState.reviewerBypassChallenge,
                  reviewSnapshotFingerprint,
                )
              if (bypassAuthorized) {
                activeWorkState.reviewerGateBypassReason = `User authorized bypass after ${activeWorkState.reviewerCrashCount} reviewer crashes: ${reviewerCrash}`
                activeWorkState.reviewerGateBypassRecord = {
                  reason: activeWorkState.reviewerGateBypassReason,
                  authorizedAt: new Date().toISOString(),
                  pendingFiles: Array.from(pendingGateFiles),
                  fingerprint: reviewSnapshotFingerprint,
                  validationSummary,
                }
                if (activeWorkState.reviewerBypassChallenge) {
                  activeWorkState.reviewerBypassChallenge.consumed = true
                }
                activeWorkState.nextRequiredAction = ''
                activeWorkState.currentPhase = 'awaiting_review'
                reviewerFinalizationVerdict = 'NON_BLOCKING'
                markActiveWorkStateChanged()
                emitGateTelemetry({
                  currentPhase: 'awaiting_review',
                  pendingFileCount: pendingGateFiles.size,
                  pendingFiles: Array.from(pendingGateFiles),
                  reviewerStatus: 'skipped',
                  validationStatus: 'passed',
                  skipReason: 'user-authorized-reviewer-crash-bypass',
                })
              } else {
                const challenge =
                  activeWorkState.reviewerCrashCount > 1
                    ? ensureReviewerBypassChallenge(
                        reviewSnapshotFingerprint,
                        currentConversationMessages,
                      )
                    : undefined
                activeWorkState.nextRequiredAction =
                  activeWorkState.reviewerCrashCount === 1
                    ? 'Retry the reviewer gate once. If it crashes again, ask the user whether to bypass the reviewer with the validation result recorded.'
                    : `Reviewer crashed repeatedly. Ask the user explicitly whether to reply "BYPASS REVIEWER ${challenge?.id}" for this snapshot; do not retry again without new configuration.`
                markActiveWorkStateChanged()
                yield {
                  toolName: 'add_message',
                  input: {
                    role: 'user',
                    content: [
                      `Reviewer gate: ${reviewerAgentType} CRASHED (attempt ${activeWorkState.reviewerCrashCount}).`,
                      '',
                      `Crash detail: ${reviewerCrash}`,
                      '',
                      activeWorkState.reviewerCrashCount === 1
                        ? 'Retry this reviewer once. Do not silently loop.'
                        : `Do not retry again. Ask the user whether to bypass the reviewer gate based on the completed validation evidence. The bypass is accepted only after the exact response "BYPASS REVIEWER ${challenge?.id}".`,
                    ].join('\n'),
                  },
                  includeToolCall: false,
                } as any
                activeWorkState.staticReviewerJobId = undefined
                continue
              }
            } else {
              activeWorkState.reviewerNoVerdictCount =
                (activeWorkState.reviewerNoVerdictCount ?? 0) + 1
              if (
                activeWorkState.reviewerNoVerdictCount >
                MAX_REVIEWER_NO_VERDICT_RETRIES
              ) {
                activeWorkState.nextRequiredAction =
                  'Reviewer repeatedly violated its structured output contract. Fix reviewer configuration before retrying.'
                activeWorkState.latestWorkSummary =
                  'Reviewer no-verdict retry budget exhausted.'
                markActiveWorkStateChanged()
                break
              }
              activeWorkState.nextRequiredAction =
                'Retry the automated reviewer gate; reviewer did not populate its required structured output.'
              markActiveWorkStateChanged()
              yield {
                toolName: 'add_message',
                input: {
                  role: 'user',
                  content: [
                    `Reviewer gate: ${reviewerAgentType} ran but returned no structured output. The verdict is unavailable.`,
                    '',
                    'Do not manually re-spawn the reviewer or ask it for a textual label. Continue the gate loop so the automated reviewer retries with its declared output schema; it must call set_output and populate verdict, findings, coverage, dimensions, requirementCoverage, snapshotFingerprint, and reviewedFiles.',
                  ].join('\n'),
                },
                includeToolCall: false,
              } as any
            }
            if (!reviewerFinalizationVerdict) {
              activeWorkState.staticReviewerJobId = undefined
              continue
            }
          }
        }

        if (runValidationGate) {
          const passedPendingFiles = Array.from(pendingGateFiles)
          if (passedPendingFiles.length > 0 && reviewerFinalizationVerdict) {
            const finalReviewedFingerprint = hashGateSnapshotDetails(
              buildGateSnapshotDetails(
                passedPendingFiles,
                currentGitStatusLineMap,
                '',
              ),
            )
            if (finalReviewedFingerprint !== reviewSnapshotFingerprint) {
              activeWorkState.currentPhase = 'awaiting_validation'
              activeWorkState.latestWorkSummary =
                'The reviewed files changed after the reviewer snapshot; validation and review were reopened.'
              activeWorkState.nextRequiredAction =
                'Re-run validation and review against the current file bytes.'
              markActiveWorkStateChanged()
              continue
            }
          }
          let activeWorkStateChanged = false
          if (passedPendingFiles.length > 0 && reviewerFinalizationVerdict) {
            activeWorkState.openReviewerBlockers = []
            activeWorkState.openReviewerFindings = []
            pendingGateFiles.clear()
            activeWorkState.pendingGateFiles = []
            activeWorkState.latestWorkSummary = ''
            editsHappened = false
            for (const file of passedPendingFiles) {
              gatePassedFiles.add(file)
            }
            activeWorkState.gatePassedFiles = Array.from(gatePassedFiles)
            activeWorkState.gatePassedPendingFiles = passedPendingFiles
            activeWorkState.gatePassedReviewerVerdict =
              reviewerFinalizationVerdict
            activeWorkState.gatePassedValidationSummary = validationSummary
            activeWorkState.gatePassedFingerprint = buildGateFingerprint(
              passedPendingFiles,
              currentGitStatusLineMap,
              validationSummary,
            )
            activeWorkState.lastReviewerGateSkipReason = ''
            activeWorkState.repairRoundCount = 0
            activeWorkState.repairSessionId = undefined
            activeWorkState.repairEscalationDone = undefined
            activeWorkState.validationInfrastructureBypassFingerprint =
              undefined
            activeWorkState.staticReviewerJobId = undefined
            activeWorkState.preEditSecurityReviewDone = false
            activeWorkState.securityReviewGateDone = false
            activeWorkState.reviewerCrashCount = 0
            activeWorkState.reviewerProtocolRetryCount = 0
            activeWorkState.reviewerRepairRoundCount = 0
            activeWorkState.reviewerNoVerdictCount = 0
            activeWorkState.reviewerBypassChallenge = undefined
            activeWorkState.reviewerGateBypassReason = ''
            activeWorkState.testWriterGateDone = false
            activeWorkState.docWriterGateDone = false
            activeWorkState.auxGatesLastPendingFiles = []
            activeWorkStateChanged = true
          }
          if (activeWorkState.nextRequiredAction) {
            activeWorkState.nextRequiredAction = ''
            activeWorkStateChanged = true
          }
          if (activeWorkState.currentPhase !== 'final_response_allowed') {
            activeWorkState.currentPhase = 'final_response_allowed'
            activeWorkStateChanged = true
          }
          if (activeWorkStateChanged) {
            markActiveWorkStateChanged()
          }
          gatePassedForCurrentEdits = passedPendingFiles.length > 0
          finalResponseGateOpen = true
          mutableAgentState.canSuggestFollowups = true
          const validationHooksSkipped =
            validationSummary === 'No configured file-change hooks ran.' ||
            validationSummary ===
              'Configured file-change hooks were skipped because none matched the changed files.'
          const passVerdict = reviewerFinalizationVerdict || 'LOOKS_GOOD'
          const passDetails =
            passedPendingFiles.length > 0
              ? `reviewer verdict ${passVerdict}; ${validationHooksSkipped ? validationSummary : 'validation hooks ran'}; pending files: ${passedPendingFiles.join(', ')}`
              : `no edited files were detected; reviewer verdict ${passVerdict || 'n/a'}; hooks ran=${!validationHooksSkipped}`
          emitGateTelemetry({
            currentPhase: 'final_response_allowed',
            pendingFileCount: passedPendingFiles.length,
            pendingFiles: passedPendingFiles,
            reviewerStatus:
              passedPendingFiles.length > 0 ? 'passed' : 'skipped',
            validationStatus: validationHooksSkipped ? 'skipped' : 'passed',
            reviewerVerdict: passVerdict,
            hooksRan: !validationHooksSkipped,
          })
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content: [
                passedPendingFiles.length > 0
                  ? validationHooksSkipped
                    ? `Reviewer gate passed with ${passVerdict} for pending files: ${passedPendingFiles.join(', ')}. ${validationSummary}`
                    : `Automated validation and reviewer gate passed with ${passVerdict} for pending files: ${passedPendingFiles.join(', ')}.`
                  : 'No edited files were detected.',
                passedPendingFiles.length > 0
                  ? 'The preceding Change review diff is the user-visible filesystem evidence for this gate. Use /diff for the full current working-tree diff, /changes for the file list, or /diff -- <path> to inspect one file.'
                  : '',
                'You may now provide the final user-visible summary and optional follow-up suggestions. Do not make more edits unless absolutely necessary; any new edits will rerun the gate.',
                formatGateStateBlock(
                  'validation/reviewer',
                  'passed',
                  passDetails,
                ),
              ].join('\n'),
            },
            includeToolCall: false,
          } as any
          if (passedPendingFiles.length > 0) {
            yield {
              toolName: 'git_status',
              input: {
                include_diff: true,
                max_chars: 80_000,
              },
            } as any
          }
          // NOTE: the three aux gates (test-writer / doc-writer /
          // security-reviewer) now run pre-reviewer above, before this final
          // validation+code-reviewer gate. Code-reviewer is the final gate.
          // The pre-reviewer aux spawns write aux-output files (tests, docs),
          // which the next loop iteration re-reads into pendingGateFiles so
          // this final gate also covers their changes — desirable, so the
          // final reviewer covers the full set of edits. (The old R1b/R1c
          // post-gate test-writer + doc-writer spawns have been moved above
          // and subsumed into the unified pre-reviewer aux block.)
          //
          // (Previously here: the full R1b test-writer + R1c doc-writer
          // post-gate blocks, which ran AFTER the gate passed. Removed.)
          continue
        }
        if (editsHappened) {
          activeWorkState.lastReviewerGateSkipReason =
            'validation-and-reviewer-gates-disabled'
          markActiveWorkStateChanged()
          emitGateTelemetry({
            currentPhase: activeWorkState.currentPhase,
            pendingFileCount: pendingGateFiles.size,
            pendingFiles: Array.from(pendingGateFiles),
            reviewerStatus: 'skipped',
            validationStatus: 'skipped',
            skipReason: 'validation-and-reviewer-gates-disabled',
          })
          yield {
            toolName: 'add_message',
            input: {
              role: 'user',
              content: [
                'Validation and reviewer gates are disabled for this agent mode; skipping automated gate checks even though edits were detected.',
                `Pending edited files: ${Array.from(pendingGateFiles).join(', ') || '(unknown files)'}`,
                formatGateStateBlock(
                  'validation/reviewer',
                  'skipped',
                  `validation-and-reviewer-gates-disabled: skipped automated gate checks for pending files: ${Array.from(pendingGateFiles).join(', ') || '(unknown files)'}`,
                ),
              ].join('\n'),
            },
            includeToolCall: false,
          } as any
        }
        break
      }
      function markActiveWorkStateChanged(): void {
        activeWorkState.lastPinnedStateMessage = ''
      }

      // Inline helpers for gate-state telemetry/diagnostics. Kept inside
      // handleSteps because handleSteps is serialized via .toString() and
      // reconstructed with new Function(...), so module-scope closures are
      // not available at reconstruction time. Keep these deterministic and
      // single-line so the CLI can promote them into GateStateBox blocks.
      function formatGateStateBlock(
        gate: 'validation' | 'reviewer' | 'validation/reviewer',
        status: 'passed' | 'failed' | 'skipped',
        details: string,
        repairRound?: number,
      ): string {
        const normalizedDetails = String(details ?? '')
          .replace(/\s+/g, ' ')
          .trim()
        const payload: {
          gate: string
          status: string
          details: string
          repairRound?: number
          maxRepairRounds?: number
        } = { gate, status, details: normalizedDetails }
        if (
          typeof repairRound === 'number' &&
          Number.isFinite(repairRound) &&
          repairRound >= 0
        ) {
          payload.repairRound = repairRound
          payload.maxRepairRounds = MAX_REPAIR_ROUNDS
        }
        return `<gate-state>${JSON.stringify(payload)}</gate-state>`
      }

      function emitGateTelemetry(payload: Record<string, unknown>): void {
        try {
          const phase = payload.currentPhase
          const transition = (params as any)?.orchestrationControlPlane
            ?.transitionBase2Gate
          if (typeof phase === 'string' && typeof transition === 'function') {
            mutableAgentState.workflowStates ??= {}
            mutableAgentState.workflowStates['base2-gate-v1'] = transition({
              current: mutableAgentState.workflowStates['base2-gate-v1'],
              phase,
            })
          }
          if (
            typeof console !== 'object' ||
            console === null ||
            typeof (console as { info?: unknown }).info !== 'function'
          ) {
            return
          }
          const safePayload: Record<string, unknown> = { event: 'base2.gate' }
          for (const [key, value] of Object.entries(payload)) {
            if (value === undefined) continue
            safePayload[key] = value
          }
          ;(console as { info: (...args: unknown[]) => void }).info(
            JSON.stringify(safePayload),
          )
        } catch {
          // Telemetry must never throw or block the loop.
        }
      }

      function inferActiveWorkPhase(
        state: Base2ActiveWorkState,
      ): Base2ActiveWorkPhase {
        if (
          state.openReviewerBlockers.length > 0 ||
          state.nextRequiredAction.trim().length > 0
        ) {
          return 'blocked'
        }
        if (state.pendingGateFiles.length > 0) return 'awaiting_validation'
        return 'idle'
      }

      function recordChangedFiles(
        files: string[],
        opts?: { fromRepair?: boolean; fromStatusObservation?: boolean },
      ): void {
        const normalizedFiles = normalizeGateFileList(files)
        let discoveredNewPendingFile = false
        for (const file of normalizedFiles) {
          if (!pendingGateFiles.has(file)) discoveredNewPendingFile = true
          changedFiles.add(file)
          pendingGateFiles.add(file)
          gatePassedFiles.delete(file)
          activeWorkState.gatePassedFiles =
            activeWorkState.gatePassedFiles.filter(
              (passedFile) => passedFile !== file,
            )
          if (activeWorkState.gatePassedPendingFiles.includes(file)) {
            activeWorkState.gatePassedPendingFiles = []
            activeWorkState.gatePassedReviewerVerdict = ''
            activeWorkState.gatePassedValidationSummary = ''
            activeWorkState.gatePassedFingerprint = ''
          }
          if (!activeWorkState.touchedFiles.includes(file)) {
            activeWorkState.touchedFiles.push(file)
          }
          if (!activeWorkState.changedFiles.includes(file)) {
            activeWorkState.changedFiles.push(file)
          }
          if (!activeWorkState.pendingGateFiles.includes(file)) {
            activeWorkState.pendingGateFiles.push(file)
          }
        }
        if (
          normalizedFiles.length > 0 &&
          (!opts?.fromStatusObservation || discoveredNewPendingFile)
        ) {
          // Completion is content-scoped, not path-scoped. A fresh edit to an
          // already-reviewed path must rerun specialist gates. A repeated
          // git_status observation is not fresh edit evidence, so it must not
          // clear a specialist receipt and create an infinite review loop.
          activeWorkState.specialistReviewGatesDone = []
          activeWorkState.lastReviewerGateSkipReason = ''
          activeWorkState.reviewerProtocolRetryCount = 0
          activeWorkState.reviewerNoVerdictCount = 0
          activeWorkState.currentPhase = 'awaiting_validation'
          if (!opts?.fromRepair && !activeWorkState.repairSessionId) {
            activeWorkState.repairRoundCount = 0
          }
        }
      }

      // Mirrors of `agents/base2/gate-paths.ts`. Kept inline because
      // `handleSteps` is serialized via `toString()` + `new Function(...)`
      // and cannot reference module-scope imports at reconstruction time.
      function normalizeGateFilePath(file: string): string {
        let normalized = file.trim().replace(/\\/g, '/')
        if (!normalized) return ''
        // Reject path traversal: a gate file path must stay inside the project.
        // Any `..` segment (posix or windows, since backslashes were
        // normalized to forward slashes above) is rejected before
        // normalization so it can't be used to point the gate at files outside
        // the cwd.
        if (normalized.split('/').includes('..')) {
          return ''
        }
        if (normalized.startsWith('file://')) {
          normalized = normalized.slice('file://'.length)
        }
        if (/^\/[A-Za-z]:\//.test(normalized)) {
          normalized = normalized.slice(1)
        }
        const cwd =
          typeof process === 'object' &&
          process !== null &&
          typeof process.cwd === 'function'
            ? process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')
            : ''
        const isAbsolute =
          normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
        if (
          isAbsolute &&
          (!cwd || (normalized !== cwd && !normalized.startsWith(`${cwd}/`)))
        ) {
          return ''
        }
        if (cwd && (normalized === cwd || normalized.startsWith(`${cwd}/`))) {
          normalized = normalized.slice(cwd.length).replace(/^\/+/, '')
        }
        while (normalized.startsWith('./')) {
          normalized = normalized.slice(2)
        }
        return normalized.trim()
      }

      function normalizeGateFileList(files: string[]): string[] {
        const normalizedFiles: string[] = []
        const seen = new Set<string>()
        for (const file of files) {
          const normalized = normalizeGateFilePath(file)
          if (!normalized || seen.has(normalized)) continue
          seen.add(normalized)
          normalizedFiles.push(normalized)
        }
        return normalizedFiles
      }

      function reviewChallengeFingerprint(
        files: string[],
        statusLineMap: Map<string, string>,
      ): string {
        return hashGateSnapshotDetails(
          buildGateSnapshotDetails(files, statusLineMap, ''),
        )
      }

      function ensureReviewerBypassChallenge(
        fingerprint: string,
        messages: unknown,
      ): {
        id: string
        fingerprint: string
        issuedAfterMessageIndex: number
        consumed: boolean
      } {
        const existing = activeWorkState.reviewerBypassChallenge
        if (
          existing &&
          existing.fingerprint === fingerprint &&
          !existing.consumed
        ) {
          return existing
        }
        const challenge = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          fingerprint,
          issuedAfterMessageIndex: Array.isArray(messages)
            ? messages.length
            : 0,
          consumed: false,
        }
        activeWorkState.reviewerBypassChallenge = challenge
        return challenge
      }

      function hasReviewerBypassAuthorization(
        messages: unknown,
        challenge:
          | {
              id: string
              fingerprint: string
              issuedAfterMessageIndex: number
              consumed: boolean
            }
          | undefined,
        currentFingerprint: string,
      ): boolean {
        if (
          !Array.isArray(messages) ||
          !challenge ||
          challenge.consumed ||
          challenge.fingerprint !== currentFingerprint
        ) {
          return false
        }
        const expected = `BYPASS REVIEWER ${challenge.id}`
        for (
          let index = challenge.issuedAfterMessageIndex;
          index < messages.length;
          index++
        ) {
          const message = messages[index]
          if (!message || typeof message !== 'object') continue
          const record = message as Record<string, unknown>
          if (record.role !== 'user') continue
          const texts: string[] = []
          const collect = (value: unknown): void => {
            if (typeof value === 'string') {
              texts.push(value)
              return
            }
            if (Array.isArray(value)) {
              for (const item of value) collect(item)
              return
            }
            if (value && typeof value === 'object') {
              const nested = value as Record<string, unknown>
              collect(nested.text)
              collect(nested.content)
            }
          }
          collect(record.content)
          if (texts.some((text) => text.trim() === expected)) {
            return true
          }
        }
        return false
      }

      function gateFileSetsEqual(left: string[], right: string[]): boolean {
        if (left.length !== right.length) return false
        const rightFiles = new Set(right)
        return left.every((file) => rightFiles.has(file))
      }

      function matchesSecuritySensitiveGlob(files: string[]): boolean {
        if (!files.length) return false
        for (const file of files) {
          const normalized = normalizeGateFilePath(file)
          if (!normalized) continue
          const segments = normalized.split('/')
          const basename = segments[segments.length - 1] || ''
          const lowerBase = basename.toLowerCase()
          // .env files at any depth.
          if (basename.startsWith('.env')) {
            return true
          }
          for (const name of SECURITY_SENSITIVE_NAME_SUBSTRINGS) {
            if (lowerBase.includes(name)) {
              return true
            }
          }
          // Directory segment matches (any path segment equals a sensitive dir).
          for (const segment of segments) {
            const lower = segment.toLowerCase()
            if (SECURITY_SENSITIVE_GLOBS.includes(lower)) {
              return true
            }
          }
        }
        return false
      }

      function inferPackageTestCommand(filePath: string): string | null {
        // Prefer known monorepo-local commands, then fall back by ecosystem so
        // ordinary user projects are not silently skipped.
        const pkgMatch = filePath.match(
          /^packages\/([^/]+)\/(?:src|__tests__)\//,
        )
        if (pkgMatch) {
          return `cd packages/${pkgMatch[1]} && bun run typecheck && bun test`
        }
        if (
          filePath.startsWith('agents/') &&
          !filePath.startsWith('agents/__tests__/')
        ) {
          return 'cd agents && bun run typecheck && bun test'
        }
        if (filePath.startsWith('common/src/')) {
          return 'cd common && bun run typecheck && bun test'
        }
        if (filePath.startsWith('cli/src/')) {
          return 'cd cli && bun run typecheck && bun test'
        }
        if (/\.pyi?$/.test(filePath)) return 'pytest'
        if (/\.go$/.test(filePath)) return 'go test ./...'
        if (/\.rs$/.test(filePath)) return 'cargo test'
        if (/\.(java|kt|kts)$/.test(filePath)) return './gradlew test'
        if (/\.(cs|fs|vb)$/.test(filePath)) return 'dotnet test'
        if (/\.(tsx?|jsx?|mjs|cjs)$/.test(filePath)) return 'bun test'
        return null
      }

      function isNonTestSourceFile(filePath: string): boolean {
        if (/__tests__\//.test(filePath)) return false
        if (/\.(test|spec)\.tsx?$/.test(filePath)) return false
        if (/\.generated\.tsx?$/.test(filePath)) return false
        if (/\.(md|json|mdx)$/.test(filePath)) return false
        if (/\.(yml|yaml|toml)$/.test(filePath)) return false
        if (/^\.env($|\.)/.test(filePath)) return false
        if (filePath.startsWith('docs/')) return false
        if (filePath.startsWith('evals/') || filePath.startsWith('.agents/')) {
          return false
        }
        return /\.(?:tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|kts|cs|fs|vb)$/.test(
          filePath,
        )
      }

      function selectTestWriterTargets(files: string[]): {
        groups: Array<{
          targetFiles: string[]
          testCommand: string
          candidateTests: string[]
          manifest?: string
          packageRoot: string
        }>
      } {
        const targetFiles = files.filter(isNonTestSourceFile)
        if (!targetFiles.length) {
          return { groups: [] }
        }
        const filesByCommand = new Map<string, string[]>()
        for (const file of targetFiles) {
          const testCommand = inferPackageTestCommand(file)
          if (!testCommand) continue
          const group = filesByCommand.get(testCommand) ?? []
          group.push(file)
          filesByCommand.set(testCommand, group)
        }
        return {
          groups: [...filesByCommand.entries()].map(
            ([testCommand, groupedFiles]) => ({
              targetFiles: groupedFiles,
              testCommand,
              candidateTests: [],
              packageRoot: inferWorkspaceRootFromPath(groupedFiles[0]),
            }),
          ),
        }
      }

      function findJsonRecordWithArray(
        value: unknown,
        key: string,
        depth = 0,
      ): Record<string, unknown> | undefined {
        if (!value || depth > 8) return undefined
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = findJsonRecordWithArray(item, key, depth + 1)
            if (found) return found
          }
          return undefined
        }
        if (typeof value !== 'object') return undefined
        const record = value as Record<string, unknown>
        if (Array.isArray(record[key])) return record
        if (record.type === 'json' && 'value' in record) {
          const found = findJsonRecordWithArray(record.value, key, depth + 1)
          if (found) return found
        }
        for (const nested of Object.values(record)) {
          const found = findJsonRecordWithArray(nested, key, depth + 1)
          if (found) return found
        }
        return undefined
      }

      function summarizeWriterEnvironment(value: unknown): string {
        const record = findJsonRecordWithArray(value, 'workspaces')
        if (!record) return ''
        const manager =
          typeof record.packageManager === 'string'
            ? record.packageManager
            : 'mixed/unknown manager'
        const manifests = Array.isArray(record.manifests)
          ? record.manifests.filter(
              (item): item is string => typeof item === 'string',
            )
          : []
        return `${manager}; manifests: ${manifests.slice(0, 12).join(', ') || '(none)'}`
      }

      function selectProjectAwareTestWriterTargets(
        files: string[],
        affectedTestResult: unknown,
        buildTargetResult: unknown,
      ): {
        groups: Array<{
          targetFiles: string[]
          testCommand: string
          candidateTests: string[]
          manifest?: string
          packageRoot: string
        }>
      } {
        const sourceFiles = files.filter(isNonTestSourceFile)
        if (sourceFiles.length === 0) return { groups: [] }
        const affectedRecord = findJsonRecordWithArray(
          affectedTestResult,
          'targets',
        )
        const buildRecord = findJsonRecordWithArray(
          buildTargetResult,
          'targets',
        )
        const affectedTargets = Array.isArray(affectedRecord?.targets)
          ? affectedRecord.targets.filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object',
            )
          : []
        const buildTargets = Array.isArray(buildRecord?.targets)
          ? buildRecord.targets.filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object',
            )
          : []
        const byRoot = new Map<
          string,
          { targetFiles: string[]; candidateTests: string[] }
        >()
        for (const source of sourceFiles) {
          const affected = affectedTargets.find(
            (item) => item.source === source,
          )
          const root =
            typeof affected?.packageRoot === 'string'
              ? affected.packageRoot
              : inferWorkspaceRootFromPath(source)
          const group = byRoot.get(root) ?? {
            targetFiles: [],
            candidateTests: [],
          }
          group.targetFiles.push(source)
          if (Array.isArray(affected?.candidates)) {
            for (const candidate of affected.candidates) {
              if (
                typeof candidate === 'string' &&
                !group.candidateTests.includes(candidate)
              ) {
                group.candidateTests.push(candidate)
              }
            }
          }
          byRoot.set(root, group)
        }
        const groups = [...byRoot.entries()].flatMap(([root, group]) => {
          const build = buildTargets.find((item) => item.packageRoot === root)
          const commands = Array.isArray(build?.commands)
            ? build.commands.filter(
                (item): item is string => typeof item === 'string',
              )
            : []
          const selectedCommand = commands.find((command) =>
            /(?:^|\s)(?:test|pytest)(?:\s|$)/i.test(command),
          )
          const fallbackCommand = inferPackageTestCommand(group.targetFiles[0])
          const command = selectedCommand
            ? root === '.'
              ? selectedCommand
              : `cd ${root} && ${selectedCommand}`
            : fallbackCommand
          if (!command) return []
          return [
            {
              ...group,
              testCommand: command,
              packageRoot: root,
              ...(typeof build?.manifest === 'string'
                ? { manifest: build.manifest }
                : {}),
            },
          ]
        })
        return groups.length > 0 ? { groups } : selectTestWriterTargets(files)
      }

      function inferWorkspaceRootFromPath(filePath: string): string {
        const normalized = normalizeGateFilePath(filePath)
        const segments = normalized.split('/').filter(Boolean)
        if (
          (segments[0] === 'packages' || segments[0] === 'apps') &&
          segments[1]
        ) {
          return `${segments[0]}/${segments[1]}`
        }
        return segments.length > 1 ? segments[0] : '.'
      }

      function testWriterScopePatterns(packageRoot: string): string[] {
        const prefix = packageRoot === '.' ? '' : `${packageRoot}/`
        return [
          `${prefix}**/*.test.*`,
          `${prefix}**/*.spec.*`,
          `${prefix}**/__tests__/**`,
          `${prefix}**/test/**`,
          `${prefix}**/tests/**`,
        ]
      }

      function docWriterScopePatterns(sourceFiles: string[]): string[] {
        const roots = [...new Set(sourceFiles.map(inferWorkspaceRootFromPath))]
        return roots.flatMap((root) => {
          const prefix = root === '.' ? '' : `${root}/`
          return [
            `${prefix}docs/**`,
            `${prefix}README*`,
            `${prefix}**/README*`,
            `${prefix}**/*.md`,
            `${prefix}**/*.mdx`,
          ]
        })
      }

      function repairEditorReadablePaths(_paths: string[]): string[] {
        // Repair agents need project-wide diagnostic visibility to follow
        // imports, generated sources, shared config, and fixtures. Mutation
        // authority remains restricted separately to finding-scoped files.
        return ['*', '**/*']
      }

      function isPublicApiSourceFile(filePath: string): boolean {
        if (/__tests__\//.test(filePath)) return false
        if (/\.(test|spec)\.tsx?$/.test(filePath)) return false
        if (/\.generated\.tsx?$/.test(filePath)) return false
        if (/\.(md|json|mdx|yml|yaml|toml)$/.test(filePath)) return false
        if (filePath.startsWith('docs/')) return false
        if (filePath.startsWith('evals/') || filePath.startsWith('.agents/')) {
          return false
        }
        return /\.(?:tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|kts|cs|fs|vb)$/.test(
          filePath,
        )
      }

      function selectDocWriterTargets(files: string[]): string[] {
        return files.filter(isPublicApiSourceFile)
      }

      // Return the subset of `files` that at least one aux gate predicate
      // (test-writer / doc-writer / security-reviewer) would act on. Used at
      // the handleSteps call site to compare/store the aux-relevant snapshot
      // so aux outputs (test files, doc files) don't perturb the snapshot and
      // trigger an infinite *GateDone reset loop. Self-contained inline
      // helper — no module-scope imports (handleSteps is serialized).
      function selectAuxRelevantFiles(files: string[]): string[] {
        const relevant: string[] = []
        for (const file of files) {
          if (
            isNonTestSourceFile(file) &&
            inferPackageTestCommand(file) !== null
          ) {
            relevant.push(file)
            continue
          }
          if (isPublicApiSourceFile(file)) {
            relevant.push(file)
            continue
          }
          if (matchesSecuritySensitiveGlob([file])) {
            relevant.push(file)
          }
        }
        // Dedupe preserving first-seen order.
        const seen = new Set<string>()
        const out: string[] = []
        for (const file of relevant) {
          if (!seen.has(file)) {
            seen.add(file)
            out.push(file)
          }
        }
        return out
      }

      function detectPendingGateFileSetChange(
        activeWorkState: Base2ActiveWorkState,
        currentFiles: string[],
      ): boolean {
        const last = activeWorkState.auxGatesLastPendingFiles ?? []
        return !gateFileSetsEqual(last, currentFiles)
      }

      function selectSpecialistReviewersInline(input: {
        files: string[]
        requirements: string
      }): string[] {
        const runtimeRouter = (params as any)?.orchestrationControlPlane
          ?.selectSpecialistReviewers
        if (typeof runtimeRouter === 'function') {
          return runtimeRouter(input)
        }
        const files = input.files.map((file) =>
          file.replace(/\\/g, '/').toLowerCase(),
        )
        const requirements = input.requirements.toLowerCase()
        const joined = `${files.join('\n')}\n${requirements}`
        const selected = new Set<string>()
        if (
          files.some((file) =>
            /(?:^|\/)(?:package\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|pyproject\.toml|uv\.lock|poetry\.lock|cargo\.toml|cargo\.lock|go\.mod|go\.sum|gemfile(?:\.lock)?|composer\.(?:json|lock)|pom\.xml|build\.gradle(?:\.kts)?|package\.swift)$/.test(
              file,
            ),
          ) ||
          /\b(?:dependency|dependencies|lockfile|package manager|supply chain|license|vulnerabilit)/.test(
            requirements,
          )
        )
          selected.add('dependency-reviewer')
        if (
          /(?:^|\/)(?:migrations?|schema|database|db)(?:\/|\.)|\.sql$|\b(?:migration|backfill|schema change|database compatibility|rollback)\b/.test(
            joined,
          )
        )
          selected.add('migration-reviewer')
        if (
          /\b(?:public api|backward compat|breaking change|deprecat|serialization|persisted format|config contract|environment variable|cli flag)\b/.test(
            requirements,
          ) ||
          files.some((file) =>
            /(?:^|\/)(?:index|exports?|public-api)\.[^.]+$|(?:^|\/)(?:routes?|config|schemas?|types)\//.test(
              file,
            ),
          )
        )
          selected.add('compatibility-reviewer')
        if (
          /\b(?:race|concurr|retry|retries|cancel|abort|idempoten|deadlock|state machine|resource leak|partial failure)\b/.test(
            requirements,
          ) ||
          files.some((file) =>
            /(?:^|\/)(?:queues?|workers?|jobs?|cache|state|session|process|async|concurrency)(?:\/|\.)/.test(
              file,
            ),
          )
        )
          selected.add('reliability-reviewer')
        if (
          /\b(?:performance|latency|throughput|benchmark|profil|allocation|hot path|load test|complexity)\b/.test(
            requirements,
          ) ||
          files.some((file) => /(?:bench|perf|load-test|profil)/.test(file))
        )
          selected.add('performance-specialist')
        const hasUiFiles = files.some((file) =>
          /(?:^|\/)(?:components?|pages?|views?|screens?|ui|app)(?:\/|\.)|\.(?:tsx|jsx|vue|svelte|css|scss)$/.test(
            file,
          ),
        )
        if (
          hasUiFiles &&
          /\b(?:accessibility|a11y|keyboard|focus|screen reader|aria|contrast|reduced motion)\b/.test(
            requirements,
          )
        )
          selected.add('accessibility-reviewer')
        if (
          hasUiFiles &&
          /\b(?:visual|layout|responsive|design system|spacing|hierarchy|screenshot|viewport|interaction)\b/.test(
            requirements,
          )
        )
          selected.add('ux-visual-reviewer')
        if (
          /\b(?:user-facing|acceptance criteria|product behavior|user flow|end-to-end|ux|onboarding)\b/.test(
            requirements,
          )
        )
          selected.add('product-reviewer')
        if (
          /\b(?:independent evaluat|score against|requirement coverage)\b/.test(
            requirements,
          )
        )
          selected.add('evaluator')
        return [
          'dependency-reviewer',
          'migration-reviewer',
          'compatibility-reviewer',
          'reliability-reviewer',
          'performance-specialist',
          'accessibility-reviewer',
          'ux-visual-reviewer',
          'product-reviewer',
          'evaluator',
        ].filter((agent) => selected.has(agent))
      }

      function extractChangeReviewBundle(value: unknown): {
        snapshotId: string
        errorMessage: string
        files: string[]
      } {
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = extractChangeReviewBundle(item)
            if (found.snapshotId || found.errorMessage) return found
          }
          return { snapshotId: '', errorMessage: '', files: [] }
        }
        if (!value || typeof value !== 'object')
          return { snapshotId: '', errorMessage: '', files: [] }
        const record = value as Record<string, unknown>
        if (record.type === 'json' && 'value' in record)
          return extractChangeReviewBundle(record.value)
        if (typeof record.snapshotId === 'string') {
          const files = Array.isArray(record.files)
            ? record.files.filter(
                (file): file is string => typeof file === 'string',
              )
            : []
          return { snapshotId: record.snapshotId, errorMessage: '', files }
        }
        if (typeof record.errorMessage === 'string')
          return {
            snapshotId: '',
            errorMessage: record.errorMessage,
            files: [],
          }
        if ('toolResult' in record)
          return extractChangeReviewBundle(record.toolResult)
        return { snapshotId: '', errorMessage: '', files: [] }
      }

      function collectReviewerFindingRecordsInline(
        toolResult: unknown,
      ): Array<{ id: string; text: string }> {
        return collectStructuredReviewerOutputs(toolResult).flatMap(
          (entry) => entry.findingRecords ?? [],
        )
      }

      function isStaleSnapshotReviewerResult(toolResult: unknown): boolean {
        const structured = collectStructuredReviewerOutputs(toolResult)
        const result = structured[structured.length - 1]
        return (result?.findingRecords ?? []).some((finding) => {
          const id = finding.id.toLowerCase()
          const text = finding.text.toLowerCase()
          return (
            id.endsWith(':stale-snapshot') ||
            (text.includes('snapshot') &&
              (text.includes('stale') || text.includes('does not match')))
          )
        })
      }

      function recordSuccessfulReviewReceipt(
        toolResult: unknown,
        reviewer: string,
        expectedFingerprint: string,
      ): void {
        const structured = collectStructuredReviewerOutputs(toolResult)
        const result = structured[structured.length - 1]
        if (
          !result ||
          (result.verdict !== 'LOOKS_GOOD' && result.verdict !== 'NON_BLOCKING')
        ) {
          return
        }
        const MAX_RECEIPT_TEXT_LENGTH = 240
        const MAX_RECEIPT_EVIDENCE_ITEMS = 3
        const MAX_RECEIPT_EVIDENCE_LENGTH = 240
        const MAX_SERIALIZED_RECEIPT_LENGTH = 4_000

        function compactReceiptString(
          value: string,
          maxLength: number,
        ): string {
          const normalized = value.replace(/\s+/g, ' ').trim()
          return normalized.length > maxLength
            ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
            : normalized
        }

        function compactReceiptEvidence(values: string[]): {
          evidence: string[]
          evidenceCount: number
          evidenceTruncated?: boolean
        } {
          const evidenceCount = values.filter((value) => value.trim()).length
          const evidence = values
            .filter((value) => value.trim())
            .slice(0, MAX_RECEIPT_EVIDENCE_ITEMS)
            .map((value) =>
              compactReceiptString(value, MAX_RECEIPT_EVIDENCE_LENGTH),
            )
          const evidenceTruncated =
            evidenceCount > evidence.length ||
            values.some(
              (value) =>
                value.replace(/\s+/g, ' ').trim().length >
                MAX_RECEIPT_EVIDENCE_LENGTH,
            )
          return {
            evidence,
            evidenceCount,
            ...(evidenceTruncated ? { evidenceTruncated: true } : {}),
          }
        }

        function fitReceiptToStorageBound(
          receipt: Base2ReviewReceipt,
        ): Base2ReviewReceipt {
          if (JSON.stringify(receipt).length <= MAX_SERIALIZED_RECEIPT_LENGTH) {
            return receipt
          }
          const compacted: Base2ReviewReceipt = {
            ...receipt,
            reviewedFiles: receipt.reviewedFiles
              .slice(0, 4)
              .map((value) => compactReceiptString(value, 180)),
            dimensions: {},
            findings: receipt.findings.slice(0, 2).map((finding) => ({
              ...finding,
              id: compactReceiptString(finding.id, 160),
              text: compactReceiptString(finding.text, 180),
              evidence: finding.evidence
                .slice(0, 1)
                .map((value) => compactReceiptString(value, 180)),
              evidenceTruncated:
                finding.evidenceTruncated || finding.evidence.length > 1,
              ...(finding.correction
                ? {
                    correction: compactReceiptString(finding.correction, 180),
                  }
                : {}),
            })),
            requirementCoverage: receipt.requirementCoverage
              .slice(0, 2)
              .map((coverage) => ({
                ...coverage,
                requirement: compactReceiptString(coverage.requirement, 180),
                evidence: coverage.evidence
                  .slice(0, 1)
                  .map((value) => compactReceiptString(value, 180)),
                evidenceTruncated:
                  coverage.evidenceTruncated || coverage.evidence.length > 1,
              })),
            receiptTruncated: true,
          }
          if (
            JSON.stringify(compacted).length <= MAX_SERIALIZED_RECEIPT_LENGTH
          ) {
            return compacted
          }
          return {
            ...compacted,
            reviewedFiles: [],
            findings: [],
            requirementCoverage: [],
            dimensions: {},
          }
        }

        const gateId = `${reviewer}:${expectedFingerprint}`
        const reviewedFiles = normalizeGateFileList(result.reviewedFiles ?? [])
        const receipt: Base2ReviewReceipt = {
          gateId,
          reviewer,
          verdict: result.verdict,
          snapshotFingerprint:
            result.snapshotFingerprint ?? expectedFingerprint,
          reviewedFiles: reviewedFiles.map((value) =>
            compactReceiptString(value, MAX_RECEIPT_TEXT_LENGTH),
          ),
          reviewedFileCount: reviewedFiles.length,
          ...(result.coverage ? { coverage: result.coverage } : {}),
          dimensions: result.dimensions ?? {},
          findings: (result.findingRecords ?? []).map((finding) => {
            const compactEvidence = compactReceiptEvidence(finding.evidence)
            const correction =
              typeof finding.correction === 'string'
                ? compactReceiptString(
                    finding.correction,
                    MAX_RECEIPT_TEXT_LENGTH,
                  )
                : undefined
            const correctionTruncated =
              typeof finding.correction === 'string' &&
              finding.correction.replace(/\s+/g, ' ').trim().length >
                MAX_RECEIPT_TEXT_LENGTH
            return {
              id: compactReceiptString(finding.id, MAX_RECEIPT_TEXT_LENGTH),
              text: compactReceiptString(finding.text, MAX_RECEIPT_TEXT_LENGTH),
              ...(typeof finding.severity === 'string'
                ? { severity: finding.severity }
                : {}),
              ...(typeof finding.dimension === 'string'
                ? { dimension: finding.dimension }
                : {}),
              ...compactEvidence,
              ...(correction ? { correction } : {}),
              ...(correctionTruncated ? { correctionTruncated: true } : {}),
            }
          }),
          findingCount: (result.findingRecords ?? []).length,
          requirementCoverage: (result.requirementCoverage ?? []).map(
            (coverage) => ({
              requirement: compactReceiptString(
                coverage.requirement,
                MAX_RECEIPT_TEXT_LENGTH,
              ),
              status: coverage.status,
              ...compactReceiptEvidence(coverage.evidence),
            }),
          ),
          requirementCoverageCount: (result.requirementCoverage ?? []).length,
          recordedAt: new Date().toISOString(),
        }
        activeWorkState.reviewReceipts = [
          ...(activeWorkState.reviewReceipts ?? []).filter(
            (existing) => existing.gateId !== gateId,
          ),
          fitReceiptToStorageBound(receipt),
        ].slice(-24)
      }

      function resetAuxGateFlags(
        activeWorkState: Base2ActiveWorkState,
        currentFiles: string[],
      ): void {
        activeWorkState.preEditSecurityReviewDone = false
        activeWorkState.securityReviewGateDone = false
        activeWorkState.testWriterGateDone = false
        activeWorkState.docWriterGateDone = false
        activeWorkState.specialistReviewGatesDone = []
        activeWorkState.validationInfrastructureBypassFingerprint = undefined
        activeWorkState.auxGatesLastPendingFiles = currentFiles
      }

      function getConversationGatePassForPendingFiles(
        files: string[],
        messages: unknown,
      ): { reviewerVerdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | '' } | undefined {
        if (files.length === 0 || !Array.isArray(messages)) return undefined
        let latestMatchingPass:
          | { reviewerVerdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | '' }
          | undefined
        for (const message of messages) {
          if (latestMatchingPass && messageChangedFiles(message)) {
            latestMatchingPass = undefined
          }
          const gateStates = extractGateStateBlocksFromMessage(message)
          for (const gateState of gateStates) {
            if (
              gateState.gate !== 'validation/reviewer' ||
              gateState.status !== 'passed'
            ) {
              continue
            }
            const gateFiles = extractPendingFilesFromGateDetails(
              gateState.details,
            )
            if (!gateFileSetsEqual(files, gateFiles)) continue
            latestMatchingPass = {
              reviewerVerdict: extractReviewerVerdictFromGateDetails(
                gateState.details,
              ),
            }
          }
        }
        return latestMatchingPass
      }

      function extractGateStateBlocksFromMessage(message: unknown): Array<{
        gate: string
        status: string
        details: string
        repairRound?: number
        maxRepairRounds?: number
      }> {
        const texts: string[] = []
        collectMessageText(message, texts)
        const states: Array<{
          gate: string
          status: string
          details: string
          repairRound?: number
          maxRepairRounds?: number
        }> = []
        for (const text of texts) {
          const matches = text.matchAll(/<gate-state>([\s\S]*?)<\/gate-state>/g)
          for (const match of matches) {
            try {
              const parsed = JSON.parse(match[1]) as Record<string, unknown>
              states.push({
                gate: String(parsed.gate ?? ''),
                status: String(parsed.status ?? ''),
                details: String(parsed.details ?? ''),
                ...(typeof parsed.repairRound === 'number'
                  ? { repairRound: parsed.repairRound }
                  : {}),
                ...(typeof parsed.maxRepairRounds === 'number'
                  ? { maxRepairRounds: parsed.maxRepairRounds }
                  : {}),
              })
            } catch {
              // Ignore malformed gate-state blocks; only explicit valid JSON
              // can prove a prior pass.
            }
          }
        }
        return states
      }

      function collectMessageText(value: unknown, out: string[]): void {
        if (!value) return
        if (typeof value === 'string') {
          out.push(value)
          return
        }
        if (Array.isArray(value)) {
          for (const item of value) collectMessageText(item, out)
          return
        }
        if (typeof value !== 'object') return
        const record = value as Record<string, unknown>
        if (typeof record.text === 'string') out.push(record.text)
        if (typeof record.content === 'string') out.push(record.content)
        if (record.type === 'text' && typeof record.value === 'string') {
          out.push(record.value)
        }
        if (record.type === 'json' && 'value' in record) {
          collectMessageText(record.value, out)
        }
        if (Array.isArray(record.content))
          collectMessageText(record.content, out)
      }

      function extractPendingFilesFromGateDetails(details: string): string[] {
        const match = details.match(/\bpending files\s*:\s*([^;\n]+)/i)
        if (!match) return []
        const rawFiles = match[1]
          .split(',')
          .map((file) => file.trim())
          .filter(
            (file) =>
              file.length > 0 &&
              file !== '(unknown files)' &&
              file !== '(unknown)' &&
              file !== '(none)',
          )
        return normalizeGateFileList(rawFiles)
      }

      function extractReviewerVerdictFromGateDetails(
        details: string,
      ): 'LOOKS_GOOD' | 'NON_BLOCKING' | '' {
        if (/\bNON_BLOCKING\b/.test(details)) return 'NON_BLOCKING'
        if (/\bLOOKS_GOOD\b/.test(details)) return 'LOOKS_GOOD'
        return ''
      }

      function messageChangedFiles(message: unknown): boolean {
        return extractChangedFilesFromMessages([message], 0).length > 0
      }

      function hasFreshGateFingerprintForPendingFiles(
        files: string[],
        currentStatusLines: Map<string, string>,
        validationSummary: string,
      ): boolean {
        if (files.length === 0) return false
        if (!gateFileSetsEqual(files, activeWorkState.gatePassedPendingFiles)) {
          return false
        }
        // Fail closed when no fingerprint was recorded (older serialized state
        // or a gate pass that never wrote a fingerprint). Reusing on file-set
        // match alone would let same-path content changes silently bypass the
        // reviewer/validation gate.
        const recorded = activeWorkState.gatePassedFingerprint
        if (!recorded) return false
        const currentFingerprint = buildGateFingerprint(
          files,
          currentStatusLines,
          validationSummary,
        )
        return recorded === currentFingerprint
      }

      function hasDurableGatePassForPendingFiles(
        files: string[],
        currentStatusLines: Map<string, string>,
      ): boolean {
        if (!reviewerFinalizationVerdictFromDurablePass()) return false
        return hasFreshGateFingerprintForPendingFiles(
          files,
          currentStatusLines,
          activeWorkState.gatePassedValidationSummary ||
            activeWorkState.lastValidationSummary ||
            'No configured file-change hooks ran.',
        )
      }

      function reviewerFinalizationVerdictFromDurablePass():
        | 'LOOKS_GOOD'
        | 'NON_BLOCKING'
        | '' {
        if (activeWorkState.gatePassedReviewerVerdict === 'LOOKS_GOOD') {
          return 'LOOKS_GOOD'
        }
        if (activeWorkState.gatePassedReviewerVerdict === 'NON_BLOCKING') {
          return 'NON_BLOCKING'
        }
        return ''
      }

      function buildPinnedActiveWorkMessage(
        state: Base2ActiveWorkState,
      ): string {
        const workflowTodoProgress = state.workflowTodoProgress
        const hasIncompleteWorkflowTodos =
          !!workflowTodoProgress &&
          workflowTodoProgress.nextWorkflowAction.trim().length > 0
        const hasUnresolvedGateWork =
          state.openReviewerBlockers.length > 0 ||
          state.pendingGateFiles.length > 0 ||
          state.nextRequiredAction.trim().length > 0 ||
          state.lastReviewerGateSkipReason.trim().length > 0 ||
          state.currentPhase === 'blocked' ||
          state.currentPhase === 'awaiting_validation' ||
          state.currentPhase === 'awaiting_review'
        if (!hasUnresolvedGateWork && !hasIncompleteWorkflowTodos) return ''

        const sections: string[] = [`Current phase: ${state.currentPhase}`]
        if (hasUnresolvedGateWork) {
          sections.push(
            'suggest_followups: BLOCKED — the validation/reviewer gate has not passed yet. Do not call it until this line disappears.',
          )
        }
        if (state.openReviewerBlockers.length > 0) {
          sections.push(
            [
              'Open reviewer blockers/feedback (verbatim; controlling next action):',
              ...state.openReviewerBlockers.map((blocker) => blocker.trim()),
            ].join('\n'),
          )
        }
        if ((state.openReviewerFindings?.length ?? 0) > 0) {
          sections.push(
            [
              'Open reviewer finding records (runtime-owned; only a fresh matching review may clear them):',
              ...(state.openReviewerFindings ?? []).map(
                (finding) =>
                  `${finding.id} [${finding.status}] snapshot=${finding.snapshotFingerprint.slice(0, 16)} files=${finding.files.join(', ')} :: ${finding.text}`,
              ),
              'Every repair edit must explicitly address one or more open finding IDs. Do not declare these records stale from conversational memory.',
            ].join('\n'),
          )
        }
        if ((state.validationEvidence?.length ?? 0) > 0) {
          sections.push(
            [
              'Scoped validation evidence (does not clear reviewer findings by itself):',
              ...(state.validationEvidence ?? []).map(
                (evidence) =>
                  `${evidence.gateId.slice(0, 16)} assurance=${evidence.assurance} files=${evidence.files.join(', ')} :: ${evidence.summary}`,
              ),
            ].join('\n'),
          )
        }
        if (state.pendingGateFiles.length > 0) {
          sections.push(
            `Pending validation/reviewer gate files: ${state.pendingGateFiles.join(', ')}`,
          )
        }
        if (state.lastValidationSummary && state.pendingGateFiles.length > 0) {
          sections.push(
            `Last validation summary: ${state.lastValidationSummary}`,
          )
        }
        if (state.nextRequiredAction) {
          sections.push(`Next required action: ${state.nextRequiredAction}`)
        }
        if (state.lastReviewerGateSkipReason) {
          sections.push(
            `Last reviewer gate skip/error reason: ${state.lastReviewerGateSkipReason}`,
          )
        }
        if (hasIncompleteWorkflowTodos) {
          sections.push(
            [
              'Workflow todo progress (authoritative resumable state):',
              `Completed ${workflowTodoProgress.completedCount}/${workflowTodoProgress.totalCount}.`,
              `Next workflow action: ${workflowTodoProgress.nextWorkflowAction}`,
              'Continue from this item; do not restart earlier completed workflow steps. Mark this item complete with write_todos once it is actually completed before moving to a different workflow item.',
            ].join('\n'),
          )
        }
        return [
          'Harness pinned active-work state (controlling state; do not ignore):',
          'This generated state survives context compaction and overrides stale summarized dialogue.',
          'Role: root orchestrator. Do not call set_output. Use only tools currently exposed by the runtime.',
          ...sections,
        ].join('\n\n')
      }

      function buildReviewerFindingId(text: string, index: number): string {
        let hash = 2166136261
        for (let i = 0; i < text.length; i += 1) {
          hash ^= text.charCodeAt(i)
          hash = Math.imul(hash, 16777619)
        }
        return `RF-${index + 1}-${(hash >>> 0).toString(16).padStart(8, '0')}`
      }

      function extractChangedFiles(toolResult: unknown): string[] {
        const out = new Set<string>()
        visitToolValue(toolResult, out)
        return normalizeGateFileList([...out])
      }

      function updateWorkflowTodoProgressFromMessages(messages: unknown): void {
        const progress = extractLatestWorkflowTodoProgress(messages)
        if (!progress) return
        const currentProgress = activeWorkState.workflowTodoProgress
        const progressChanged = !workflowTodoProgressEquals(
          currentProgress,
          progress,
        )
        activeWorkState.workflowTodoProgress = progress
        if (progressChanged) markActiveWorkStateChanged()
      }

      function extractLatestWorkflowTodoProgress(
        messages: unknown,
      ): Base2WorkflowTodoProgress | undefined {
        if (!Array.isArray(messages)) return undefined
        let latestTodos: Base2WorkflowTodo[] | undefined
        const pendingToolCalls = new Map<string, Base2WorkflowTodo[]>()

        for (const message of messages) {
          if (!message || typeof message !== 'object') continue
          const record = message as Record<string, unknown>
          if (record.role === 'assistant' && Array.isArray(record.content)) {
            for (const part of record.content) {
              if (!part || typeof part !== 'object') continue
              const toolCall = part as Record<string, unknown>
              if (toolCall.type !== 'tool-call') continue
              const toolName =
                typeof toolCall.toolName === 'string' ? toolCall.toolName : ''
              if (toolName !== 'write_todos') continue
              const todos = extractWorkflowTodosFromValue(toolCall.input)
              if (todos.length === 0) continue
              latestTodos = todos
              const toolCallId =
                typeof toolCall.toolCallId === 'string'
                  ? toolCall.toolCallId
                  : ''
              if (toolCallId) pendingToolCalls.set(toolCallId, todos)
            }
          }

          if (record.role !== 'tool') continue
          const toolName =
            typeof record.toolName === 'string' ? record.toolName : ''
          const toolCallId =
            typeof record.toolCallId === 'string' ? record.toolCallId : ''
          if (toolName !== 'write_todos' && !pendingToolCalls.has(toolCallId)) {
            continue
          }
          const resultTodos = extractWorkflowTodosFromValue(record.content)
          if (resultTodos.length > 0) {
            latestTodos = resultTodos
            continue
          }
          const callTodos = pendingToolCalls.get(toolCallId)
          if (callTodos && toolCallSucceeded(record.content))
            latestTodos = callTodos
        }

        return buildWorkflowTodoProgress(latestTodos)
      }

      function extractWorkflowTodosFromValue(
        value: unknown,
      ): Base2WorkflowTodo[] {
        const todos = findWorkflowTodoArray(value)
        if (!todos) return []
        const normalizedTodos: Base2WorkflowTodo[] = []
        for (const todo of todos) {
          if (!todo || typeof todo !== 'object') continue
          const record = todo as Record<string, unknown>
          const content = getWorkflowTodoContent(record)
          if (!content) continue
          const status = getWorkflowTodoStatus(record)
          normalizedTodos.push({
            content,
            status,
            completed: status === 'completed',
          })
        }
        return normalizedTodos
      }

      function findWorkflowTodoArray(value: unknown): unknown[] | undefined {
        if (!value) return undefined
        if (Array.isArray(value)) {
          if (value.some(isWorkflowTodoLike)) return value
          for (const item of value) {
            const nestedTodos = findWorkflowTodoArray(item)
            if (nestedTodos) return nestedTodos
          }
          return undefined
        }
        if (typeof value !== 'object') return undefined
        const record = value as Record<string, unknown>
        if (record.type === 'json' && 'value' in record) {
          const jsonTodos = findWorkflowTodoArray(record.value)
          if (jsonTodos) return jsonTodos
        }
        const directTodos = record.todos
        if (
          Array.isArray(directTodos) &&
          directTodos.some(isWorkflowTodoLike)
        ) {
          return directTodos
        }
        for (const nested of Object.values(record)) {
          const nestedTodos = findWorkflowTodoArray(nested)
          if (nestedTodos) return nestedTodos
        }
        return undefined
      }

      function isWorkflowTodoLike(value: unknown): boolean {
        if (!value || typeof value !== 'object') return false
        const record = value as Record<string, unknown>
        return getWorkflowTodoContent(record).length > 0
      }

      function getWorkflowTodoContent(record: Record<string, unknown>): string {
        const content =
          record.content ?? record.text ?? record.title ?? record.task
        return typeof content === 'string' ? content.trim() : ''
      }

      function getWorkflowTodoStatus(record: Record<string, unknown>): string {
        const status = record.status ?? record.state
        if (typeof status === 'string') return status.trim().toLowerCase()
        if (record.completed === true || record.done === true)
          return 'completed'
        if (record.completed === false || record.done === false)
          return 'pending'
        return 'pending'
      }

      function buildWorkflowTodoProgress(
        todos: Base2WorkflowTodo[] | undefined,
      ): Base2WorkflowTodoProgress | undefined {
        if (!todos || todos.length === 0) return undefined
        const completedCount = todos.filter((todo) => todo.completed).length
        const firstIncomplete = todos.find((todo) => !todo.completed)
        return {
          todos,
          completedCount,
          totalCount: todos.length,
          nextWorkflowAction: firstIncomplete?.content ?? '',
        }
      }

      function normalizeWorkflowTodoProgress(
        progress: Base2WorkflowTodoProgress | undefined,
      ): Base2WorkflowTodoProgress | undefined {
        if (!progress || !Array.isArray(progress.todos)) return undefined
        return buildWorkflowTodoProgress(
          progress.todos.map((todo) => ({
            content: todo.content.trim(),
            status: todo.status.trim().toLowerCase(),
            completed: todo.completed,
          })),
        )
      }

      function workflowTodoProgressEquals(
        left: Base2WorkflowTodoProgress | undefined,
        right: Base2WorkflowTodoProgress | undefined,
      ): boolean {
        if (!left || !right) return left === right
        if (
          left.completedCount !== right.completedCount ||
          left.totalCount !== right.totalCount ||
          left.nextWorkflowAction !== right.nextWorkflowAction ||
          left.todos.length !== right.todos.length
        ) {
          return false
        }
        return left.todos.every((todo, index) => {
          const other = right.todos[index]
          return (
            todo.content === other.content &&
            todo.status === other.status &&
            todo.completed === other.completed
          )
        })
      }

      function toolCallSucceeded(value: unknown): boolean {
        if (!value) return false
        if (Array.isArray(value)) return value.some(toolCallSucceeded)
        if (typeof value !== 'object') return false
        const record = value as Record<string, unknown>
        if (record.type === 'json' && 'value' in record) {
          return toolCallSucceeded(record.value)
        }
        if (
          record.success === false ||
          'error' in record ||
          'errorMessage' in record
        ) {
          return false
        }
        if (record.success === true) return true
        if (typeof record.message === 'string') {
          // Only trust the success-verb regex when the message does not itself
          // contain a failure indicator, otherwise messages like "No updates
          // were saved" would false-positive on "saved".
          if (
            /\b(failed|failure|unable|could not|cannot|did not|was not|were not|skipped|no[- ]op|no changes|error)\b/i.test(
              record.message,
            )
          ) {
            return false
          }
          return /\b(success|successful|updated|wrote|written|saved)\b/i.test(
            record.message,
          )
        }
        return Object.keys(record).length > 0
      }

      function extractChangedFilesFromMessages(
        messages: unknown,
        startIndex: number,
      ): string[] {
        if (!Array.isArray(messages)) return []
        const out = new Set<string>()
        for (const message of messages.slice(startIndex)) {
          if (!message || typeof message !== 'object') continue
          const record = message as Record<string, unknown>
          if (!Array.isArray(record.content)) continue

          if (record.role === 'assistant') {
            for (const part of record.content) {
              if (!part || typeof part !== 'object') continue
              const toolCall = part as Record<string, unknown>
              if (
                toolCall.type === 'tool-call' &&
                typeof toolCall.toolName === 'string' &&
                isFileChangingTool(toolCall.toolName)
              ) {
                collectToolInputFiles(toolCall.input, out)
              }
            }
          }
          if (record.role === 'tool') {
            visitToolValue(record.content, out)
          }
        }
        return normalizeGateFileList([...out])
      }

      function visitToolValue(value: unknown, out: Set<string>): void {
        if (!value) return
        if (Array.isArray(value)) {
          for (const item of value) visitToolValue(item, out)
          return
        }
        if (typeof value !== 'object') return

        const record = value as Record<string, unknown>
        if (record.type === 'json' && 'value' in record) {
          visitToolValue(record.value, out)
        }
        if (hasEditArtifact(record)) {
          for (const action of record.actions as Array<
            Record<string, unknown>
          >) {
            if (action.outcome !== 'applied') continue
            if (typeof action.path === 'string') out.add(action.path)
            if (
              action.action === 'move' &&
              typeof action.destinationPath === 'string'
            ) {
              out.add(action.destinationPath)
            }
          }
        }
        for (const nested of Object.values(record)) {
          visitToolValue(nested, out)
        }
      }

      function collectToolInputFiles(input: unknown, out: Set<string>): void {
        if (!input || typeof input !== 'object') return
        const record = input as Record<string, unknown>
        if (typeof record.path === 'string') out.add(record.path)
        const operation = record.operation
        if (
          operation &&
          typeof operation === 'object' &&
          typeof (operation as Record<string, unknown>).path === 'string'
        ) {
          out.add((operation as Record<string, string>).path)
        }
        const edits = record.edits
        if (Array.isArray(edits)) {
          for (const edit of edits) {
            if (
              edit &&
              typeof edit === 'object' &&
              typeof (edit as Record<string, unknown>).path === 'string'
            ) {
              out.add((edit as Record<string, string>).path)
            }
          }
        }
      }

      function isFileChangingTool(toolName: string): boolean {
        return (
          toolName === 'apply_patch' ||
          toolName === 'apply_smart_patch' ||
          toolName === 'edit_transaction' ||
          toolName === 'replace_range' ||
          toolName === 'rewrite_symbol' ||
          toolName === 'str_replace' ||
          toolName === 'write_file'
        )
      }

      function hasEditArtifact(record: Record<string, unknown>): boolean {
        return (
          record.kind === 'file_mutation_result' &&
          record.version === 1 &&
          typeof record.operationId === 'string' &&
          record.operationId.length > 0 &&
          (record.authorityTier === 'portable_path' ||
            record.authorityTier === 'conditional_commit') &&
          (record.outcome === 'applied' ||
            record.outcome === 'partial' ||
            record.outcome === 'rollback_incomplete') &&
          Array.isArray(record.actions) &&
          record.authorityReceipt !== null &&
          typeof record.authorityReceipt === 'object' &&
          !Array.isArray(record.authorityReceipt) &&
          (record.authorityReceipt as Record<string, unknown>).operationId ===
            record.operationId &&
          (record.authorityReceipt as Record<string, unknown>).receiptId ===
            record.receiptId &&
          Array.isArray(
            (record.authorityReceipt as Record<string, unknown>).actions,
          ) &&
          (
            (record.authorityReceipt as Record<string, unknown>)
              .actions as unknown[]
          ).length === record.actions.length &&
          record.actions.every(
            (action, index) =>
              action !== null &&
              typeof action === 'object' &&
              (action as Record<string, unknown>).index === index &&
              typeof (action as Record<string, unknown>).actionId ===
                'string' &&
              typeof (action as Record<string, unknown>).path === 'string' &&
              (
                (record.authorityReceipt as Record<string, unknown>)
                  .actions as Array<Record<string, unknown>>
              )[index]?.actionId ===
                (action as Record<string, unknown>).actionId,
          ) &&
          Array.isArray(record.errors) &&
          Array.isArray(record.freshCapabilities) &&
          record.actions.some(
            (action) =>
              action !== null &&
              typeof action === 'object' &&
              (action as Record<string, unknown>).outcome === 'applied',
          )
        )
      }

      function extractGitStatusFiles(toolResult: unknown): string[] {
        const files = new Set<string>()
        if (!Array.isArray(toolResult)) return []
        for (const part of toolResult) {
          const value =
            part && (part as any).type === 'json'
              ? (part as any).value
              : undefined
          const status =
            value && typeof value === 'object'
              ? (value as Record<string, unknown>).status
              : undefined
          if (typeof status !== 'string') continue
          for (const line of status.split('\n')) {
            const file = parseGitStatusLine(line)
            if (file) files.add(file)
          }
        }
        return normalizeGateFileList([...files])
      }

      /**
       * Extracts a map of normalized-file -> raw git status line for the given
       * pending files from a git_status tool result. Lines for other files are
       * ignored. Used to build a durable fingerprint for the gate pass so we
       * only reuse a durable pass when the working tree state for those files
       * still matches.
       */
      function extractGitStatusLineMap(
        toolResult: unknown,
      ): Map<string, string> {
        const map = new Map<string, string>()
        if (!Array.isArray(toolResult)) return map
        for (const part of toolResult) {
          const value =
            part && (part as any).type === 'json'
              ? (part as any).value
              : undefined
          const status =
            value && typeof value === 'object'
              ? (value as Record<string, unknown>).status
              : undefined
          if (typeof status !== 'string') continue
          for (const rawLine of status.split('\n')) {
            const file = parseGitStatusLine(rawLine)
            if (!file) continue
            const normalized = normalizeGateFilePath(file)
            if (!normalized) continue
            // Keep the raw line (without trailing whitespace) so XY status bits
            // are part of the fingerprint.
            map.set(normalized, rawLine.replace(/\s+$/, ''))
          }
        }
        return map
      }

      /**
       * Build a durable gate fingerprint from the normalized pending files,
       * their current git status lines (if known), per-file working-tree
       * content hashes, and the validation summary. The content hash is the
       * decisive component for detecting same-path content changes; status
       * lines remain as supplementary fingerprint context. Files that do not
       * exist contribute a `missing` marker, and files that cannot be read
       * contribute an `unreadable:<code>` marker so the fingerprint fails
       * closed (a previously-passing content hash will not match a missing
       * or unreadable file).
       */
      function buildGateFingerprint(
        files: string[],
        statusLines: Map<string, string>,
        validationSummary: string,
      ): string {
        return hashGateSnapshotDetails(
          buildGateSnapshotDetails(files, statusLines, validationSummary),
        )
      }

      function buildGateSnapshotDetails(
        files: string[],
        statusLines: Map<string, string>,
        validationSummary: string,
      ): string {
        const sorted = [...files].sort()
        const parts = sorted.map((file) => {
          const statusLine = statusLines.get(file) ?? ''
          const contentMarker = readGateFileContentMarker(file)
          return `${file}\t${statusLine}\t${contentMarker}`
        })
        return `files-v3\n${parts.join('\n')}\n--\n${validationSummary}`
      }

      function hashGateSnapshotDetails(details: string): string {
        const getBuiltinModule =
          typeof process === 'object' &&
          process !== null &&
          'getBuiltinModule' in process &&
          typeof process.getBuiltinModule === 'function'
            ? process.getBuiltinModule.bind(process)
            : undefined
        const req = (globalThis as any).require as NodeJS.Require | undefined
        let crypto: typeof import('node:crypto') | undefined
        if (getBuiltinModule) {
          crypto = getBuiltinModule(
            'node:crypto',
          ) as typeof import('node:crypto')
        } else if (typeof req === 'function') {
          crypto = req('node:crypto')
        }
        if (crypto) {
          return `v3:${crypto.createHash('sha256').update(details).digest('hex')}`
        }
        // Serialized runtimes should expose a built-in module loader, but keep
        // a deterministic single-line fallback so a loader failure never
        // reintroduces a multiline attestation contract.
        let hash = 2166136261
        for (let index = 0; index < details.length; index += 1) {
          hash ^= details.charCodeAt(index)
          hash = Math.imul(hash, 16777619)
        }
        return `v3:fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
      }

      /**
       * Resolve a normalized gate file path against process.cwd() and return
       * a deterministic content marker for fingerprinting. Never throws — any
       * read/stat failure is encoded as an `unreadable:<code>` marker so the
       * gate fails closed rather than reusing a stale durable pass.
       */
      function readGateFileContentMarker(normalizedPath: string): string {
        if (!normalizedPath) return 'unreadable:empty-path'
        // Resolve built-ins at call time so this stays compatible with
        // serialized handleSteps executions. Prefer process.getBuiltinModule
        // when available because some serialized runtimes do not expose a
        // CommonJS require global.
        const getBuiltinModule =
          typeof process === 'object' &&
          process !== null &&
          'getBuiltinModule' in process &&
          typeof process.getBuiltinModule === 'function'
            ? process.getBuiltinModule.bind(process)
            : undefined
        const req = (globalThis as any).require as NodeJS.Require | undefined
        let fs: typeof import('node:fs')
        let path: typeof import('node:path')
        let crypto: typeof import('node:crypto')
        if (getBuiltinModule) {
          fs = getBuiltinModule('node:fs') as typeof import('node:fs')
          path = getBuiltinModule('node:path') as typeof import('node:path')
          crypto = getBuiltinModule(
            'node:crypto',
          ) as typeof import('node:crypto')
        } else if (typeof req === 'function') {
          fs = req('node:fs')
          path = req('node:path')
          crypto = req('node:crypto')
        } else {
          return 'unreadable:no-module-loader'
        }
        const cwd =
          typeof process === 'object' &&
          process !== null &&
          typeof process.cwd === 'function'
            ? process.cwd()
            : ''
        // Gate paths are normalized to be project-relative before reaching this
        // helper. Absolute paths still resolve correctly because
        // path.resolve(cwd, absolutePath) returns absolutePath.
        const absolutePath = path.resolve(cwd, normalizedPath)
        try {
          const stat = fs.statSync(absolutePath)
          if (!stat.isFile()) return 'unreadable:not-a-file'
          // Cache the content marker by (path, mtime, size): if the file hasn't
          // changed since the last gate evaluation, skip the read+hash. The
          // cache lives on the function object so it persists across calls
          // within a single generator instance (handleSteps is serialized
          // via .toString() and rebuilt with new Function, so module-level
          // caches would not survive reconstruction).
          const cacheKey = `${absolutePath}\t${stat.mtimeMs}\t${stat.size}`
          const markerCache = (
            readGateFileContentMarker as unknown as {
              cache?: Map<string, string>
            }
          ).cache
          if (markerCache && markerCache.has(cacheKey)) {
            return markerCache.get(cacheKey)!
          }
          const data = fs.readFileSync(absolutePath)
          const hash = crypto.createHash('sha256').update(data).digest('hex')
          const marker = `sha256:${hash}:${data.length}`
          const cacheSlot = readGateFileContentMarker as unknown as {
            cache?: Map<string, string>
          }
          if (!cacheSlot.cache) cacheSlot.cache = new Map<string, string>()
          cacheSlot.cache.set(cacheKey, marker)
          return marker
        } catch (err) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code?: unknown }).code ?? 'unknown')
              : 'unknown'
          if (code === 'ENOENT') return 'missing'
          return `unreadable:${code}`
        }
      }

      function parseGitStatusLine(line: string): string {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('## ')) return ''
        const pathPart = trimmed.slice(2).trim()
        if (!pathPart) return ''
        const renameTarget = pathPart.split(' -> ').at(-1)
        const resolved = renameTarget?.trim() ?? ''
        // Untracked-directory git status entries are the only ones whose path
        // ends with `/`; they must not become gate files.
        if (resolved.endsWith('/')) return ''
        return resolved
      }

      // Inline mirror of agents/base2/gate-reviewer.ts helpers. Keep these
      // in sync: handleSteps is serialized with .toString() and reconstructed
      // via new Function(...), so these helpers cannot depend on imports.
      function stripReviewerPreamble(text: string): string {
        let remaining = text.trim()
        // Tolerate reviewers that still emit a closed leading <think>...</think>
        // block (or several) plus surrounding whitespace before the verdict label.
        while (true) {
          const match = remaining.match(/^<think\b[^>]*>[\s\S]*?<\/think>\s*/i)
          if (!match) break
          remaining = remaining.slice(match[0].length).trim()
        }
        return remaining
      }

      function extractBackgroundAgentJobId(
        toolResult: unknown,
      ): string | undefined {
        // The background spawn_agents report is an array of tool-result parts;
        // the background entry has value.background === true with a jobId. Also
        // tolerate a direct object shape (value or the part itself) so this
        // stays robust to small runtime report-shape variations.
        const candidates: unknown[] = []
        if (Array.isArray(toolResult)) {
          for (const part of toolResult) {
            const value =
              part && (part as any).type === 'json' ? (part as any).value : part
            candidates.push(value)
          }
        } else if (toolResult && typeof toolResult === 'object') {
          candidates.push((toolResult as any).value ?? toolResult)
        }
        for (const value of candidates) {
          if (
            value &&
            typeof value === 'object' &&
            (value as any).background === true &&
            typeof (value as any).jobId === 'string'
          ) {
            return (value as any).jobId
          }
        }
        return undefined
      }

      function collectReviewerBlockers(toolResult: unknown): string[] {
        // First check for structured reviewer outputs (e.g. JSON with a
        // verdict field). When present and BLOCKING, surface findings as the
        // blocker text so existing pinning/messaging logic still works.
        const structured = collectStructuredReviewerOutputs(toolResult)
        const structuredBlockers: string[] = []
        for (const entry of structured) {
          if (entry.verdict === 'BLOCKING') {
            const findings =
              entry.findings.length > 0
                ? entry.findings
                : ['(no findings provided)']
            for (const finding of findings) {
              structuredBlockers.push(`BLOCKING: ${finding}`)
            }
          }
          if (entry.coverage === 'missing') {
            structuredBlockers.push(
              'BLOCKING: test coverage missing for changed behavior (add a case to the relevant *.test.ts)',
            )
          }
          for (const [dimension, status] of Object.entries(
            entry.dimensions ?? {},
          )) {
            if (String(status).toLowerCase() === 'block') {
              structuredBlockers.push(
                `BLOCKING: ${dimension} review dimension failed`,
              )
            }
          }
          for (const requirement of entry.requirementCoverage ?? []) {
            if (
              requirement.status === 'missing' ||
              requirement.status === 'uncertain'
            ) {
              structuredBlockers.push(
                `BLOCKING: requirement ${requirement.status}: ${requirement.requirement}`,
              )
            }
          }
        }
        if (structuredBlockers.length > 0) return structuredBlockers

        const texts: string[] = []
        collectStrings(toolResult, texts)
        return texts
          .map((text) => stripReviewerPreamble(text))
          .filter((text) => hasReviewerLineVerdict(text, 'BLOCKING'))
      }

      function collectReviewerAttestationIssues(
        toolResult: unknown,
        expectedFingerprint: string,
        pendingFiles: string[],
      ): string[] {
        const structured = collectStructuredReviewerOutputs(toolResult)
        if (structured.length === 0) {
          return [
            'BLOCKING: reviewer did not return the required structured snapshot attestation',
          ]
        }
        const result = structured[structured.length - 1]
        if (
          typeof result.schemaVersion !== 'number' ||
          !Number.isInteger(result.schemaVersion) ||
          result.schemaVersion <= 0
        ) {
          return [
            'BLOCKING: reviewer returned an invalid attestation schemaVersion',
          ]
        }
        const issues: string[] = []
        if (result.snapshotFingerprint !== expectedFingerprint) {
          issues.push(
            'BLOCKING: reviewer snapshot fingerprint did not match the reviewed working tree',
          )
        }
        const reviewed = new Set(
          (result.reviewedFiles ?? [])
            .map((file) => normalizeGateFilePath(file))
            .filter((file) => file.length > 0),
        )
        const missing = pendingFiles
          .map((file) => normalizeGateFilePath(file))
          .filter((file) => file.length > 0 && !reviewed.has(file))
        if (missing.length > 0) {
          issues.push(
            `BLOCKING: reviewer did not attest to every pending file: ${missing.join(', ')}`,
          )
        }
        return issues
      }

      // Distinguishes reviewer-agent crashes (errorMessage / type === 'error')
      // from a reviewer that ran but emitted no recognizable verdict. Inline
      // mirror of detectReviewerCrash in agents/base2/gate-reviewer.ts.
      function detectReviewerCrash(toolResult: unknown): string | null {
        return findReviewerCrash(toolResult)
      }

      function extractAgentReceipt(toolResult: unknown):
        | {
            status: string
            changedFiles: Array<{ path: string }>
            findingsAddressed: string[]
            requestedValidation: string[]
          }
        | undefined {
        const visit = (value: unknown, depth = 0): any => {
          if (!value || depth > 10) return undefined
          if (Array.isArray(value)) {
            for (const item of value) {
              const found = visit(item, depth + 1)
              if (found) return found
            }
            return undefined
          }
          if (typeof value !== 'object') return undefined
          const record = value as Record<string, unknown>
          if (
            record.schemaVersion === 1 &&
            typeof record.receiptId === 'string' &&
            typeof record.status === 'string' &&
            Array.isArray(record.changedFiles)
          ) {
            return {
              status: record.status,
              changedFiles: record.changedFiles.flatMap((item) => {
                if (typeof item === 'string') return [{ path: item }]
                if (item && typeof item === 'object') {
                  const path = (item as Record<string, unknown>).path
                  return typeof path === 'string' ? [{ path }] : []
                }
                return []
              }),
              findingsAddressed: Array.isArray(record.findingsAddressed)
                ? record.findingsAddressed.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : [],
              requestedValidation: Array.isArray(record.requestedValidation)
                ? record.requestedValidation.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : [],
            }
          }
          for (const nested of Object.values(record)) {
            const found = visit(nested, depth + 1)
            if (found) return found
          }
          return undefined
        }
        return visit(toolResult)
      }

      function extractWriterOutcome(
        toolResult: unknown,
      ):
        | { completionKind: 'changed' | 'noop'; evidence: string[] }
        | undefined {
        const visit = (value: unknown, depth = 0): any => {
          if (!value || depth > 10) return undefined
          if (Array.isArray(value)) {
            for (const item of value) {
              const found = visit(item, depth + 1)
              if (found) return found
            }
            return undefined
          }
          if (typeof value !== 'object') return undefined
          const record = value as Record<string, unknown>
          if (
            (record.completionKind === 'changed' ||
              record.completionKind === 'noop') &&
            Array.isArray(record.evidence)
          ) {
            return {
              completionKind: record.completionKind,
              evidence: record.evidence.filter(
                (item): item is string => typeof item === 'string',
              ),
            }
          }
          for (const nested of Object.values(record)) {
            const found = visit(nested, depth + 1)
            if (found) return found
          }
          return undefined
        }
        return visit(toolResult)
      }

      function extractSpawnedAgentResult(
        toolResult: unknown,
        agentType: string,
      ): unknown {
        const visit = (value: unknown, depth = 0): unknown => {
          if (!value || depth > 10) return undefined
          if (Array.isArray(value)) {
            for (const item of value) {
              const found = visit(item, depth + 1)
              if (found !== undefined) return found
            }
            return undefined
          }
          if (typeof value !== 'object') return undefined
          const record = value as Record<string, unknown>
          if (record.agentType === agentType && 'value' in record) {
            return record.value
          }
          if (record.type === 'json' && 'value' in record) {
            const found = visit(record.value, depth + 1)
            if (found !== undefined) return found
          }
          for (const nested of Object.values(record)) {
            const found = visit(nested, depth + 1)
            if (found !== undefined) return found
          }
          return undefined
        }
        return visit(toolResult)
      }

      function detectCommandFailure(
        toolResult: unknown,
        depth = 0,
      ): string | null {
        if (!toolResult || depth > 10) return null
        if (Array.isArray(toolResult)) {
          for (const item of toolResult) {
            const failure = detectCommandFailure(item, depth + 1)
            if (failure) return failure
          }
          return null
        }
        if (typeof toolResult !== 'object') return null
        const record = toolResult as Record<string, unknown>
        if (typeof record.errorMessage === 'string' && record.errorMessage) {
          return record.errorMessage
        }
        if (typeof record.exitCode === 'number' && record.exitCode !== 0) {
          return `Validation command failed with exit code ${record.exitCode}: ${typeof record.stderr === 'string' ? record.stderr.slice(0, 2_000) : ''}`
        }
        if (record.success === false || record.status === 'failed') {
          return typeof record.message === 'string'
            ? record.message
            : 'Validation command reported failure.'
        }
        for (const nested of Object.values(record)) {
          const failure = detectCommandFailure(nested, depth + 1)
          if (failure) return failure
        }
        return null
      }
      function findReviewerCrash(
        value: unknown,
        depth: number = 0,
      ): string | null {
        // Depth cap (matches gate-reviewer.ts): reviewer tool results can
        // carry deeply nested tool-call trees; 8 is well past any realistic
        // envelope but stops pathological recursion.
        if (depth > 8) return null
        if (!value) return null
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = findReviewerCrash(item, depth + 1)
            if (found) return found
          }
          return null
        }
        if (typeof value !== 'object') return null
        const record = value as Record<string, unknown>
        // NOTE: nested errorMessage from an inner tool call the reviewer made
        // will also classify as a reviewer crash. Acceptable because callers
        // only consult this when no verdict was emitted — a reviewer whose
        // inner tool errored AND who produced no verdict is effectively
        // crashed from the operator's perspective.
        if (
          typeof record.errorMessage === 'string' &&
          record.errorMessage.trim()
        ) {
          return record.errorMessage.trim()
        }
        if (record.type === 'error' && typeof record.message === 'string') {
          return (
            record.message.trim() ||
            'reviewer agent reported an unspecified error'
          )
        }
        if (record.type === 'json' && 'value' in record) {
          const nested = findReviewerCrash((record as any).value, depth + 1)
          if (nested) return nested
        }
        for (const nested of Object.values(record)) {
          const found = findReviewerCrash(nested, depth + 1)
          if (found) return found
        }
        return null
      }

      function getReviewerFinalizationVerdict(
        toolResult: unknown,
      ): 'LOOKS_GOOD' | 'NON_BLOCKING' | '' {
        // Automated gates accept only schema-backed structured reviewer output.
        const structured = collectStructuredReviewerOutputs(toolResult)
        if (structured.some((entry) => entry.coverage === 'missing')) {
          return ''
        }
        for (const entry of structured) {
          if (entry.verdict === 'LOOKS_GOOD') return 'LOOKS_GOOD'
          if (entry.verdict === 'NON_BLOCKING') return 'NON_BLOCKING'
        }

        return ''
      }

      /**
       * Walk the reviewer tool result for objects that look like a structured
       * reviewer verdict: `{ verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING', findings?: string | string[], coverage?: 'covered' | 'missing' | 'n/a' }`.
       * Returns an ordered list of normalized entries. Plain text reviewer
       * outputs return an empty list so the existing text-mode logic stays in
       * charge.
       */
      function collectStructuredReviewerOutputs(value: unknown): Array<{
        verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING'
        findings: string[]
        coverage?: 'covered' | 'missing' | 'n/a'
        dimensions?: Record<string, string>
        requirementCoverage?: Array<{
          requirement: string
          status: string
          evidence: string[]
        }>
        snapshotFingerprint?: string
        reviewedFiles?: string[]
        schemaVersion?: number
        findingRecords?: Array<{
          id: string
          text: string
          severity?: string
          dimension?: string
          evidence: string[]
          correction?: string
        }>
      }> {
        const out: Array<{
          verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING'
          findings: string[]
          coverage?: 'covered' | 'missing' | 'n/a'
          dimensions?: Record<string, string>
          requirementCoverage?: Array<{
            requirement: string
            status: string
            evidence: string[]
          }>
          snapshotFingerprint?: string
          reviewedFiles?: string[]
          schemaVersion?: number
          findingRecords?: Array<{
            id: string
            text: string
            severity?: string
            dimension?: string
            evidence: string[]
            correction?: string
          }>
        }> = []
        visitForStructuredVerdict(value, out)
        return out
      }

      function visitForStructuredVerdict(
        value: unknown,
        out: Array<{
          verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING'
          findings: string[]
          coverage?: 'covered' | 'missing' | 'n/a'
          dimensions?: Record<string, string>
          requirementCoverage?: Array<{
            requirement: string
            status: string
            evidence: string[]
          }>
          snapshotFingerprint?: string
          reviewedFiles?: string[]
          schemaVersion?: number
          findingRecords?: Array<{
            id: string
            text: string
            severity?: string
            dimension?: string
            evidence: string[]
            correction?: string
          }>
        }>,
      ): void {
        if (!value) return
        if (Array.isArray(value)) {
          for (const item of value) visitForStructuredVerdict(item, out)
          return
        }
        if (typeof value !== 'object') return
        const record = value as Record<string, unknown>
        if (record.type === 'json' && 'value' in record) {
          visitForStructuredVerdict(record.value, out)
          return
        }
        const rawVerdict = record.verdict
        if (typeof rawVerdict === 'string') {
          const upper = rawVerdict.trim().toUpperCase()
          if (
            upper === 'LOOKS_GOOD' ||
            upper === 'NON_BLOCKING' ||
            upper === 'BLOCKING'
          ) {
            const findings: string[] = []
            const rawFindings = record.findings
            if (typeof rawFindings === 'string') {
              const trimmed = rawFindings.trim()
              if (trimmed) findings.push(trimmed)
            } else if (Array.isArray(rawFindings)) {
              for (const finding of rawFindings) {
                if (typeof finding === 'string' && finding.trim()) {
                  findings.push(finding.trim())
                } else if (finding && typeof finding === 'object') {
                  const item = finding as Record<string, unknown>
                  const id = typeof item.id === 'string' ? item.id.trim() : ''
                  const text =
                    typeof item.summary === 'string'
                      ? item.summary.trim()
                      : typeof item.text === 'string'
                        ? item.text.trim()
                        : ''
                  if (text) findings.push(id ? `[${id}] ${text}` : text)
                }
              }
            }
            let coverage: 'covered' | 'missing' | 'n/a' | undefined
            const rawCoverage = record.coverage
            if (typeof rawCoverage === 'string') {
              const lower = rawCoverage.trim().toLowerCase()
              if (
                lower === 'covered' ||
                lower === 'missing' ||
                lower === 'n/a'
              ) {
                coverage = lower
              }
            }
            out.push({
              verdict: upper as 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING',
              findings,
              coverage,
              dimensions:
                record.dimensions && typeof record.dimensions === 'object'
                  ? (Object.fromEntries(
                      Object.entries(
                        record.dimensions as Record<string, unknown>,
                      ).filter((entry) => typeof entry[1] === 'string'),
                    ) as Record<string, string>)
                  : undefined,
              requirementCoverage: Array.isArray(record.requirementCoverage)
                ? record.requirementCoverage.flatMap((item) => {
                    if (!item || typeof item !== 'object') return []
                    const requirement = (item as any).requirement
                    const status = (item as any).status
                    const evidence = (item as any).evidence
                    return typeof requirement === 'string' &&
                      typeof status === 'string'
                      ? [
                          {
                            requirement,
                            status: status.toLowerCase(),
                            evidence: Array.isArray(evidence)
                              ? evidence.filter(
                                  (value: unknown): value is string =>
                                    typeof value === 'string',
                                )
                              : [],
                          },
                        ]
                      : []
                  })
                : undefined,
              snapshotFingerprint:
                typeof record.snapshotFingerprint === 'string'
                  ? record.snapshotFingerprint
                  : undefined,
              reviewedFiles: Array.isArray(record.reviewedFiles)
                ? record.reviewedFiles.filter(
                    (file): file is string => typeof file === 'string',
                  )
                : undefined,
              schemaVersion:
                typeof record.schemaVersion === 'number'
                  ? record.schemaVersion
                  : undefined,
              findingRecords: Array.isArray(rawFindings)
                ? rawFindings.flatMap((finding) => {
                    if (!finding || typeof finding !== 'object') return []
                    const item = finding as Record<string, unknown>
                    const id = typeof item.id === 'string' ? item.id.trim() : ''
                    const text =
                      typeof item.summary === 'string'
                        ? item.summary.trim()
                        : typeof item.text === 'string'
                          ? item.text.trim()
                          : ''
                    return id && text
                      ? [
                          {
                            id,
                            text,
                            ...(typeof item.severity === 'string'
                              ? { severity: item.severity }
                              : {}),
                            ...(typeof item.dimension === 'string'
                              ? { dimension: item.dimension }
                              : {}),
                            evidence: Array.isArray(item.evidence)
                              ? item.evidence.filter(
                                  (value): value is string =>
                                    typeof value === 'string',
                                )
                              : [],
                            ...(typeof item.correction === 'string'
                              ? { correction: item.correction }
                              : {}),
                          },
                        ]
                      : []
                  })
                : undefined,
            })
            return
          }
        }
        for (const nested of Object.values(record)) {
          visitForStructuredVerdict(nested, out)
        }
      }

      function hasReviewerLineVerdict(
        text: string,
        verdict: 'BLOCKING' | 'LOOKS_GOOD' | 'NON_BLOCKING',
      ): boolean {
        return text
          .split(/\r?\n/)
          .some((line) => new RegExp(`^${verdict}\\b`, 'i').test(line.trim()))
      }

      function collectStrings(value: unknown, out: string[]): void {
        if (typeof value === 'string') {
          out.push(value)
          return
        }
        if (!value) return
        if (Array.isArray(value)) {
          for (const item of value) collectStrings(item, out)
          return
        }
        if (typeof value !== 'object') return
        for (const nested of Object.values(value as Record<string, unknown>)) {
          collectStrings(nested, out)
        }
      }

      function collectHookFailures(toolResult: unknown): string[] {
        const failures: string[] = []
        for (const hook of extractHookResults(toolResult)) {
          if (typeof (hook as any).errorMessage === 'string') {
            failures.push((hook as any).errorMessage)
            continue
          }
          const exitCode = (hook as any).exitCode
          if (typeof exitCode === 'number' && exitCode !== 0) {
            const name = (hook as any).hookName ?? 'hook'
            const detail = [(hook as any).stdout, (hook as any).stderr]
              .filter(Boolean)
              .join('\n')
              .slice(0, 2000)
            failures.push(`- ${name} failed (exit ${exitCode}):\n${detail}`)
          }
        }
        return failures
      }

      function summarizeHookResults(toolResult: unknown): string {
        const hooks = extractHookResults(toolResult)
        if (hooks.length === 0) return 'No configured file-change hooks ran.'
        const statusHook = hooks.find(
          (hook) => typeof (hook as any).validationStatus === 'string',
        )
        if (statusHook) {
          if (typeof (statusHook as any).message === 'string') {
            return `REDUCED_ASSURANCE: ${(statusHook as any).message}`
          }
          return (statusHook as any).validationStatus === 'hooks_skipped'
            ? 'Configured file-change hooks were skipped because none matched the changed files.'
            : 'No configured file-change hooks ran.'
        }
        const names = hooks
          .map((hook) =>
            typeof (hook as any).hookName === 'string'
              ? (hook as any).hookName
              : 'hook',
          )
          .join(', ')
        return `Configured file-change hooks passed: ${names}.`
      }

      function extractHookResults(
        toolResult: unknown,
      ): Record<string, unknown>[] {
        const hooks: Record<string, unknown>[] = []
        if (!Array.isArray(toolResult)) return hooks
        for (const part of toolResult) {
          const value =
            part && (part as any).type === 'json'
              ? (part as any).value
              : undefined
          if (!Array.isArray(value)) continue
          for (const hook of value) {
            if (hook && typeof hook === 'object')
              hooks.push(hook as Record<string, unknown>)
          }
        }
        return hooks
      }

      // Mirrors of `agents/base2/gate-repair.ts`. Kept inline because
      // `handleSteps` is serialized via `toString()` + `new Function(...)`
      // and cannot reference module-scope imports at reconstruction time.
      // `agents/__tests__/gate-repair-parity.test.ts` enforces parity.
      function parseValidationFailures(failures: string[]): {
        file: string
        line?: number
        column?: number
        message: string
        source: string
      }[] {
        const out: {
          file: string
          line?: number
          column?: number
          message: string
          source: string
        }[] = []
        const seen = new Set<string>()
        for (const raw of failures) {
          if (typeof raw !== 'string' || !raw.trim()) continue
          let source = 'unknown'
          let body = raw
          const prefixMatch = raw.match(
            /^\-\s+(\S+)\s+failed\s+\(exit\s+\d+\):\s*\n?/,
          )
          if (prefixMatch) {
            source = prefixMatch[1]
            body = raw.slice(prefixMatch[0].length)
          }
          const parsed: {
            file: string
            line?: number
            column?: number
            message: string
            source: string
          }[] = []
          // tsc: "file.ts(line,col): error TSxxxx: message"
          const tscRe = /^([^(]+)\((\d+),(\d+)\):\s*(error|warning)\s+(.+)$/gm
          let m: RegExpExecArray | null
          while ((m = tscRe.exec(body)) !== null) {
            parsed.push({
              file: m[1].trim(),
              line: parseInt(m[2], 10),
              column: parseInt(m[3], 10),
              message: `${m[4]}: ${m[5]}`.trim(),
              source,
            })
          }
          if (parsed.length === 0) {
            // eslint / gcc / rust: "file:line:col: message"
            const unixRe = /^(\S+?):(\d+):(\d+):\s*(.+)$/gm
            while ((m = unixRe.exec(body)) !== null) {
              parsed.push({
                file: m[1].trim(),
                line: parseInt(m[2], 10),
                column: parseInt(m[3], 10),
                message: m[4].trim(),
                source,
              })
            }
          }
          if (parsed.length === 0) {
            // generic: "file:line: message" (no column)
            const genericRe = /^(\S+?):(\d+):\s+(.+)$/gm
            while ((m = genericRe.exec(body)) !== null) {
              parsed.push({
                file: m[1].trim(),
                line: parseInt(m[2], 10),
                message: m[3].trim(),
                source,
              })
            }
          }
          if (parsed.length > 0) {
            for (const p of parsed) {
              const key = `${p.file}:${p.line ?? 0}:${p.column ?? 0}`
              if (seen.has(key)) continue
              seen.add(key)
              out.push(p)
            }
          } else {
            const key = `::${source}:${body.slice(0, 80)}`
            if (!seen.has(key)) {
              seen.add(key)
              out.push({
                file: '',
                message: body.trim().slice(0, 500),
                source,
              })
            }
          }
        }
        return out
      }

      function buildRepairEditorPrompt(
        parsed: {
          file: string
          line?: number
          column?: number
          message: string
          source: string
        }[],
        pendingFiles: string[],
      ): string {
        const fileFailures = parsed.filter((p) => p.file.length > 0)
        const lines: string[] = [
          'Validation hooks failed after your edits. A deterministic failure parser extracted the specific failing locations below.',
          '',
          'For each failure, read the exact file and line, make the minimal targeted fix, then finish. Do not refactor or make unrelated changes. The gate will re-run validation automatically after your edits.',
          '',
        ]
        if (fileFailures.length > 0) {
          lines.push('Failing locations (file:line:column — message):')
          const byFile = new Map<
            string,
            {
              file: string
              line?: number
              column?: number
              message: string
              source: string
            }[]
          >()
          for (const f of fileFailures) {
            const list = byFile.get(f.file) ?? []
            list.push(f)
            byFile.set(f.file, list)
          }
          for (const [file, fails] of byFile) {
            lines.push(`  ${file}:`)
            for (const f of fails) {
              const loc =
                f.line != null
                  ? `${f.line}${f.column != null ? `:${f.column}` : ''}`
                  : '?'
              lines.push(`    ${loc} — [${f.source}] ${f.message}`)
            }
          }
        } else {
          lines.push(
            'No specific file:line locations could be parsed from the failure output. Read the raw failures below and the pending files, then fix.',
          )
        }
        const unparsed = parsed.filter((p) => p.file.length === 0)
        if (unparsed.length > 0) {
          lines.push('')
          lines.push('Raw unparsed failures:')
          for (const u of unparsed) {
            lines.push(`  [${u.source}] ${u.message}`)
          }
        }
        if (pendingFiles.length > 0) {
          lines.push('')
          lines.push(`Pending changed files: ${pendingFiles.join(', ')}`)
        }
        return lines.join('\n')
      }

      function buildEscalationEditorPrompt(
        parsed: {
          file: string
          line?: number
          column?: number
          message: string
          source: string
        }[],
        pendingFiles: string[],
        roundsUsed: number,
      ): string {
        const fileFailures = parsed.filter((p) => p.file.length > 0)
        const lines: string[] = [
          `Validation hooks have failed after ${roundsUsed} automated repair round(s). The targeted fix attempts did not resolve the failures. This is an escalation round: investigate the ROOT CAUSE rather than patching the reported symptom.`,
          '',
          'Before editing, read the failing file(s) in full to understand the surrounding context, imports, and conventions. The prior repair rounds likely addressed a surface symptom without fixing the underlying issue (e.g. a missing import, a renamed symbol, a type mismatch upstream, a stale snapshot, or an incorrect assumption about an API).',
          '',
          'Make the minimal change that resolves the root cause. Avoid speculative refactors, formatting churn, or edits to files not implicated by the failures. After your edits the validation hooks will re-run automatically.',
          '',
        ]
        if (fileFailures.length > 0) {
          lines.push('Failing locations (file:line:column — message):')
          const byFile = new Map<
            string,
            {
              file: string
              line?: number
              column?: number
              message: string
              source: string
            }[]
          >()
          for (const f of fileFailures) {
            const list = byFile.get(f.file) ?? []
            list.push(f)
            byFile.set(f.file, list)
          }
          for (const [file, fails] of byFile) {
            lines.push(`  ${file}:`)
            for (const f of fails) {
              const loc =
                f.line != null
                  ? `${f.line}${f.column != null ? `:${f.column}` : ''}`
                  : '?'
              lines.push(`    ${loc} — [${f.source}] ${f.message}`)
            }
          }
        } else {
          lines.push(
            'No specific file:line locations could be parsed from the failure output. Read the raw failures below and the pending files, investigate the root cause, then fix.',
          )
        }
        const unparsed = parsed.filter((p) => p.file.length === 0)
        if (unparsed.length > 0) {
          lines.push('')
          lines.push('Raw unparsed failures:')
          for (const u of unparsed) {
            lines.push(`  [${u.source}] ${u.message}`)
          }
        }
        if (pendingFiles.length > 0) {
          lines.push('')
          lines.push(`Pending changed files: ${pendingFiles.join(', ')}`)
        }
        return lines.join('\n')
      }

      function classifyProactiveRetrieval(value: unknown):
        | {
            scope: 'focused' | 'multi-file' | 'cross-subsystem' | 'unknown'
            mode: 'search' | 'explain' | 'commands'
            limit: number
            reason: string
          }
        | undefined {
        if (typeof value !== 'string') return undefined
        const text = value.trim()
        if (text.length < 12) return undefined
        if (/^(hi|hello|hey|thanks|thank you|ok|okay)$/i.test(text))
          return undefined
        if (/^(continue|go on|proceed|keep going|resume)\b/i.test(text)) {
          return undefined
        }

        const codeIntent =
          /\b(code|file|files|repo|repository|project|codebase|workspace|module|package|function|class|component|hook|api|schema|config|test|tests|implement|fix|debug|refactor|audit|review|investigate|architecture|flow|index|context)\b/i.test(
            text,
          )
        if (!codeIntent) return undefined

        if (
          /\b(command|script|typecheck|lint|build|ci|workflow|validation|test command|package script)\b/i.test(
            text,
          )
        ) {
          return {
            scope: 'focused',
            mode: 'commands',
            limit: 12,
            reason: 'validation-or-command discovery',
          }
        }

        const isBroad =
          /\b(audit|across|all places|whole|entire|end[- ]to[- ]end|cross[- ]cutting|feature gaps|production readiness|architecture|general ability)\b/i.test(
            text,
          )
        if (isBroad) {
          return {
            scope: 'cross-subsystem',
            mode: 'explain',
            limit: 30,
            reason: 'broad or cross-cutting task surface',
          }
        }

        const concernCount = [
          /\b(cli|tui|ui|ux|frontend)\b/i,
          /\b(sdk|api)\b/i,
          /\b(agent|runtime|orchestrat|context)\b/i,
          /\b(index|retriev|search)\b/i,
          /\b(test|eval|ci)\b/i,
          /\bdocs?|documentation\b/i,
        ].filter((pattern) => pattern.test(text)).length
        if (concernCount >= 2) {
          return {
            scope: 'multi-file',
            mode: 'explain',
            limit: 24,
            reason: 'multiple distinct subsystems or concerns',
          }
        }

        return {
          scope: /\.(?:ts|tsx|js|jsx|py|go|rs|md)\b/.test(text)
            ? 'focused'
            : 'unknown',
          mode: 'search',
          limit: 14,
          reason: 'codebase intent with relevant files not yet verified',
        }
      }
    },
  }
}
const EXPLORE_PROMPT = `- Iteratively gather codebase context as needed. For broad codebase questions or tasks where relevant files are not already obvious, consume the runtime-injected query_index result first and deduplicate its candidates, matchedSnippets, and relatedFiles. Use mode: 'explain' when you need ranking rationale, mode: 'neighbors' to expand around a known file, mode: 'path' to connect two known files, and mode: 'commands' to find package scripts, CI workflows, task runners, and validation docs. Spawn bounded parallel discovery waves for explicit domains the index result did not cover; give each file-picker/code-searcher a non-overlapping question, join the wave, and launch another when inventory or coverage evidence still has gaps. There is no fixed total-agent limit. Verify selected files with read_files/read_subtree. Use list_directory and glob only when structural/path evidence is missing, and do not substitute basher for git status or file discovery. Use read_subtree for a specific subsystem. For a large file, call read_outline first, then read_files with a symbols selector. Read all relevant files before editing.`

function buildImplementationInstructionsPrompt({
  isFast,
  isDefault,
  hasNoValidation,
  noAskUser,
}: {
  isFast: boolean
  isDefault: boolean
  hasNoValidation: boolean
  noAskUser: boolean
}) {
  return `Act as a helpful assistant and freely respond to the user's request however would be most helpful to the user. Use your judgement to orchestrate the completion of the user's request using your specialized sub-agents and tools as needed. Take your time and be comprehensive. Don't surprise the user. For example, don't modify files if the user has not asked you to do so at least implicitly.

${buildBroadAuditSection('proceed to implementation or the answer')}

## Example response

The user asks you to implement a new feature. You respond in multiple steps:

${buildArray(
  EXPLORE_PROMPT,
  !noAskUser &&
    'After getting context on the user request from the codebase or from research, use the ask_user tool only for decisions that materially affect scope, UX, risk, data loss, migration, deployment, or API/contract behavior. Skip obvious questions; if you are >80% confident or the choice is easily reversible, choose the most conservative implementation and proceed.',
  isDefault &&
    `- For any task requiring 3+ steps, use the write_todos tool to write out your step-by-step implementation plan. Include ALL of the applicable tasks in the list.${isFast ? '' : ' You should include a step to review the changes after you have implemented the changes.'}:${hasNoValidation ? '' : ' You should include at least one step to validate/test your changes: be specific about whether to typecheck, run tests, run lints, etc.'} You may be able to do reviewing and validation in parallel in the same step. Skip write_todos for simple tasks like quick edits or answering questions.`,
  isDefault &&
    `- For quick problems, briefly explain your reasoning to the user. If you need to think longer, write your thoughts within the <think> tags. Finally, for complex architecture, design tradeoff, risk, debugging strategy, or repeated-failure reasoning, spawn the thinker agent after you have gathered enough context. Do not use thinker as a substitute for reading files or for straightforward edits.`,
  isDefault &&
    `- IMPORTANT: Before spawning the editor agent for non-trivial changes, prepare a compact implementation brief and pass it as the editor prompt. The editor does not inherit parent conversation history, so the prompt must be a self-contained envelope with these labeled fields (use these exact headings as a compact checklist; omit a field only when truly N/A):
    Use either colon labels or Markdown headings; both are accepted. Copyable template:
      Colon-label equivalents are also valid: Requirements:, Target files:, Constraints/non-goals:, Patterns:, Risks:.
      ## Requirements
      - The user-facing requirement and acceptance criteria.
      ## Target files
      - Explicit project-relative paths to edit or read first.
      ## Constraints/non-goals
      - Invariants, stable behavior, and scope boundaries.
      ## Patterns
      - Existing code/style conventions to follow.
      ## Risks
      - Edge cases, fragile call sites, and refactoring traps.
    If you cannot state the concrete implementation task, target files, and constraints yet, gather more context instead of spawning the editor. Do not spawn editor for tiny one-file edits or direct answers. Do not include parent-only work such as validation commands, terminal/shell cleanup, deleting files, visual smoke tests, code review, git operations, todos, or post-edit orchestration steps. After the editor returns, handle those parent-only responsibilities yourself.`,
  isFast &&
    '- Implement changes through edit_transaction, selecting the narrowest edit type for each operation and grouping related edits into one preflighted transaction. Implement all the changes in one go.',
  isFast &&
    '- Do a single typecheck targeted for your changes at most (if applicable for the project). Or skip this step if the change was small.',
  !hasNoValidation &&
    `- For non-trivial or risky changes, test them by running the narrowest appropriate validation commands for the project (e.g. typechecks, tests, lints, builds, or configured hooks). Try to run independent commands in parallel, then join all results before finalizing. If validation fails or times out, repair the exact failure and rerun the relevant command before treating the task as complete. Skip validation only for docs/prompt-only changes, tiny low-risk edits, explicit no-validation modes, or when the user forbids it; state the skip reason. You may have to explore the project to find the appropriate commands.`,
  `- Treat releases, deployments, publishing, migrations against shared environments, production-affecting scripts, git commits, and git pushes as high-impact actions. Do not run them unless the user explicitly requested that action in this task or confirms after you explain the exact command, target environment, and rollback/verification plan.`,
  `- Inform the user that you have completed the task in one sentence or a few short bullet points.`,
  '- After successfully completing an implementation, if the suggest_followups tool is available, use it to suggest ~3 next steps the user might want to take. Do not call suggest_followups until after you have written a user-visible completion summary and, for edited code, after the automated validation/reviewer gate has passed. If suggest_followups is unavailable, still provide the final summary/end normally.',
).join('\n')}`
}

function buildExecutePlanInstructionsPrompt(params: {
  isFast: boolean
  isDefault: boolean
  hasNoValidation: boolean
  noAskUser: boolean
}) {
  return [
    buildImplementationInstructionsPrompt(params),
    '',
    '## Durable plan execution mode',
    '',
    'You are in EXECUTE_PLAN mode. Your job is to execute or resume durable plan artifacts, not merely revise them. Treat durable artifact contents already provided in the conversation as the initial authoritative context; read artifacts directly only when their contents are missing, truncated, stale, or have changed. Continue from the next actionable milestone, and use normal project source editing tools when implementation work is required.',
    'Run the plan preflight before editing. Tasks should have stable IDs, dependencies, Acceptance criteria, and Validate gates. Claim exactly one actionable task by moving it to in_progress and recording its stable ID as currentTask. A task may move to done only after its validation gate passes; record validation/review evidence as a checkpoint. If preflight fails, repair the durable plan before implementation. Use STATE.json revisions to avoid overwriting newer execution state.',
    '',
    'Keep STATUS.md and LESSONS.md current throughout execution. Prefer update_plan_status for incremental STATUS.md / LESSONS.md updates; use create_plan for SPEC.md / PLAN.md revisions, substantial rewrites, or creating missing artifacts. PLAN mode remains plan-only, but EXECUTE_PLAN is allowed to edit project source to complete the plan. Do not let plan artifacts drift behind actual implementation state.',
  ].join('\n')
}

function buildImplementationStepPrompt({
  isDefault,
  isFast,
}: {
  isDefault: boolean
  isFast: boolean
}) {
  return buildArray(
    'Consider loading relevant skills with the skill tool if they might help with the current task. Do not reload skills that were already loaded earlier in this conversation.',
    'Use dedicated tools before shell fallbacks: repository status and validation gates are runtime-owned; use read_files/read_outline/read_subtree/glob/list_directory/query_index for inspection, deterministic edit tools for file changes, and basher only for commands without a dedicated tool.',
    isDefault &&
      `For non-trivial edits, spawn the editor after context discovery with a compact implementation-only prompt containing all of these envelope fields: Requirements, Target files, Constraints/non-goals, Patterns, Risks. Use those exact field labels in the prompt so the editor can scan them as a checklist. The editor does not inherit parent conversation history, so the prompt must contain the implementation context it needs. If you cannot state the concrete implementation task, target files, and constraints yet, gather more context instead of spawning the editor. Do not put validation commands, terminal/shell cleanup, deletion requests, visual smoke tests, code review, git operations, todos, or other parent-only orchestration tasks in the editor handoff. After the editor returns, the default runtime will independently detect changed files, run configured validation hooks, and spawn code-reviewer before finalization.`,
    isDefault &&
      'Use the phase triggers from the spawning guidelines: context agents before edits when scope is unclear, thinker for complex post-discovery reasoning, bashers for validation, debugger for repeated failures, and doc/test writers when docs or tests are required. Join all parallel validation/review results before completing.',
    `After completing the user request, summarize your changes in a sentence${isFast ? '' : ' or a few short bullet points'}.`,
    isDefault &&
      'Do not manually spawn code-reviewer for the same edited file set that the automated runtime gate will review. Manual review is only for user-requested extra review or pre-edit/advisory review. Spawn security-reviewer for auth, crypto, secrets, permissions, injection, sandboxing, supply-chain, or production-risk changes.',
    isDefault &&
      'After the automated validation/reviewer gate has passed for edited code, call suggest_followups with around 3 useful next steps if that tool is available. If suggest_followups is unavailable, do not let that block the final summary/end.',
  ).join('\n')
}

function buildExecutePlanStepPrompt({}: {}) {
  return buildArray(
    'You are in EXECUTE_PLAN mode. Execute or resume durable plan artifacts, using the project source editing tools when implementation work is required. Unlike PLAN mode, you may edit project source files to complete planned tasks.',
    'Treat SPEC.md, PLAN.md, STATUS.md, and LESSONS.md under the durable plan session as authoritative. Use any artifact contents already present in the conversation as the initial source of truth, confirm the next incomplete or blocked item from that context, and read artifacts directly only when contents are missing, truncated, stale, or have changed. Do not repeatedly re-read unchanged artifacts or source files after confirming the next item; continue from it unless the artifacts say completed work must be revisited.',
    'Honor the deterministic preflight included with resumed artifacts. Do not edit source when preflight reports errors. Use stable task IDs for updates, keep at most one task in_progress, respect dependencies, and do not mark a task done until its Validate gate passes and the checkpoint is recorded.',
    'Keep STATUS.md current as you progress: update completed/pending/blocked items, current state, validation results, and the next checkpoint. Keep LESSONS.md current with gotchas, decisions, reusable findings, and follow-up notes discovered during execution. Prefer update_plan_status for incremental STATUS.md / LESSONS.md updates; use create_plan for SPEC.md / PLAN.md revisions, substantial rewrites, or creating missing artifacts.',
    'Use normal implementation behavior for source changes: gather context before editing, follow project conventions, validate meaningful changes when appropriate, and summarize the completed work concisely. Do not let plan artifacts drift behind actual implementation state.',
  ).join('\n')
}

function buildPlanOnlyInstructionsPrompt({}: {}) {
  return `Orchestrate the completion of the user's request using your specialized sub-agents.

You are in plan mode. Preserve short-answer behavior: if the user is asking a question, requesting an explanation, or asking for a small clarification, answer directly and do not create a plan packet.

${buildBroadAuditSection('translate the findings into the durable plan packet below')}

For larger implementation, migration, debugging, or multi-step work, gather enough context to create a comprehensive, resumable plan packet. For non-trivial plans, create all four durable artifacts by default (SPEC.md, PLAN.md, STATUS.md, LESSONS.md); these are not optional or only "as needed". Normal users should not need to explicitly ask for STATUS or LESSONS artifacts. You may ask targeted clarifying questions with ask_user when the answer materially changes the plan. Avoid obvious questions and questions about details that can be adjusted later.

Plan mode must not edit project source or perform implementation work. Do not use normal editing tools for project files. Do not use the write_todos tool in plan mode. You may write to plan/session artifacts under .agents/sessions/<slug>/ only via these two tools, with this division of labor:
- create_plan: use to create the durable artifacts initially or to substantially rewrite them. Always use create_plan for SPEC.md and PLAN.md edits, and for creating any missing artifact. The four durable artifacts are:
  - SPEC.md
  - PLAN.md
  - STATUS.md
  - LESSONS.md
- update_plan_status: once the artifacts exist, use this for incremental STATUS.md and LESSONS.md updates — progress, blockers, checkpoints, and newly discovered lessons. Prefer update_plan_status over create_plan for these incremental status/lesson revisions so the durable artifacts stay current without rewriting them whole.

Plan mode may spawn as many analysis subagents as the work requires by using bounded waves. Basher commands and browser-use are runtime-enforced read-only throughout plan ancestry; use them for inspection, static analysis, non-emitting validation, page snapshots, and diagnostics only. Debugger is diagnosis-only. Do not use these agents for file creation or edits, dependency changes, git mutation, servers, deployment, production scripts, browser interactions, or any other implementation/effectful action.

## Example response

The user asks you to implement a non-trivial feature. You respond in multiple steps:

${buildArray(
  EXPLORE_PROMPT,
  `- After exploring the codebase, translate the user request and discovered context into a plan response. For small questions, answer instead of writing a plan.

## Durable plan packet for larger work

For comprehensive or otherwise non-trivial plans, create a session directory under .agents/sessions/<slug>/ and write all four durable artifacts with create_plan:
- SPEC.md: overview, goals/non-goals, requirements, acceptance criteria, relevant files/systems.
- PLAN.md: milestones, tasks, statuses, owners/agents if useful, dependencies, risks/blockers, and validation gates.
- STATUS.md: current state, completed/pending/blocked items, next checkpoint, and resume instructions.
- LESSONS.md: lessons, gotchas, decisions, and follow-up notes discovered while planning or updating.

Once the artifacts exist, prefer update_plan_status for incremental STATUS.md / LESSONS.md updates (progress, blockers, checkpoints, lessons). Only fall back to create_plan for STATUS.md / LESSONS.md when the artifact is missing or needs a substantial rewrite. SPEC.md and PLAN.md changes still go through create_plan.

Do not wait for the user to ask separately for STATUS.md or LESSONS.md on non-trivial plans; include them as part of the standard durable packet.

Also include the artifact metadata inside the <PLAN> response so the CLI can render the execution and resume affordances. Use simple markdown lines like:

## Artifacts
- Session: .agents/sessions/<slug>
- SPEC.md: .agents/sessions/<slug>/SPEC.md
- PLAN.md: .agents/sessions/<slug>/PLAN.md
- STATUS.md: .agents/sessions/<slug>/STATUS.md
- LESSONS.md: .agents/sessions/<slug>/LESSONS.md

The plan packet should be resumable across days. Include:
- Overview and requirements.
- Milestones/tasks with explicit statuses (todo/in progress/done/blocked).
- Give every executable checklist task a unique stable ID and indented \`Depends on\`, \`Acceptance\`, and \`Validate\` fields. Stable IDs must not change when task wording changes.
- Dependencies and ordering constraints.
- Risks, blockers, open questions, and assumptions.
- Validation gates and how to verify each milestone.
- Checkpoint/update rules: when STATUS.md must be updated (via update_plan_status for incremental progress), when PLAN.md/SPEC.md need revision (via create_plan), and how LESSONS.md should be maintained (update_plan_status for incremental lessons, create_plan for substantial rewrites).
- Artifact paths and practical resume/update guidance. Because STATUS.md and LESSONS.md are created by default for non-trivial plans, normal users should not need to request separate status or lessons commands just to get that lifecycle context.

## Creating the visible plan response

Wrap the visible plan in <PLAN> and </PLAN> tags. The content inside should be markdown formatted (no code fences around the whole plan/spec). For example: <PLAN>\n# Plan\n- Item 1\n- Item 2\n</PLAN>.

For simple plans, keep the response short and backward-compatible: title/overview, requirements, notes, and relevant files are enough. For larger work, summarize the durable packet and include the Artifacts metadata section.

Do not include implementation code. Do not make source changes. Do not claim implementation is complete.
`,
).join('\n')}`
}

function buildPlanOnlyStepPrompt({}: {}) {
  return buildArray(
    `You are in plan mode. Do not make project source changes or call edit_transaction for implementation files. Do not use the write_todos tool in plan mode. Use bounded waves of analysis subagents until coverage is complete; there is no fixed total-agent limit. Basher and browser-use inherit runtime-enforced read-only authority in plan mode, and debugger is diagnosis-only. Preserve short-answer behavior for simple questions. For larger or otherwise non-trivial work, use create_plan to create or substantially rewrite the four durable plan artifacts under .agents/sessions/<slug>/ by default (SPEC.md, PLAN.md, STATUS.md, LESSONS.md); do not treat STATUS.md or LESSONS.md as optional/as-needed or wait for normal users to ask for them separately. Once those artifacts exist, prefer update_plan_status for incremental STATUS.md and LESSONS.md updates (progress, blockers, checkpoints, lessons) rather than rewriting them whole with create_plan; keep using create_plan for SPEC.md / PLAN.md edits and for creating any missing artifact. Wrap the visible markdown response in <PLAN>...</PLAN> unless answering a simple question directly.`,
  ).join('\n')
}

const definition = { ...createBase2('default'), id: 'base2' }
export default definition
