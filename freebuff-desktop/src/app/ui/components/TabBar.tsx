import { useStore } from '../store/store'
import { Icon } from './Icon'

const isMac = (window as any).freebuffDesktop?.platform === 'darwin'

export function TabBar() {
  const tabOrder = useStore((s) => s.tabOrder)
  const threads = useStore((s) => s.threads)
  const activeId = useStore((s) => s.activeId)
  const setActive = useStore((s) => s.setActive)
  const closeTab = useStore((s) => s.closeTab)
  const newThread = useStore((s) => s.newThread)
  const connection = useStore((s) => s.connection)

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
      <div className={`conn conn-${connection}`} title={`connection: ${connection}`} />
    </div>
  )
}
