import { useEffect, useState } from 'react'

import { bridge } from './lib/bridge'
import freebuffLogo from './components/freebuff-logo.svg'
import { Icon } from './components/Icon'
import { useDismissable } from './hooks/useDismissable'
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
  const pickProject = useStore((s) => s.pickProject)
  const pendingInit = useStore((s) => s.pendingInit)
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
              plus an explicit way to open a folder — the folder chooser is
              otherwise only reachable from a tab's header, which doesn't exist
              yet, so without this the app dead-ends on a cold start. */}
          <div className="welcome">
            <img className="welcome-logo" src={freebuffLogo} alt="" />
            <button className="btn welcome-open" onClick={() => void pickProject()}>
              <Icon name="folder" />
              Open a project folder
            </button>
          </div>
        </div>
      )}
      {pendingInit && <InitRepoConfirm path={pendingInit.path} />}
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

/** Confirm dialog for a native-dialog pick that isn't a git repo yet: only git
 *  repositories can be opened, so offer to `git init` (+ initial commit) it. */
function InitRepoConfirm({ path }: { path: string }) {
  const confirmPendingInit = useStore((s) => s.confirmPendingInit)
  const cancelPendingInit = useStore((s) => s.cancelPendingInit)
  const [initing, setIniting] = useState(false)
  // Escape cancels (disabled while initializing); the backdrop handles clicks.
  useDismissable(!initing, null, cancelPendingInit, { escapeOnly: true })

  const confirm = async () => {
    setIniting(true)
    await confirmPendingInit() // clears pendingInit, unmounting this modal
  }

  return (
    <div className="modal-backdrop" onClick={() => !initing && cancelPendingInit()}>
      <div className="modal init-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="init-confirm-title">Initialize a git repository?</div>
        <p className="init-confirm-body">
          <code>{path}</code> isn’t a git repository yet. Freebuff will run{' '}
          <code>git init</code> and make an initial commit so it can open the
          folder.
        </p>
        <div className="init-confirm-actions">
          <button className="btn" disabled={initing} onClick={cancelPendingInit}>
            Cancel
          </button>
          <button className="btn save" disabled={initing} onClick={confirm}>
            {initing ? 'Initializing…' : 'Initialize with git'}
          </button>
        </div>
      </div>
    </div>
  )
}
