# Agents and Tools

## Install (SHA-256)

Pin GitHub Release **v0.6.0** and verify `SHA256SUMS`. Website `install.sh` / `install.ps1` abort on mismatch.

https://github.com/LinespottingOrg/GrokBuildRemote-Agents/releases/tag/v0.6.0
https://github.com/LinespottingOrg/GrokBuildRemote-Agents/blob/main/docs/PINNED-INSTALL.md

```
96cef605d3e030ccef99d27ea6240e0d3b668dd045e6b5b9e585c9fd03c6ef23  gbr-agent-darwin-amd64
de7e065ef2cf6877b3b2cd04679a67b627f876337f529247e236204543e4062c  gbr-agent-darwin-arm64
a50a5c41993e6531a3b477eb409ccc845212bf541384dc803061c80657f86719  gbr-agent-linux-amd64
5bfd22c7110234942c4c02ff8154b836d0af45a9422c178a4f52010187d40061  gbr-agent-linux-arm64
f773b89fd31310172b756e0593e0f3b2382b0a3440af2a7d0a8b3073b0c23e27  gbr-agent-windows-amd64.exe
8fb9efcbc7e2ac91c11964944bf0f45e31bb23f4356d9dcb4b305d7cb9b0fe8c  gbr-agent-windows-arm64.exe
```

```bash
VER=v0.6.0
BASE=https://github.com/LinespottingOrg/GrokBuildRemote-Agents/releases/download/$VER
# swap darwin-arm64 for your OS/arch
curl -fsSL -o gbr-agent-darwin-arm64 "$BASE/gbr-agent-darwin-arm64"
curl -fsSL -o SHA256SUMS "$BASE/SHA256SUMS"
shasum -a 256 -c SHA256SUMS --ignore-missing
gbr-agent pair && gbr-agent run
```


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

### Console-free terminal command broker

`run_terminal_command` separates process ownership from terminal UI ownership:

- `sdk/src/tools/run-terminal-command.ts` owns output buffering, timeouts,
  cancellation escalation, results, and process diagnostics. Headless SDK
  consumers use its direct process-group runner.
- Interactive hosts provide `terminalCommandBroker` in `CodebuffClientOptions`
  (or directly to `runTerminalCommand`). Each call synchronously starts an
  isolated helper and returns a handle for its complete process tree. A startup
  failure prevents the shell from running; there is no direct-console fallback.
- The CLI's tiny `src/entry.ts` handles private broker mode before importing
  React or OpenTUI. The detached, hidden helper receives one spawn request over
  stdin, starts the shell without a console or interactive stdin, relays only
  stdout/stderr pipes, and reports completion through a constrained one-shot
  file in the OS temp directory. It deliberately uses only the three standard
  stdio channels: Bun's custom child-process pipes can fail their Windows
  `node:net` handshake outside the `ChildProcess` error event and terminate the
  CLI as an unhandled rejection. The broker remains the process-group root and
  self-reaps the tree if its parent disappears, detected by polling the parent
  PID rather than holding another pipe open.
- Mouse and focus protocols stay enabled while commands run. The
  `TerminalProtocolController` only parses focus events; it has no command
  lifecycle state to synchronize or restore.

Thread the broker capability through every interactive command entry point.
Do not bypass it with a direct `spawn`, add command-active terminal state, or
fall back to the TUI process when broker startup fails.


## Build Remote Agent (phone pairing)

Freebuff can use [Build Remote Agent](https://grokbuildremote.com/) as a pairing device: a phone spectates (and can inject into) this desktop CLI through the free MIT `gbr-agent`. Protocol `gbr/1`. Phone is spectator + veto, not orchestrator.

Independent product by Linespotting AB. Not affiliated with xAI or SpaceX.


Attach only loopback Bot API `http://127.0.0.1:8788` or MCP stdio `gbr-mcp`. Never commit mailbox keys.

```bash
git clone https://github.com/LinespottingOrg/GrokBuildRemote-Agents.git
cd GrokBuildRemote-Agents/mcp/gbr-mcp && npm install
curl -sS http://127.0.0.1:8788/health
```

```json
{
  "mcpServers": {
    "gbr": {
      "command": "node",
      "args": ["GrokBuildRemote-Agents/mcp/gbr-mcp/bin/gbr-mcp.js"]
    }
  }
}
```

## What the phone sees

**Terminal windows** on this PC (machine-wide mailbox). Not headless OpenCode / CodeNomad sidecar / Electron. `:8788` in a sidecar is Bot API JSON, not a transcript.

https://github.com/LinespottingOrg/GrokBuildRemote-Agents/blob/main/docs/WHAT-THE-PHONE-SEES.md
https://grokbuildremote.com/integrations.html
