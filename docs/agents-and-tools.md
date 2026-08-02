# Agents and Tools

## Agents

- Prompt/programmatic agents live in `.agents/` (programmatic agents use `handleSteps` generators).
- Generator functions execute in a sandbox; agent templates define tool access and subagents.

### Shell Shims

Direct commands without `codebuff` prefix:

```bash
codebuff shims install codebuff/base-lite@1.0.0
eval "$(codebuff shims env)"
base-lite "fix this bug"
```

## Tools

- Tool definitions live in `common/src/tools` and are executed via the SDK helpers + agent-runtime.

### Terminal command isolation

`run_terminal_command` deliberately separates process ownership from terminal
UI ownership:

- `sdk/src/tools/run-terminal-command.ts` owns the child process group, output,
  cancellation, escalation, and diagnostics. It does not know about OpenTUI.
- Interactive hosts can provide `terminalCommandIsolation` in
  `CodebuffClientOptions` (or directly to `runTerminalCommand`). Its `acquire()`
  method runs synchronously before `spawn` and returns an idempotent release
  lease. An acquisition failure prevents the command from starting.
- The CLI's `TerminalProtocolController` implements that capability. On Windows
  it suspends mouse and focus reports while any command lease is active, keeps
  keyboard input and rendering live, and restores the protocols only after the
  final command process tree exits. It also owns focus-event parsing so OpenTUI
  cannot independently restore terminal modes during isolation.

Do not add a process-global “command active” listener or write focus/mouse
escape sequences from another CLI hook. Those patterns recreate an ordering gap
between protocol suspension and process creation. Thread the isolation
capability explicitly through any new terminal-command entry point instead.
