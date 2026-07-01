import { useEffect } from 'react'

import { bridge } from './lib/bridge'
import freebuffLogo from './components/freebuff-logo.svg'
import { ProjectPicker } from './components/ProjectPicker'
import { SettingsModal } from './components/SettingsModal'
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
  const pickerThreadId = useStore((s) => s.pickerThreadId)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  useSSE()
  useKeyboard()

  useEffect(() => {
    void init()
  }, [init])

  // Swallow file drags that miss the composer. Without this, dropping a file
  // anywhere else on the window makes Electron navigate the whole app to
  // `file:///…`, blowing away the session. The composer's own onDrop still runs
  // (it fires first, on a descendant) — this only kills the default navigation.
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  // Electron menu → tab commands (Cmd+T / Cmd+Shift+T / Cmd+W).
  useEffect(() => {
    const fb = bridge()
    if (!fb?.onMenuCommand) return
    return fb.onMenuCommand((name) => {
      const s = useStore.getState()
      if (name === 'new-tab') void s.newThread()
      else if (name === 'reopen-tab') s.rehydrateLast()
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
          {/* No open tab (first launch, or every tab closed). Show the wordmark
              plus an explicit way to open a folder — the ProjectPicker is
              otherwise only reachable from a tab's header, which doesn't exist
              yet, so without this the app dead-ends on a cold start. */}
          <div className="welcome">
            <img className="welcome-logo" src={freebuffLogo} alt="" />
            <button className="btn" onClick={() => setPickerOpen(true)}>
              Open a project folder
            </button>
          </div>
        </div>
      )}
      {pickerOpen && <ProjectPicker threadId={pickerThreadId} onClose={() => setPickerOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
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
