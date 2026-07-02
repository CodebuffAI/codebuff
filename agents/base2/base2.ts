import { buildArray } from '@codebuff/common/util/array'

import type {
  Base2ActiveWorkPhase,
  Base2ActiveWorkState,
  Base2WorkflowTodo,
  Base2WorkflowTodoProgress,
} from './gate-state'
import {
  buildBroadAuditSection,
  frontendSection,
  gateAwarenessSection,
  gitDisciplineSection,
  qualitySection,
  securityReviewSection,
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
    hasNoValidation = mode === 'fast',
    planOnly = false,
    executePlan = false,
    noAskUser = false,
    model: modelOverride,
    providerOptions,
  } = options ?? {}
  const isDefault = mode === 'default'
  const isFast = mode === 'fast'

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
      'read_subtree',
      'read_outline',
      !isFast && 'write_todos',
      'create_plan',
      'update_plan_status',
      'str_replace',
      'rewrite_symbol',
      'edit_transaction',
      'write_file',
      'propose_str_replace',
      'propose_write_file',
      'run_file_change_hooks',
      'suggest_followups',
      !noAskUser && 'ask_user',
      'skill',
      'set_output',
      'list_directory',
      'glob',
      'check_job',
      'kill_job',
      'read_logs',
      'git_status',
    ),
    spawnableAgents: buildArray(
      'file-picker',
      'code-searcher',
      'researcher-web',
      'researcher-docs',
      'basher',
      isDefault && 'thinker',
      isDefault && 'general-agent',
      isDefault && 'editor',
      'tmux-cli',
      'browser-use',
      'code-reviewer',
      'security-reviewer',
      'git-committer',
      'debugger',
      'doc-writer',
      'test-writer',
      'librarian',
      'context-pruner',
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
- **Be careful about terminal commands:** Be careful about instructing subagents to run terminal commands that could be destructive or have effects that are hard to undo (e.g. git push, git commit, running any scripts -- especially ones that could alter production environments (!), installing packages globally, etc). Don't run any of these effectful commands unless the user explicitly asks you to.
- **Do what the user asks:** If the user asks you to do something, even running a risky terminal command, do it.
- **Don't use set_output:** The set_output tool is for spawned subagents to report results. Don't use it yourself.
- **Images and screenshots:** If the user asks you to read or inspect local screenshot/image paths, use the read_image tool. Do not use read_files for image formats and do not claim you cannot view binary images when read_image is available.
- **Live visual verification:** For web app visual checks, start any long-running dev server through a BACKGROUND basher, keep its returned jobId, use check_job to wait for readiness, then spawn browser-use for screenshots/navigation/interaction.
- **Prefer dedicated harness tools over shell fallbacks:** Use git_status for repository status/diffs instead of basher. Use read_files/read_outline/read_subtree/glob/list_directory/query_index for file and codebase inspection instead of shelling out to cat/ls/find/grep/git status. Use basher for commands that do not have a dedicated tool, such as tests, builds, package scripts, and one-off project CLIs.

# Code Editing Mandates

- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code. Analyze surrounding code, tests, and configuration first.
- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate. Verify its established usage within the project (check imports, configuration files like 'package.json', 'Cargo.toml', 'requirements.txt', 'build.gradle', etc., or observe neighboring files) before employing it.
- **Style & Structure:** Mimic the style (formatting, naming), structure, framework choices, typing, and architectural patterns of existing code in the project.
- **Idiomatic Changes:** When editing, understand the local context (imports, functions/classes) to ensure your changes integrate naturally and idiomatically.
- **Simplicity & Minimalism:** You should make as few changes as possible to the codebase to address the user's request. Only do what the user has asked for and no more. When modifying existing code, assume every line of code has a purpose and is there for a reason. Do not change the behavior of code except in the most minimal way to accomplish the user's request.
- **Code Reuse:** Always reuse helper functions, components, classes, etc., whenever possible! Don't reimplement what already exists elsewhere in the codebase.
- **Front end development** We want to make the UI look as good as possible. Don't hold back. Give it your all.
    - Include as many relevant features and interactions as possible
    - Add thoughtful details like hover states, transitions, and micro-interactions
    - Apply design principles: hierarchy, contrast, balance, and movement
    - Create an impressive demonstration showcasing web development capabilities
-  **Refactoring Awareness:** Whenever you modify an exported symbol like a function or class or variable, you should find and update all the references to it appropriately by spawning a code-searcher agent.
-  **Testing:** If you create a unit test, you should run it to see if it passes, and fix it if it doesn't.
-  **Package Management:** When adding new packages, use the basher agent to install the package rather than editing the package.json file with a guess at the version number to use (or similar for other languages). This way, you will be sure to have the latest version of the package. Do not install packages globally unless asked by the user (e.g. Don't run \`npm install -g <package-name>\`). Always try to use the package manager associated with the project (e.g. it might be \`pnpm\` or \`bun\` or \`yarn\` instead of \`npm\`, or similar for other languages).
-  **Code Hygiene:** Make sure to leave things in a good state:
    - Don't forget to add any imports that might be needed
    - Remove unused variables, functions, and files as a result of your changes.
    - If you added files or functions meant to replace existing code, then you should also remove the previous code.
- **Don't type cast as "any" type:** Don't cast variables as "any" (or similar for other languages). This is a bad practice as it leads to bugs. Exception: when the value can truly be any type.
- **Prefer str_replace to write_file:** str_replace is more efficient for targeted changes and gives more feedback. Only use write_file for new files or when necessary to rewrite the entire file.
- **Prefer rewrite_symbol for whole-symbol edits:** To replace an entire function, class, method, or type, use rewrite_symbol with the symbol name and its full new body — it locates the exact definition from the syntax tree, so you don't copy the old text and the edit can't drift. Use str_replace for partial/in-body edits or files rewrite_symbol can't parse (it falls back with guidance).
- **Use edit_transaction for related edits:** When edits across multiple files, or multiple dependent edits in one file, must stay consistent, prefer edit_transaction so the runtime can preflight them together and apply them as an atomic client-side batch. Use structured operations like insert_import/remove_import for TypeScript import-only changes when available; use str_replace for simple one-file text changes.
- **Avoid broad scripted cleanups for refactors/renames:** For rename and overhaul tasks, prefer explicit targeted edits based on freshly read file content. Do not run one-off cleanup scripts across many files unless the user explicitly asks for that approach.

# Harness-enforced recovery workflow

When tools, tests, or reviewers report a failure, treat that feedback as the current source of truth and follow this state machine instead of continuing free-form edits:

1. **Failed edit circuit breaker:** If \`str_replace\` or \`write_file\` reports an error, do not retry an edit to that file from memory. First re-read the exact current file region with \`read_files\` (use \`ranges\` for large files), then make one minimal edit based on the fresh text.
2. **Stale-context guard:** Before editing a file after any intervening edit, failed edit, test failure, or reviewer comment involving that file, re-read the exact relevant lines. Do not rely on earlier snippets or mental snapshots.
3. **Atomic transaction recovery:** If \`edit_transaction\` aborts, no files changed. Re-read the failed file ranges named in the diagnostic, fix ambiguous \`oldString\` targets with a longer anchor or \`occurrenceIndex\`, then retry the whole related transaction rather than applying only the previously successful edits.
4. **Validation failure mode:** After a test/typecheck/lint failure, do not make broad or unrelated changes. Read the exact failure, read the exact source/test lines it references, explain the mismatch briefly, make one targeted fix, then rerun the same validation command.

5. **Reviewer blockers are blocking:** If a reviewer returns \`BLOCKING:\` or asks for a specific action (rerun tests, fix a case, revert a change, or inspect a file), treat that exact finding as the controlling next action. Copy or paraphrase the specific blocker into your todos/progress state, do that action next, and do not run another review, continue unrelated implementation, or finalize while it is unresolved. In the next review prompt, explicitly state the blocker you fixed and how you fixed it.
6. **Repeated reviewer blocker loop:** If a reviewer reports substantially the same blocker twice, stop and acknowledge the loop. Re-read the relevant code/test lines, make one targeted fix for that exact blocker, add or update a regression test when applicable, rerun the required validation, then request review once with the validation result and the exact blocker-resolution summary.
7. **Loop detection:** If the same edit or validation fails twice, stop the current approach. Summarize the current diff, the exact repeated failure, and the next deterministic action before proceeding.
8. **Parallelism discipline:** Parallelize context gathering, tests, and review only when they do not depend on each other. During a fragile debug/fix loop, run read → one edit → validation sequentially to avoid state drift.
9. **Validation/review join discipline:** A reviewer spawned in parallel with tests/typechecks can only provide static code review; it cannot know validation results that are still running. Do not treat parallel reviewer approval as final approval until validation has completed. If validation fails or times out, fix or rerun validation before finalizing, regardless of reviewer output. For fragile harness/editor changes, prefer running validation first, then run reviewer with the validation summary.

# Spawning agents guidelines

Use the spawn_agents tool to spawn specialized agents to help you complete the user's request.

- **Spawn multiple agents in parallel:** This increases the speed of your response **and** allows you to be more comprehensive by spawning more total agents to synthesize the best response.
- **Sequence agents properly:** Keep in mind dependencies when spawning different agents. Don't spawn agents in parallel that depend on each other.
- **Validation/reviewer coordination:** It is fine to run validation bashers and reviewers in parallel only when the reviewer is asked for static code review that explicitly does not depend on validation output. Always wait for both. Treat the final decision as a join of both results: validation failure/timeout blocks completion even if review looks good, and reviewer \`BLOCKING:\` blocks completion even if validation passes. When the review needs validation results, run validation first and include the completed validation summary in the reviewer prompt.
  ${buildArray(
    '- For broad codebase questions or tasks where relevant files are not already obvious, call query_index early yourself to get indexed file candidates, then verify the best candidates with read_files/read_subtree and/or spawn file-picker/code-searcher agents as needed. Use mode: \'commands\' for project scripts, CI, task runners, or validation-suite command discovery. Do not rely on query_index alone for correctness.',
    '- Spawn context-gathering agents (file pickers, code searchers, and web/docs researchers) before making edits. Use query_index, list_directory, and glob directly for searching and exploring the codebase.',
    isDefault &&
      '- Spawn the editor agent to implement the changes after you have gathered all the context you need.',
    isDefault &&
      '- Spawn the thinker after gathering context to solve complex problems or when the user asks you to think about a problem. Use the semantic agent name rather than model-specific variants.',
    '- Spawn bashers sequentially if the second command depends on the the first.',
    '- For a long-running or never-exiting process (dev server, build watcher, log tail), spawn a basher with params.process_type set to BACKGROUND: it returns a jobId immediately instead of blocking. Then call the check_job tool to poll new output and status, or to follow it (pass wait_for to block until a readiness/error pattern appears, with a timeout_seconds bound). Use kill_job when a background job is no longer needed. To watch an existing log file, start a BACKGROUND `tail -f <file>` and check_job it.',
    '- For local screenshots or other image files, call read_image with the image paths. Do not call read_files on image formats.',
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
  '- If a tool fails, try again, or try a different tool or approach.',
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
    : '[ You implement the changes using the str_replace or write_file tools ]'
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
${PLACEHOLDER.SYSTEM_INFO_PROMPT}

# Initial Git Changes

The following is the state of the git repository at the start of the conversation. Note that it is not updated to reflect any subsequent changes made by the user or the agents.

${PLACEHOLDER.GIT_CHANGES_PROMPT}

${qualitySection}

${frontendSection}

${gitDisciplineSection}

${securityReviewSection}
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

    handleSteps: function* ({ agentState, prompt, params }) {
      type Base2AgentState = NonNullable<typeof agentState> & {
        base2ActiveWork?: Base2ActiveWorkState
        canSuggestFollowups?: boolean
      }

      const mutableAgentState = (agentState ?? {}) as Base2AgentState
      const agentId = mutableAgentState.agentId
      const runValidationGate =
        typeof hasNoValidation === 'boolean'
          ? !hasNoValidation
          : agentId !== 'base2-fast' &&
            agentId !== 'base2-fast-no-validation'
      const runReviewerGate = runValidationGate
      const reviewerAgentType = 'code-reviewer'
      const MAX_REPAIR_ROUNDS = 3
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
        Object.prototype.hasOwnProperty.call(existingActiveWorkState, 'currentPhase')
      const activeWorkState =
        existingActiveWorkState ??
        {
          touchedFiles: [],
          changedFiles: [],
          pendingGateFiles: [],
          currentPhase: 'idle',
          latestWorkSummary: '',
          openReviewerBlockers: [],
          lastValidationSummary: '',
          nextRequiredAction: '',
          lastPinnedStateMessage: '',
          gatePassedFiles: [],
          gatePassedPendingFiles: [],
          gatePassedReviewerVerdict: '',
          gatePassedValidationSummary: '',
          gatePassedFingerprint: '',
          lastReviewerGateSkipReason: '',
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
      activeWorkState.latestWorkSummary ??= ''
      activeWorkState.lastValidationSummary ??= ''
      activeWorkState.nextRequiredAction ??= ''
      activeWorkState.lastPinnedStateMessage ??= ''
      activeWorkState.workflowTodoProgress = normalizeWorkflowTodoProgress(
        activeWorkState.workflowTodoProgress,
      )
      activeWorkState.touchedFiles = normalizeGateFileList(activeWorkState.touchedFiles)
      activeWorkState.changedFiles = normalizeGateFileList(activeWorkState.changedFiles)
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
      let currentConversationMessages: unknown = mutableAgentState.messageHistory
      if (shouldProactivelyQueryIndex(prompt)) {
        yield {
          toolName: 'query_index',
          input: {
            query: prompt,
            limit: 20,
          },
        }
      }

      const initialGitStatus = yield {
        toolName: 'git_status',
        input: {},
      } as any
      const initialGitStatusFiles = extractGitStatusFiles(
        (initialGitStatus as any)?.toolResult,
      ).filter((file) => !activeWorkState.gatePassedFiles.includes(file))
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
        // If the LLM step hit the step-cap guard (stepsRemaining <= 0), the turn
        // is over. Break out immediately instead of falling through to the
        // validation/reviewer gate: the gate would re-yield STEP, which would
        // re-trigger the step-cap (stepsRemaining is still 0), looping forever.
        if (hitStepCap) {
          activeWorkState.currentPhase = 'final_response_allowed'
          activeWorkState.nextRequiredAction =
            'Step cap reached; turn ended automatically. Summarize what was completed and suggest resuming on the next turn if work remains.'
          activeWorkState.latestWorkSummary =
            'Step-cap guard fired; agent turn ended automatically to prevent exceeding maxAgentSteps.'
          mutableAgentState.canSuggestFollowups = true
          markActiveWorkStateChanged()
          break
        }
        if (Array.isArray((stepResult as any)?.agentState?.messageHistory)) {
          currentConversationMessages = (stepResult as any).agentState.messageHistory
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
            recordChangedFiles([file])
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
          activeWorkState.gatePassedReviewerVerdict = conversationReviewerVerdict
          activeWorkState.gatePassedValidationSummary = conversationValidationSummary
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
          const durableReviewerVerdict = reviewerFinalizationVerdictFromDurablePass()
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
        if (
          staticReviewConcurrency &&
          !activeWorkState.staticReviewerJobId
        ) {
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
                    'Validation gate summary: Reviewer running concurrently with validation (static-review-only mode).',
                    '',
                    'Review after the validation gate above. The first visible token of your reply must be exactly BLOCKING:, NON_BLOCKING:, or LOOKS_GOOD: (text mode). If you prefer, you may also emit a single JSON object such as {"verdict":"BLOCKING"|"NON_BLOCKING"|"LOOKS_GOOD", "findings": ["..."]} — the orchestrator accepts either form.',
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
        let validationSummary = 'No file changes were detected, so no validation hooks ran.'
        if (editsHappened && runValidationGate) {
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
            activeWorkState.currentPhase = 'awaiting_review'
            markActiveWorkStateChanged()
          } else {
            const repairRound = activeWorkState.repairRoundCount ?? 0
            const parsed = parseValidationFailures(failures)
            const hasParseableFailures = parsed.some(
              (p) => p.file.length > 0,
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
              const repair = yield {
                toolName: 'spawn_agents',
                input: {
                  agents: [
                    {
                      agent_type: 'editor',
                      prompt: buildRepairEditorPrompt(
                        parsed,
                        Array.from(pendingGateFiles),
                      ),
                    },
                  ],
                },
              } as any
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
              } else {
                activeWorkState.nextRequiredAction =
                  'Fix the remaining validation hook failures before doing anything else.'
                activeWorkState.lastReviewerGateSkipReason = 'validation-hook-failures'
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
                        agent_type: 'editor',
                        prompt: buildEscalationEditorPrompt(
                          parsed,
                          Array.from(pendingGateFiles),
                          MAX_REPAIR_ROUNDS,
                        ),
                      },
                    ],
                  },
                } as any
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
                    (escalateVerify as any) && (escalateVerify as any).toolResult,
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
              activeWorkState.nextRequiredAction =
                'Fix the blocking validation hook failures before doing anything else.'
              activeWorkState.lastReviewerGateSkipReason = 'validation-hook-failures'
              activeWorkState.currentPhase = 'blocked'
              activeWorkState.latestWorkSummary = `Validation failed for pending files: ${Array.from(pendingGateFiles).join(', ') || '(unknown files)'}`
              markActiveWorkStateChanged()
              emitGateTelemetry({
                currentPhase: 'blocked',
                pendingFileCount: pendingGateFiles.size,
                pendingFiles: Array.from(pendingGateFiles),
                validationStatus: 'failed',
                skipReason: hasParseableFailures ? (activeWorkState.repairEscalationDone ? 'escalation-exhausted' : 'repair-budget-exhausted') : 'unparseable-failures',
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
        }

        let reviewerFinalizationVerdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | '' = ''
        if (runReviewerGate && editsHappened) {
          activeWorkState.lastReviewerGateSkipReason = ''
          markActiveWorkStateChanged()
          let reviewerToolResult: unknown
          if (
            staticReviewConcurrency &&
            activeWorkState.staticReviewerJobId
          ) {
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
                      `Validation gate summary: ${validationSummary}`,
                      '',
                      'Review after the validation gate above. The first visible token of your reply must be exactly BLOCKING:, NON_BLOCKING:, or LOOKS_GOOD: (text mode). If you prefer, you may also emit a single JSON object such as {"verdict":"BLOCKING"|"NON_BLOCKING"|"LOOKS_GOOD", "findings": ["..."]} — the orchestrator accepts either form.',
                    ].join('\n'),
                  },
                ],
              },
            } as any
            reviewerToolResult =
              (review as any) && (review as any).toolResult
          }
          const blockers = collectReviewerBlockers(reviewerToolResult)
          if (blockers.length > 0) {
            activeWorkState.openReviewerBlockers = blockers
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
                  `Reviewer gate: ${reviewerAgentType} returned blocking feedback. Resolve it before ending your turn:`,
                  '',
                  ...blockers,
                  '',
                  'Make the minimal required improvements, rerun validation as needed, then finish (review will run again).',
                ].join('\n'),
              },
              includeToolCall: false,
            } as any
            continue
          }
          reviewerFinalizationVerdict =
            getReviewerFinalizationVerdict(reviewerToolResult)
          if (!reviewerFinalizationVerdict) {
            // Distinguish a reviewer CRASH (agent itself errored / produced no
            // output) from a reviewer that ran successfully but failed to
            // begin its reply with LOOKS_GOOD/NON_BLOCKING/BLOCKING. The
            // operator-facing message differs because the recovery action
            // differs: a crash means "retry or escalate; the verdict is
            // unknown" whereas a no-verdict means "re-prompt for the
            // contract; the reviewer ran fine, it just used the wrong
            // format". Conflating them caused reviewer-loop bugs where the
            // model kept retrying the same prompt against a crashing agent.
            const reviewerCrash = detectReviewerCrash(reviewerToolResult)
            activeWorkState.currentPhase = 'blocked'
            if (reviewerCrash) {
              activeWorkState.nextRequiredAction =
                'Reviewer agent crashed; do NOT retry the same prompt blindly. Either retry once, escalate to a different reviewer, or proceed without the reviewer gate after recording the crash in STATUS.md.'
              markActiveWorkStateChanged()
              yield {
                toolName: 'add_message',
                input: {
                  role: 'user',
                  content: [
                    `Reviewer gate: ${reviewerAgentType} CRASHED (no usable verdict). The reviewer agent itself errored; its output cannot be trusted.`,
                    '',
                    `Crash detail: ${reviewerCrash}`,
                    '',
                    'Recovery: retry the reviewer once if the error looks transient (network/timeout). If it recurs, switch to a different reviewer agent or proceed without the reviewer gate and record the crash in STATUS.md. Do not silently loop on the same crashing prompt.',
                  ].join('\n'),
                },
                includeToolCall: false,
              } as any
            } else {
              activeWorkState.nextRequiredAction =
                'Clarify or resolve the reviewer gate result; reviewer did not return LOOKS_GOOD or NON_BLOCKING.'
              markActiveWorkStateChanged()
              yield {
                toolName: 'add_message',
                input: {
                  role: 'user',
                  content: [
                    `Reviewer gate: ${reviewerAgentType} ran but did not start with LOOKS_GOOD, NON_BLOCKING, or BLOCKING. Resolve or clarify before ending your turn:`,
                    '',
                    'The reviewer must begin its reply with one of those labels (text mode) or emit a {"verdict": ...} JSON object. Re-spawn the reviewer with that contract reminder.',
                  ].join('\n'),
                },
                includeToolCall: false,
              } as any
            }
            continue
          }
        }

        if (runValidationGate) {
          const passedPendingFiles = Array.from(pendingGateFiles)
          let activeWorkStateChanged = false
          if (
            passedPendingFiles.length > 0 &&
            reviewerFinalizationVerdict
          ) {
            activeWorkState.openReviewerBlockers = []
            pendingGateFiles.clear()
            activeWorkState.pendingGateFiles = []
            activeWorkState.latestWorkSummary = ''
            editsHappened = false
            for (const file of passedPendingFiles) {
              gatePassedFiles.add(file)
            }
            activeWorkState.gatePassedFiles = Array.from(gatePassedFiles)
            activeWorkState.gatePassedPendingFiles = passedPendingFiles
            activeWorkState.gatePassedReviewerVerdict = reviewerFinalizationVerdict
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
            activeWorkState.staticReviewerJobId = undefined
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
            reviewerStatus: passedPendingFiles.length > 0 ? 'passed' : 'skipped',
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
        opts?: { fromRepair?: boolean },
      ): void {
        const normalizedFiles = normalizeGateFileList(files)
        for (const file of normalizedFiles) {
          changedFiles.add(file)
          pendingGateFiles.add(file)
          gatePassedFiles.delete(file)
          activeWorkState.gatePassedFiles = activeWorkState.gatePassedFiles.filter(
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
        if (normalizedFiles.length > 0) {
          activeWorkState.lastReviewerGateSkipReason = ''
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

      function gateFileSetsEqual(left: string[], right: string[]): boolean {
        if (left.length !== right.length) return false
        const rightFiles = new Set(right)
        return left.every((file) => rightFiles.has(file))
      }

      function getConversationGatePassForPendingFiles(
        files: string[],
        messages: unknown,
      ):
        | { reviewerVerdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | '' }
        | undefined {
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

      function extractGateStateBlocksFromMessage(
        message: unknown,
      ): Array<{
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
        if (Array.isArray(record.content)) collectMessageText(record.content, out)
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
        if (state.openReviewerBlockers.length > 0) {
          sections.push(
            [
              'Open reviewer blockers/feedback (verbatim; controlling next action):',
              ...state.openReviewerBlockers.map((blocker) => blocker.trim()),
            ].join('\n'),
          )
        }
        if (state.pendingGateFiles.length > 0) {
          sections.push(
            `Pending validation/reviewer gate files: ${state.pendingGateFiles.join(', ')}`,
          )
        }
        if (state.lastValidationSummary && state.pendingGateFiles.length > 0) {
          sections.push(`Last validation summary: ${state.lastValidationSummary}`)
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
          ...sections,
        ].join('\n\n')
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
                typeof toolCall.toolCallId === 'string' ? toolCall.toolCallId : ''
              if (toolCallId) pendingToolCalls.set(toolCallId, todos)
            }
          }

          if (record.role !== 'tool') continue
          const toolName = typeof record.toolName === 'string' ? record.toolName : ''
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
          if (callTodos && toolCallSucceeded(record.content)) latestTodos = callTodos
        }

        return buildWorkflowTodoProgress(latestTodos)
      }

      function extractWorkflowTodosFromValue(value: unknown): Base2WorkflowTodo[] {
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
        if (Array.isArray(directTodos) && directTodos.some(isWorkflowTodoLike)) {
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
        const content = record.content ?? record.text ?? record.title ?? record.task
        return typeof content === 'string' ? content.trim() : ''
      }

      function getWorkflowTodoStatus(record: Record<string, unknown>): string {
        const status = record.status ?? record.state
        if (typeof status === 'string') return status.trim().toLowerCase()
        if (record.completed === true || record.done === true) return 'completed'
        if (record.completed === false || record.done === false) return 'pending'
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
        if (record.success === false || 'error' in record || 'errorMessage' in record) {
          return false
        }
        if (record.success === true) return true
        if (typeof record.message === 'string') {
          // Only trust the success-verb regex when the message does not itself
          // contain a failure indicator, otherwise messages like "No updates
          // were saved" would false-positive on "saved".
          if (/\b(failed|failure|unable|could not|cannot|did not|was not|were not|skipped|no[- ]op|no changes|error)\b/i.test(record.message)) {
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
              const toolName =
                typeof toolCall.toolName === 'string' ? toolCall.toolName : ''
              if (toolCall.type === 'tool-call' && isFileChangingTool(toolName)) {
                collectToolInputFiles(toolCall.input, out)
              }
            }
            continue
          }

          const toolName =
            typeof record.toolName === 'string' ? record.toolName : ''
          if (record.role === 'tool' && isFileChangingTool(toolName)) {
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
        const toolName =
          typeof record.toolName === 'string'
            ? record.toolName
            : typeof record.cb_tool_name === 'string'
              ? record.cb_tool_name
              : ''
        const input = record.input
        if (isFileChangingTool(toolName)) {
          collectToolInputFiles(input, out)
        }
        if (typeof record.file === 'string' && hasEditArtifact(record)) {
          out.add(record.file)
        }
        if (Array.isArray(record.changedFiles)) {
          for (const file of record.changedFiles) {
            if (typeof file === 'string') out.add(file)
          }
        }
        if (typeof record.path === 'string' && hasEditArtifact(record)) {
          out.add(record.path)
        }
        for (const nested of Object.values(record)) {
          if (nested !== input) visitToolValue(nested, out)
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
        if (
          typeof record.unifiedDiff === 'string' ||
          typeof record.diff === 'string' ||
          typeof record.patch === 'string'
        ) {
          return true
        }
        if (record.success === true) return true
        if (record.success === false || 'error' in record || 'errorMessage' in record) {
          return false
        }
        if (typeof record.message !== 'string') return false
        // Only trust the success-verb regex when the message does not itself
        // contain a failure indicator, otherwise messages like "No edits were
        // applied" would false-positive on "applied".
        if (/\b(failed|failure|unable|could not|cannot|did not|was not|were not|skipped|no[- ]op|no changes|error)\b/i.test(record.message)) {
          return false
        }
        return /\b(success|successful|applied|wrote|written|edited|replaced)\b/i.test(
          record.message,
        )
      }

      function extractGitStatusFiles(toolResult: unknown): string[] {
        const files = new Set<string>()
        if (!Array.isArray(toolResult)) return []
        for (const part of toolResult) {
          const value =
            part && (part as any).type === 'json' ? (part as any).value : undefined
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
            part && (part as any).type === 'json' ? (part as any).value : undefined
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
        const sorted = [...files].sort()
        const parts = sorted.map((file) => {
          const statusLine = statusLines.get(file) ?? ''
          const contentMarker = readGateFileContentMarker(file)
          return `${file}\t${statusLine}\t${contentMarker}`
        })
        return `v2\n${parts.join('\n')}\n--\n${validationSummary}`
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
          crypto = getBuiltinModule('node:crypto') as typeof import('node:crypto')
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
          const markerCache =
            (readGateFileContentMarker as unknown as {
              cache?: Map<string, string>
            }).cache
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
        return renameTarget?.trim() ?? ''
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
              part && (part as any).type === 'json'
                ? (part as any).value
                : part
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
            const findings = entry.findings.length > 0 ? entry.findings : ['(no findings provided)']
            for (const finding of findings) {
              structuredBlockers.push(`BLOCKING: ${finding}`)
            }
          }
          if (entry.coverage === 'missing') {
            structuredBlockers.push(
              'BLOCKING: test coverage missing for changed behavior (add a case to the relevant *.test.ts)',
            )
          }
        }
        if (structuredBlockers.length > 0) return structuredBlockers

        const texts: string[] = []
        collectStrings(toolResult, texts)
        return texts
          .map((text) => stripReviewerPreamble(text))
          .filter((text) => hasReviewerLineVerdict(text, 'BLOCKING'))
      }

      // Distinguishes reviewer-agent crashes (errorMessage / type === 'error')
      // from a reviewer that ran but emitted no recognizable verdict. Inline
      // mirror of detectReviewerCrash in agents/base2/gate-reviewer.ts.
      function detectReviewerCrash(toolResult: unknown): string | null {
        return findReviewerCrash(toolResult)
      }
      function findReviewerCrash(value: unknown, depth: number = 0): string | null {
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
        if (typeof record.errorMessage === 'string' && record.errorMessage.trim()) {
          return record.errorMessage.trim()
        }
        if (record.type === 'error' && typeof record.message === 'string') {
          return record.message.trim() || 'reviewer agent reported an unspecified error'
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
        // Structured reviewer outputs take precedence so text-mode fallbacks
        // do not accidentally override an explicit JSON verdict.
        const structured = collectStructuredReviewerOutputs(toolResult)
        if (structured.some((entry) => entry.coverage === 'missing')) {
          return ''
        }
        for (const entry of structured) {
          if (entry.verdict === 'LOOKS_GOOD') return 'LOOKS_GOOD'
          if (entry.verdict === 'NON_BLOCKING') return 'NON_BLOCKING'
        }

        const texts: string[] = []
        collectStrings(toolResult, texts)
        for (const text of texts) {
          const normalized = stripReviewerPreamble(text)
          if (hasReviewerLineVerdict(normalized, 'LOOKS_GOOD')) return 'LOOKS_GOOD'
          if (hasReviewerLineVerdict(normalized, 'NON_BLOCKING')) return 'NON_BLOCKING'
          if (/\breviewer gate passed\s*(?:with\s+|\(\s*)LOOKS_GOOD\b/i.test(normalized)) {
            return 'LOOKS_GOOD'
          }
          if (/\breviewer gate passed\s*(?:with\s+|\(\s*)NON_BLOCKING\b/i.test(normalized)) {
            return 'NON_BLOCKING'
          }
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
      function collectStructuredReviewerOutputs(
        value: unknown,
      ): Array<{
        verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING'
        findings: string[]
        coverage?: 'covered' | 'missing' | 'n/a'
      }> {
        const out: Array<{
          verdict: 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING'
          findings: string[]
          coverage?: 'covered' | 'missing' | 'n/a'
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
                }
              }
            }
            let coverage: 'covered' | 'missing' | 'n/a' | undefined
            const rawCoverage = record.coverage
            if (typeof rawCoverage === 'string') {
              const lower = rawCoverage.trim().toLowerCase()
              if (lower === 'covered' || lower === 'missing' || lower === 'n/a') {
                coverage = lower
              }
            }
            out.push({ verdict: upper as 'LOOKS_GOOD' | 'NON_BLOCKING' | 'BLOCKING', findings, coverage })
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
            return (statusHook as any).message
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

      function extractHookResults(toolResult: unknown): Record<string, unknown>[] {
        const hooks: Record<string, unknown>[] = []
        if (!Array.isArray(toolResult)) return hooks
        for (const part of toolResult) {
          const value =
            part && (part as any).type === 'json' ? (part as any).value : undefined
          if (!Array.isArray(value)) continue
          for (const hook of value) {
            if (hook && typeof hook === 'object') hooks.push(hook as Record<string, unknown>)
          }
        }
        return hooks
      }

      // Mirrors of `agents/base2/gate-repair.ts`. Kept inline because
      // `handleSteps` is serialized via `toString()` + `new Function(...)`
      // and cannot reference module-scope imports at reconstruction time.
      // `agents/__tests__/gate-repair-parity.test.ts` enforces parity.
      function parseValidationFailures(
        failures: string[],
      ): {
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
          const prefixMatch = raw.match(/^\-\s+(\S+)\s+failed\s+\(exit\s+\d+\):\s*\n?/)
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

      function shouldProactivelyQueryIndex(value: unknown): value is string {
        if (typeof value !== 'string') return false
        const text = value.trim()
        if (text.length < 12) return false
        if (/^(hi|hello|hey|thanks|thank you|ok|okay)$/i.test(text)) return false
        return /\b(code|file|files|repo|repository|project|codebase|workspace|module|package|function|class|component|hook|api|schema|config|test|tests|implement|fix|debug|refactor)\b/i.test(text)
      }
    },
  }
}

const EXPLORE_PROMPT = `- Iteratively gather codebase context as needed. For broad codebase questions or tasks where relevant files are not already obvious, call query_index early yourself to get indexed file candidates. Use mode: 'explain' when you need ranking rationale, mode: 'neighbors' to expand around a known file, mode: 'path' to connect two known files, and mode: 'commands' to find package scripts, CI workflows, task runners, and validation docs. Then verify the best candidates, matchedSnippets, and relatedFiles with read_files/read_subtree and/or spawn file pickers, code searchers, bashers, and web/docs researchers as needed. Use query_index, list_directory, and glob directly for searching and exploring the codebase; do not substitute basher for git status or file discovery when dedicated tools are available. The file-picker and code-searcher agents are very useful for cross-checking and finding additional relevant files -- try spawning multiple in parallel (say, 2-5 file-pickers + 1-3 code-searchers) to explore different parts of the codebase. Use read_subtree if you need to grok a particular part of the codebase. For a large file, call read_outline first to see its structure (functions/classes/methods with line ranges, works across languages), then read_files with a symbols selector to pull just the specific symbols you need instead of the whole file. Read all the relevant files using the read_files tool.`

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
    'After getting context on the user request from the codebase or from research, use the ask_user tool to ask the user for important clarifications on their request or alternate implementation strategies. You should skip this step if the choice is obvious -- only ask the user if you need their help making the best choice.',
  isDefault &&
    `- For any task requiring 3+ steps, use the write_todos tool to write out your step-by-step implementation plan. Include ALL of the applicable tasks in the list.${isFast ? '' : ' You should include a step to review the changes after you have implemented the changes.'}:${hasNoValidation ? '' : ' You should include at least one step to validate/test your changes: be specific about whether to typecheck, run tests, run lints, etc.'} You may be able to do reviewing and validation in parallel in the same step. Skip write_todos for simple tasks like quick edits or answering questions.`,
  isDefault &&
    `- For quick problems, briefly explain your reasoning to the user. If you need to think longer, write your thoughts within the <think> tags. Finally, for complex problems, spawn the thinker agent to help find the best solution.`,
  isDefault &&
    `- IMPORTANT: Before spawning the editor agent for non-trivial changes, prepare a compact implementation brief and pass it as the editor prompt. The editor does not inherit parent conversation history, so the prompt must be a self-contained envelope with these labeled fields (use these exact headings as a compact checklist; omit a field only when truly N/A):
    - Requirements: the user-facing requirement and acceptance criteria the editor must satisfy.
    - Target files: explicit project-relative paths the editor should edit (and any nearby files it must read first to avoid drift).
    - Constraints/non-goals: invariants to preserve, public behavior to keep stable, scope boundaries the editor must not cross.
    - Patterns: existing code/style conventions and idioms in the codebase the change must follow.
    - Risks: code-level edge cases, fragile call sites, or refactoring traps the editor should watch for.
    If you cannot state the concrete implementation task, target files, and constraints yet, gather more context instead of spawning the editor. Do not include parent-only work such as validation commands, terminal/shell cleanup, deleting files, visual smoke tests, code review, git operations, todos, or post-edit orchestration steps. After the editor returns, handle those parent-only responsibilities yourself.`,
  isFast &&
    '- Implement the changes using the str_replace or write_file tools. Implement all the changes in one go.',
  isFast &&
    '- Do a single typecheck targeted for your changes at most (if applicable for the project). Or skip this step if the change was small.',
  !hasNoValidation &&
    `- For non-trivial changes, test them by running appropriate validation commands for the project (e.g. typechecks, tests, lints, etc.). Try to run all appropriate commands in parallel. If you can, only test the area of the project that you are editing, rather than the entire project. You may have to explore the project to find the appropriate commands. Don't skip this step, unless the change is very small and targeted (< 10 lines and unlikely to have a type error)!`,
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
    '',
    'Keep STATUS.md and LESSONS.md current throughout execution. Prefer update_plan_status for incremental STATUS.md / LESSONS.md updates; use create_plan for SPEC.md / PLAN.md revisions, substantial rewrites, or creating missing artifacts. PLAN mode remains plan-only, but EXECUTE_PLAN is allowed to edit project source to complete the plan.',
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
    isDefault &&
      `For non-trivial edits, spawn the editor with a compact implementation-only prompt containing all of these envelope fields: Requirements, Target files, Constraints/non-goals, Patterns, Risks. Use those exact field labels in the prompt so the editor can scan them as a checklist. The editor does not inherit parent conversation history, so the prompt must contain the implementation context it needs. If you cannot state the concrete implementation task, target files, and constraints yet, gather more context instead of spawning the editor. Do not put validation commands, terminal/shell cleanup, deletion requests, visual smoke tests, code review, git operations, todos, or other parent-only orchestration tasks in the editor handoff. After the editor returns, the default runtime will independently detect changed files, run configured validation hooks, and spawn code-reviewer before finalization.`, 
    `After completing the user request, summarize your changes in a sentence${isFast ? '' : ' or a few short bullet points'}.`,
    isDefault &&
      'Do not manually spawn code-reviewer for the same edited file set that the automated runtime gate will review. Manual review is only for user-requested extra review or pre-edit/advisory review.',
    isDefault &&
      'After the automated validation/reviewer gate has passed for edited code, call suggest_followups with around 3 useful next steps if that tool is available. If suggest_followups is unavailable, do not let that block the final summary/end.',
  ).join('\n')
}

