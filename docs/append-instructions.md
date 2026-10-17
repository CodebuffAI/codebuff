# Additive creation instructions

Hosts can set `FREEBUFF_APPEND_INSTRUCTIONS_FILE` to an absolute UTF-8 regular
file path on Linux or macOS. The CLI validates it before first client admission,
not at startup. A missing, unreadable, symlink, special, empty, invalid UTF-8,
NUL-containing or oversized file fails admission with a sanitized instruction
configuration error. The byte limit is 65536; input is not truncated. Windows
file input is unsupported and fails closed when configured. Unset is a no-op.

The process reads the file once, including caching failure. File/environment
changes and login/client resets do not refresh it: restart the process for a new
snapshot. SDK hosts can pass `appendInstructions: string` to `CodebuffClient`
or `run`. The same runtime content validation applies.

A fresh conversation adds this snapshot alongside project and home knowledge
under reserved key `host://append-instructions`. Native prompts, model selection,
tools and permissions remain intact. Default bundled Freebuff knowledge-aware
roots consume it; custom definitions omitting the knowledge placeholder do not.
This is not a universal custom-agent system-prompt override.

Later turns and native saved history keep the creation snapshot. Omitting the
option preserves it; identical explicit input is accepted without duplication.
Different input or adding it to preexisting unmarked history is rejected before
inference: start a new conversation. Compaction does not refresh instructions.
The text remains in ordinary local saved history and optional developer traces,
and is sent to the selected model. This is private host context, not a secret
store or memory-only API. Do not put credentials in it. Runtime failure reporting
omits prompt and message-history payloads when host instructions are configured;
this does not promise that model responses never echo instructions.

This public source change is not evidence that npm Freebuff 0.2.26 supports the
input. Qualification of a CI-built prerelease must identify its source and binary
hash independently of the private release source.
