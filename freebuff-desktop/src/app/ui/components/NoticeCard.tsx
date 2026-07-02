/**
 * Renders a `notice` part (core/parts.ts) — a structured, actionable callout the
 * engine emits when a turn fails in a way the user can fix, instead of a bare
 * "Turn failed: …" line. The `notice` kind picks the title + action row;
 * unknown kinds fall back to the text alone so old transcripts stay readable
 * even after a notice kind is retired.
 *
 * `claude-code-auth`: the local Claude Code CLI is signed out. Sign-in is an
 * interactive OAuth flow owned by the CLI (nothing we can drive headlessly), so
 * the card makes the terminal hand-off one-click: open Terminal (mac) and copy
 * the `claude /login` command.
 */

import { useState } from 'react'

import { useCopied } from '../hooks/useCopied'
import { bridge } from '../lib/bridge'
import { NOTICE_CLAUDE_CODE_AUTH, type NoticePart } from '../lib/types'
import { Icon } from './Icon'
import { Markdown } from './Markdown'

/** The command the user runs in their terminal to re-authenticate Claude Code. */
const CLAUDE_LOGIN_COMMAND = 'claude /login'

/** A pill button that copies `command` and flips to a checkmark on success. */
function CopyCommandButton({ command }: { command: string }) {
  const { copied, copy } = useCopied()
  return (
    <button className="btn notice-action" title="Copy command" onClick={() => copy(command)}>
      <Icon name={copied ? 'check' : 'copy'} />
      <code>{command}</code>
    </button>
  )
}

function ClaudeCodeAuthActions() {
  const b = bridge()
  // Opening Terminal.app is a mac affordance; elsewhere the copyable command
  // (plus the instructions in the body text) is the whole flow.
  const openTerminal = b?.platform === 'darwin' ? b.openTerminal : undefined
  // A failed open (Terminal.app missing/renamed) flips the button to say so —
  // otherwise the click would silently do nothing while looking functional.
  const [failed, setFailed] = useState(false)
  return (
    <div className="notice-actions">
      {openTerminal && (
        <button
          className="btn notice-action"
          disabled={failed}
          onClick={() => void openTerminal().then((ok) => setFailed(!ok))}
        >
          {failed ? "Couldn't open Terminal" : 'Open Terminal'}
        </button>
      )}
      <CopyCommandButton command={CLAUDE_LOGIN_COMMAND} />
    </div>
  )
}

export function NoticeCard({ part }: { part: NoticePart }) {
  const isClaudeAuth = part.notice === NOTICE_CLAUDE_CODE_AUTH
  return (
    <div className="notice-card">
      <div className="notice-title">
        <Icon name="alert" />
        {isClaudeAuth ? 'Claude Code is signed out' : 'Something needs your attention'}
      </div>
      <div className="notice-body">
        <Markdown text={part.text} />
      </div>
      {isClaudeAuth && <ClaudeCodeAuthActions />}
    </div>
  )
}
