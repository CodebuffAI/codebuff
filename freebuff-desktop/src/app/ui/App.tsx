import { useEffect } from 'react'

import { ProjectPicker } from './components/ProjectPicker'
import { TabBar } from './components/TabBar'
import { Workspace } from './components/Workspace'
import { useKeyboard } from './hooks/useKeyboard'
import { useSSE } from './hooks/useSSE'
import { useStore } from './store/store'

export function App() {
  const init = useStore((s) => s.init)
  const activeId = useStore((s) => s.activeId)
  const toasts = useStore((s) => s.toasts)
  const dismissToast = useStore((s) => s.dismissToast)
  const pickerOpen = useStore((s) => s.pickerOpen)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  useSSE()
  useKeyboard()

  useEffect(() => {
    void init()
  }, [init])

  // Electron menu → tab commands (Cmd+T / Cmd+Shift+T / Cmd+W).
  useEffect(() => {
    const fb = (window as any).freebuffDesktop
    if (!fb?.onMenuCommand) return
    return fb.onMenuCommand((name: string) => {
      const s = useStore.getState()
      if (name === 'new-tab') void s.newThread()
      else if (name === 'reopen-tab') s.reopenLast()
      else if (name === 'close-tab' && s.activeId) s.closeTab(s.activeId)
    })
  }, [])

  return (
    <div className="app">
      <TabBar />
      {activeId ? (
        <Workspace activeId={activeId} />
      ) : (
        <div className="workspace empty">
          <div className="welcome">
            <div className="welcome-title">No threads open</div>
            <div className="welcome-sub">Press ⌘T to start a new thread.</div>
          </div>
        </div>
      )}
      {pickerOpen && <ProjectPicker onClose={() => setPickerOpen(false)} />}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
