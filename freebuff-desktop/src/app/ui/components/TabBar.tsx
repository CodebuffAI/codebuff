import { useRef, useState } from 'react'

import freebuffLogo from './freebuff-logo.svg'
import { useDismissable } from '../hooks/useDismissable'
import { bridge } from '../lib/bridge'
import { useStore } from '../store/store'
import { AccountMenu } from './AccountMenu'
import { Icon } from './Icon'
import { LoginGate } from './LoginGate'

const isMac = bridge()?.platform === 'darwin'

const CONN_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  open: 'Connected',
}

export function TabBar() {
  const tabOrder = useStore((s) => s.tabOrder)
  const threads = useStore((s) => s.threads)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const closeTab = useStore((s) => s.closeTab)
  const newThread = useStore((s) => s.newThread)
  const connection = useStore((s) => s.connection)
  // Boolean selector (not the whole freebuff object): the snapshot is rebuilt
  // with fresh identity on every state event, but this only changes when auth
  // actually flips. Null (state not loaded yet) counts as signed in — the
  // AccountMenu branch renders nothing then, so neither control flashes.
  const signedOut = useStore((s) => !!s.freebuff && !s.freebuff.authed)

  // Overflow menu: jump to any open tab when there are too many to scan.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismissable(menuOpen, menuRef, () => setMenuOpen(false))

  return (
    <div className={`tabbar ${isMac ? 'is-mac' : ''}`}>
      <div className="tabs">
        {tabOrder.map((id) => {
          const slice = threads[id]
          if (!slice) return null
          const status = describeTab(slice.thread)
          const untitled = !slice.thread.title
          return (
            <div
              key={id}
              className={`tab ${id === activeId ? 'active' : ''}`}
              onClick={() => setActive(id)}
              title={
                status.tooltip
                  ? `${untitled ? 'New thread' : slice.thread.title} — ${status.tooltip}`
                  : untitled
                    ? 'New thread'
                    : slice.thread.title
              }
            >
              <TabStatusIcon status={status} />
              <span className={`tab-title ${untitled ? 'untitled' : ''}`}>
                {untitled ? (
                  <img className="tab-glyph" src={freebuffLogo} alt="New thread" />
                ) : (
                  slice.thread.title
                )}
              </span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(id)
                }}
                title="Close tab (⌘W)"
              >
                <Icon name="x" />
              </button>
            </div>
          )
        })}
        <button className="tab-new" onClick={() => newThread()} title="New tab (⌘T)">
          <Icon name="plus" />
        </button>
      </div>

      {tabOrder.length > 1 && (
        <div className="tab-overflow" ref={menuRef}>
          <button
            className="tab-overflow-btn"
            onClick={() => setMenuOpen((o) => !o)}
            title="All tabs"
          >
            <Icon name="down" />
          </button>
          {menuOpen && (
            <div className="tab-menu">
              {tabOrder.map((id) => {
                const slice = threads[id]
                if (!slice) return null
                const status = describeTab(slice.thread)
                const untitled = !slice.thread.title
                return (
                  <button
                    key={id}
                    className={`tab-menu-item ${id === activeId ? 'active' : ''}`}
                    onClick={() => {
                      setActive(id)
                      setMenuOpen(false)
                    }}
                    title={
                      status.tooltip
                        ? `${untitled ? 'New thread' : slice.thread.title} — ${status.tooltip}`
                        : untitled
                          ? 'New thread'
                          : slice.thread.title
                    }
                  >
                    <TabStatusIcon status={status} />
                    <span className={`tab-menu-title ${untitled ? 'untitled' : ''}`}>
                      {untitled ? (
                        <img className="tab-glyph" src={freebuffLogo} alt="New thread" />
                      ) : (
                        slice.thread.title
                      )}
                    </span>
                    {status.label && <span className="tab-menu-status">{status.label}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className={`conn-status conn-${connection}`} title={CONN_LABEL[connection]}>
        <span className="conn-dot" />
        {connection !== 'open' && <span className="conn-label">{CONN_LABEL[connection]}</span>}
      </div>

      {/* Account is window-global (unlike the folder/agent picks in each
          thread's header below), so it sits on this row, far right — the
          sign-in pill while signed out, the profile icon once signed in. */}
      {signedOut ? (
        <div className="tabbar-login">
          <LoginGate />
        </div>
      ) : (
        <AccountMenu />
      )}
    </div>
  )
}

/**
 * Pick a single status for a thread to drive the tab icon. Order matters — the
 * running pulse wins over any PR/turn-outcome state, since "the agent is still
 * working" is the most time-sensitive read. PR state then overlays onto the
 * idle state because a merged PR is durable information the user wants to
 * keep seeing. Finally the last-turn outcome paints the most recent terminator
 * (stopped / error) on top so a fresh user message clears it on the next turn.
 */
type TabStatus =
  | { kind: 'running' }
  | { kind: 'pr-merged' }
  | { kind: 'pr-open' }
  | { kind: 'pr-closed' }
  | { kind: 'stopped' }
  | { kind: 'error' }
  | { kind: 'idle' }

/** Short status line used in the overflow menu. */
type TabStatusWithMeta = TabStatus & {
  label: string
  tooltip: string
}

function describeTab(thread: { turnState: string; prState: string; lastTurnOutcome: string | null }): TabStatusWithMeta {
  if (thread.turnState === 'running') {
    return { kind: 'running', label: 'Running', tooltip: 'Agent is running' }
  }
  if (thread.prState === 'merged') {
    return { kind: 'pr-merged', label: 'Merged', tooltip: 'PR merged' }
  }
  if (thread.prState === 'open') {
    return { kind: 'pr-open', label: 'PR open', tooltip: 'Pull request open' }
  }
  if (thread.prState === 'closed') {
    return { kind: 'pr-closed', label: 'PR closed', tooltip: 'PR closed without merge' }
  }
  if (thread.lastTurnOutcome === 'stopped') {
    return { kind: 'stopped', label: 'Stopped', tooltip: 'Last turn was stopped' }
  }
  if (thread.lastTurnOutcome === 'error') {
    return { kind: 'error', label: 'Error', tooltip: 'Last turn errored' }
  }
  return { kind: 'idle', label: '', tooltip: '' }
}

/**
 * The little shape at the start of each tab. Render shape (dot vs icon) plus a
 * class for color. Keeps the per-state branching in one place so the tab row
 * stays readable. `idle` renders nothing — a clean tab.
 */
function TabStatusIcon({ status }: { status: TabStatus }) {
  if (status.kind === 'running') {
    // The pulsing green dot is the one element every user already knows; keeping
    // the bare `.tab-pulse` class (no `.tab-icon-*` wrapper) keeps the existing
    // animation intact while still rendering consistently next to the other
    // tab icons — it's the same vertical slot the icon wrapper occupies.
    return <span className="tab-pulse" />
  }
  if (status.kind === 'idle') return null
  const iconName =
    status.kind === 'pr-merged'
      ? 'pr-merged'
      : status.kind === 'pr-open'
        ? 'pr-open'
        : status.kind === 'pr-closed'
          ? 'x'
          : status.kind === 'stopped'
            ? 'stop'
            : 'alert'
  return (
    <span className={`tab-icon tab-icon-${status.kind}`}>
      <Icon name={iconName} />
    </span>
  )
}