function buildExecutePlanStepPrompt({}: {}) {
  return buildArray(
    'You are in EXECUTE_PLAN mode. Execute or resume durable plan artifacts, using the project source editing tools when implementation work is required. Unlike PLAN mode, you may edit project source files to complete planned tasks.',
    'Treat SPEC.md, PLAN.md, STATUS.md, and LESSONS.md under the durable plan session as authoritative. Use any artifact contents already present in the conversation as the initial source of truth, confirm the next incomplete or blocked item from that context, and read artifacts directly only when contents are missing, truncated, stale, or have changed. Do not repeatedly re-read unchanged artifacts or source files after confirming the next item; continue from it unless the artifacts say completed work must be revisited.',
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

Also include the artifact metadata inside the <PLAN> response so the CLI can render resume commands. Use simple markdown lines like:

## Artifacts
- Session: .agents/sessions/<slug>
- SPEC.md: .agents/sessions/<slug>/SPEC.md
- PLAN.md: .agents/sessions/<slug>/PLAN.md
- STATUS.md: .agents/sessions/<slug>/STATUS.md
- LESSONS.md: .agents/sessions/<slug>/LESSONS.md

The plan packet should be resumable across days. Include:
- Overview and requirements.
- Milestones/tasks with explicit statuses (todo/in progress/done/blocked).
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
    `You are in plan mode. Do not make project source changes. Do not call normal editing tools such as write_file, str_replace, replace_range, rewrite_symbol, or edit_transaction for implementation files. Do not use the write_todos tool in plan mode. Preserve short-answer behavior for simple questions. For larger or otherwise non-trivial work, use create_plan to create or substantially rewrite the four durable plan artifacts under .agents/sessions/<slug>/ by default (SPEC.md, PLAN.md, STATUS.md, LESSONS.md); do not treat STATUS.md or LESSONS.md as optional/as-needed or wait for normal users to ask for them separately. Once those artifacts exist, prefer update_plan_status for incremental STATUS.md and LESSONS.md updates (progress, blockers, checkpoints, lessons) rather than rewriting them whole with create_plan; keep using create_plan for SPEC.md / PLAN.md edits and for creating any missing artifact. Wrap the visible markdown response in <PLAN>...</PLAN> unless answering a simple question directly.`,
  ).join('\n')
}

const definition = { ...createBase2('default'), id: 'base2' }
export default definition
