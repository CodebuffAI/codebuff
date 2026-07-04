import { useEffect, useRef, useState } from 'react'

import freebuffLogo from './freebuff-logo.svg'
import { useDismissable } from '../hooks/useDismissable'
import { bridge } from '../lib/bridge'
import type { QueueItem, Thread } from '../lib/types'
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
  // Tri-state auth: null (not known yet) counts as signed in — the
  // AccountMenu branch renders nothing then, so neither control flashes.
  const signedOut = useStore((s) => s.authed === false)

  // Overflow menu: jump to any open tab when there are too many to scan.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useDismissable(menuOpen, menuRef, () => setMenuOpen(false))

  return (
    <div className={`tabbar ${isMac ? 'is-mac' : ''}`}>
      {/* App-level stage label: a fixed marker (never scrolls with the tabs)
          setting the expectation that Freebuff Desktop is still stabilizing. */}
      <span
        className="beta-badge"
        title="Freebuff Desktop is in beta — expect rough edges and the occasional bug."
      >
        Beta
      </span>
      <div className="tabs">
        {tabOrder.map((id) => {
          const slice = threads[id]
          if (!slice) return null
          const { thread } = slice
          const activity = describeActivity(thread)
          const pr = describePr(thread)
          const queued = countQueued(slice.items)
          const untitled = !thread.title
          return (
            <div
              key={id}
              className={`tab ${id === activeId ? 'active' : ''}`}
              onClick={() => setActive(id)}
              title={tabTooltip(thread, activity, pr, queued)}
            >
              <TabStatusIcon activity={activity} />
              {thread.turnState === 'running' && thread.lastPromptAt != null && (
                <TabElapsed since={thread.lastPromptAt} />
              )}
              <span className={`tab-title ${untitled ? 'untitled' : ''}`}>
                {untitled ? (
                  <img className="tab-glyph" src={freebuffLogo} alt="New thread" />
                ) : (
                  thread.title
                )}
              </span>
              {queued > 0 && (
                <span className="tab-badge tab-queue" title={queuedTooltip(queued)}>
                  <Icon name="list" />
                  {queued}
                </span>
              )}
              {pr && <PrBadge pr={pr} prUrl={thread.prUrl} />}
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
                const { thread } = slice
                const activity = describeActivity(thread)
                const pr = describePr(thread)
                const queued = countQueued(slice.items)
                const untitled = !thread.title
                const statusLabel = menuStatusLabel(activity, pr, queued)
                return (
                  <button
                    key={id}
                    className={`tab-menu-item ${id === activeId ? 'active' : ''}`}
                    onClick={() => {
                      setActive(id)
                      setMenuOpen(false)
                    }}
                    title={tabTooltip(thread, activity, pr, queued)}
                  >
                    <TabStatusIcon activity={activity} />
                    <span className={`tab-menu-title ${untitled ? 'untitled' : ''}`}>
                      {untitled ? (
                        <img className="tab-glyph" src={freebuffLogo} alt="New thread" />
                      ) : (
                        thread.title
                      )}
                    </span>
                    {statusLabel && <span className="tab-menu-status">{statusLabel}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Connected is the normal state and gets no chrome; only surface a
          warning while the connection is down. */}
      {connection !== 'open' && (
        <div className={`conn-status conn-${connection}`} title={CONN_LABEL[connection]}>
          <Icon name="alert" className="conn-icon" />
          <span className="conn-label">{CONN_LABEL[connection]}</span>
        </div>
      )}

      {/* Account is window-global (unlike the folder/agent picks in each
          thread's header below), so it sits on this row, far right — the
          sign-in pill while signed out, the profile icon once signed in.
          With no tab open the welcome screen shows its own (sole) sign-in
          CTA, so the pill hides there to keep exactly one on screen. */}
      {signedOut ? (
        activeId && (
          <div className="tabbar-login">
            <LoginGate />
          </div>
        )
      ) : (
        <AccountMenu />
      )}
    </div>
  )
}

/**
 * The tab's leading icon answers "what is the agent doing": the running pulse,
 * an orange stop mark, or a red error mark. It's independent of the PR badge on
 * the trailing side — a stopped agent with an open PR shows both, where the old
 * single-slot icon let the PR state mask the stop.
 */
type TabActivity = {
  kind: 'running' | 'stopped' | 'error' | 'idle'
  label: string
  tooltip: string
}

function describeActivity(thread: {
  turnState: string
  lastTurnOutcome: string | null
}): TabActivity {
  if (thread.turnState === 'running') {
    return { kind: 'running', label: 'Running', tooltip: 'Agent is running' }
  }
  if (thread.lastTurnOutcome === 'stopped') {
    return { kind: 'stopped', label: 'Stopped', tooltip: 'Agent was running but stopped' }
  }
  if (thread.lastTurnOutcome === 'error') {
    return { kind: 'error', label: 'Error', tooltip: 'Last turn errored' }
  }
  return { kind: 'idle', label: '', tooltip: '' }
}

/** The trailing PR badge's view-model: glyph + color kind + `#123` when known. */
type PrStatus = {
  kind: 'open' | 'conflict' | 'merged' | 'closed'
  icon: string
  number: number | null
  label: string
  tooltip: string
}

function describePr(thread: Thread): PrStatus | null {
  const number = thread.prNumber
  const name = number != null ? `PR #${number}` : 'PR'
  switch (thread.prState) {
    case 'open':
      return { kind: 'open', icon: 'pr-open', number, label: `${name} open`, tooltip: `${name} open` }
    case 'conflict':
      return {
        kind: 'conflict',
        icon: 'pr-conflict',
        number,
        label: `${name} conflicts`,
        tooltip: `${name} has merge conflicts`,
      }
    case 'merged':
      return { kind: 'merged', icon: 'pr-merged', number, label: `${name} merged`, tooltip: `${name} merged` }
    case 'closed':
      return {
        kind: 'closed',
        icon: 'x',
        number,
        label: `${name} closed`,
        tooltip: `${name} closed without merge`,
      }
    default:
      return null
  }
}

function countQueued(items: QueueItem[]): number {
  return items.filter((i) => i.state === 'queued').length
}

function queuedTooltip(queued: number): string {
  return `${queued} queued prompt${queued === 1 ? '' : 's'}`
}

/** Hover text for the whole tab: title, then every at-a-glance fact in words. */
function tabTooltip(
  thread: Thread,
  activity: TabActivity,
  pr: PrStatus | null,
  queued: number,
): string {
  const parts = [thread.title || 'New thread']
  if (activity.tooltip) parts.push(activity.tooltip)
  if (pr) parts.push(pr.tooltip)
  if (queued > 0) parts.push(queuedTooltip(queued))
  return parts.join(' — ')
}

/** Compact right-aligned status text in the overflow menu. */
function menuStatusLabel(activity: TabActivity, pr: PrStatus | null, queued: number): string {
  const parts: string[] = []
  if (activity.label) parts.push(activity.label)
  if (pr) parts.push(pr.label)
  if (queued > 0) parts.push(`+${queued} queued`)
  return parts.join(' · ')
}

function TabStatusIcon({ activity }: { activity: TabActivity }) {
  if (activity.kind === 'running') {
    // The pulsing green dot is the one element every user already knows; keeping
    // the bare `.tab-pulse` class (no `.tab-icon-*` wrapper) keeps the existing
    // animation intact while still rendering consistently next to the other
    // tab icons — it's the same vertical slot the icon wrapper occupies.
    return <span className="tab-pulse" />
  }
  if (activity.kind === 'idle') return null
  return (
    <span className={`tab-icon tab-icon-${activity.kind}`} title={activity.tooltip}>
      <Icon name={activity.kind === 'stopped' ? 'stop' : 'alert'} />
    </span>
  )
}

/**
 * The PR chip: glyph + number, colored by lifecycle (green open, orange
 * conflicts, purple merged, grey closed). A real GitHub URL makes it a link
 * into the system browser. Rendered as a span (not a button) so it can live
 * inside the overflow menu's <button> rows without invalid nesting.
 */
function PrBadge({ pr, prUrl }: { pr: PrStatus; prUrl: string | null }) {
  const href = prUrl && /^https?:\/\//.test(prUrl) ? prUrl : null
  return (
    <span
      className={`tab-badge tab-pr tab-pr-${pr.kind} ${href ? 'linked' : ''}`}
      title={href ? `${pr.tooltip} — click to open` : pr.tooltip}
      onClick={
        href
          ? (e) => {
              e.stopPropagation()
              window.open(href, '_blank')
            }
          : undefined
      }
    >
      <Icon name={pr.icon} />
      {pr.number != null && <span className="tab-pr-num">#{pr.number}</span>}
    </span>
  )
}

/**
 * Ticking "time since my latest prompt" readout, shown only while the agent is
 * running (idle tabs answer that question with the stopped/error mark and the
 * transcript instead). It sits right after the running pulse so the pair reads
 * as one fact — "running for 4m" — with no icon of its own. One 1s interval
 * per running tab — a handful at most.
 */
function TabElapsed({ since }: { since: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="tab-elapsed" title="Time since your latest prompt">
      {formatElapsed(Date.now() - since)}
    </span>
  )
}

/** 42s → 3m → 1h 12m. Coarse on purpose — it's a glance, not a stopwatch. */
function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}
