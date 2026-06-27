import { useEffect, useRef, useState } from 'react'

import { useStore } from '../store/store'
import { AgentSelector } from './AgentSelector'
import { Icon } from './Icon'

const isMac = (window as any).freebuffDesktop?.platform === 'darwin'

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
  const costSpent = useStore((s) => s.usage.costSpent)

  // Overflow menu: jump to any open tab when there are too many to scan.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <div className={`tabbar ${isMac ? 'is-mac' : ''}`}>
      <div className="tabs">
        {tabOrder.map((id) => {
          const slice = threads[id]
          if (!slice) return null
          const running = slice.thread.turnState === 'running'
          return (
            <div
              key={id}
              className={`tab ${id === activeId ? 'active' : ''}`}
              onClick={() => setActive(id)}
              title={slice.thread.title}
            >
              {running && <span className="tab-pulse" />}
              <span className="tab-title">{slice.thread.title || 'New thread'}</span>
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
      <AgentSelector />

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
                return (
                  <button
                    key={id}
                    className={`tab-menu-item ${id === activeId ? 'active' : ''}`}
                    onClick={() => {
                      setActive(id)
                      setMenuOpen(false)
                    }}
                  >
                    {slice.thread.turnState === 'running' && <span className="tab-pulse" />}
                    <span className="tab-menu-title">{slice.thread.title || 'New thread'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {costSpent > 0 && (
        <span className="cost" title="Session spend across all threads">
          {formatCost(costSpent)}
        </span>
      )}

      <div className={`conn-status conn-${connection}`} title={CONN_LABEL[connection]}>
        <span className="conn-dot" />
        {connection !== 'open' && <span className="conn-label">{CONN_LABEL[connection]}</span>}
      </div>
    </div>
  )
}

/** Compact session-spend label: sub-cent shows more digits so it never reads $0.00. */
function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`
  if (cost >= 0.01) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(4)}`
}
