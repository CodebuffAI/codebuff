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
 *
 * `freebuff-auth`: the Freebuff API rejected our sign-in (expired/revoked token,
 * or never signed in). The action starts the same device-code flow as the
 * tab bar's LoginGate; it hides once `authed` flips so a card in an old
 * transcript doesn't keep offering a sign-in that already happened.
 */

import { useState } from 'react'

import { useCopied } from '../hooks/useCopied'
import { bridge } from '../lib/bridge'
import { NOTICE_CLAUDE_CODE_AUTH, NOTICE_FREEBUFF_AUTH, type NoticePart } from '../lib/types'
import { useStore } from '../store/store'
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

/** Kicks off the device-code sign-in. A thin view over the store's shared
 *  login slice — the same flow the tab bar's LoginGate drives — so this button
 *  and the gate always show the same phase (and a reload rehydrates both). On
 *  success the server broadcasts a state event that flips `authed`, which
 *  unmounts this action row. The button stays clickable while waiting so a
 *  lost browser tab can be reopened. */
function FreebuffAuthActions() {
  const phase = useStore((s) => s.login.phase)
  const startLogin = useStore((s) => s.startLogin)
  return (
    <div className="notice-actions">
      <button
        className="btn notice-action"
        onClick={() => void startLogin()}
        disabled={phase === 'starting'}
      >
        {phase === 'waiting' ? 'Waiting for sign-in… (retry)' : 'Sign in to Freebuff'}
      </button>
    </div>
  )
}

const NOTICE_TITLES: Record<string, string> = {
  [NOTICE_CLAUDE_CODE_AUTH]: 'Claude Code is signed out',
  [NOTICE_FREEBUFF_AUTH]: 'Freebuff sign-in needed',
}

export function NoticeCard({ part }: { part: NoticePart }) {
  const authed = useStore((s) => s.freebuff?.authed)
  return (
    <div className="notice-card">
      <div className="notice-title">
        <Icon name="alert" />
        {NOTICE_TITLES[part.notice] ?? 'Something needs your attention'}
      </div>
      <div className="notice-body">
        <Markdown text={part.text} />
      </div>
      {part.notice === NOTICE_CLAUDE_CODE_AUTH && <ClaudeCodeAuthActions />}
      {/* `authed === false`, not `!authed`: store.freebuff is null until the
          first SSE state event, and a signed-in user reloading a transcript
          with an old card shouldn't flash an actionable sign-in button. */}
      {part.notice === NOTICE_FREEBUFF_AUTH && authed === false && <FreebuffAuthActions />}
    </div>
  )
}
