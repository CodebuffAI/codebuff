import { useEffect, useState } from 'react'

import { bridge } from '../lib/bridge'
import { useDismissable } from '../hooks/useDismissable'
import { api } from '../lib/api'
import { useStore } from '../store/store'
import type { BrowseResult } from '../lib/types'
import { Icon } from './Icon'

/** Last path segment — shown as the "name" of a recent entry. Falls back to the
 *  full path string if there is no segment to extract (root / unusual paths). */
function tailName(path: string): string {
  const m = /[^/\\]+$/.exec(path)
  return m ? m[0] : path
}

/**
 * Folder-picker modal. Browses the local filesystem via /api/fs/list (no native
 * OS dialog — the bridge doesn't expose one) and points a tab at the chosen git
 * repo. A folder is openable only when it's a git repo. A "Recents" section sits
 * at the top so returning users can skip the folder drill-down.
 *
 * With `threadId`, the pick changes that tab's directory (re-homing an unstarted
 * tab in place, else opening a new tab). Without one, it opens a new tab in the
 * chosen project.
 */
export function ProjectPicker({
  onClose,
  threadId,
}: {
  onClose: () => void
  threadId?: string | null
}) {
  const newThread = useStore((s) => s.newThread)
  const changeTabDirectory = useStore((s) => s.changeTabDirectory)
  const recentProjects = useStore((s) => s.recentProjects)
  // Browse starts at the tab's current repo (changing a tab) or the most-recent
  // project (opening a new tab), so the relevant folder is one click away.
  const startPath = useStore(
    (s) => (threadId && s.threads[threadId]?.thread.projectPath) || s.recentProjects[0] || '',
  )
  const refreshRecents = useStore((s) => s.refreshRecents)
  const pushToast = useStore((s) => s.pushToast)
  const [listing, setListing] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState(false)
  const [openingRecent, setOpeningRecent] = useState<string | null>(null)
  // Escape closes the modal; the backdrop already handles outside clicks.
  useDismissable(true, null, onClose, { escapeOnly: true })

  const load = (path?: string) => {
    setLoading(true)
    api
      .browse(path)
      .then(setListing)
      .finally(() => setLoading(false))
  }

  // Opening a new project starts at Home — familiar, and avoids landing in
  // whatever transient dir the last project happened to live in. Changing an
  // existing tab's folder starts next to its current repo so the sibling repo
  // is one click away. `load(undefined)` browses the home directory.
  useEffect(() => {
    const start =
      threadId && startPath
        ? startPath.replace(/[/\\][^/\\]+$/, '')
        : undefined
    load(start || undefined)
  }, [])

  // Recents may not be ready yet when this modal first mounts after `init`.
  // Fetch on mount so opening the picker cold still shows the list immediately.
  useEffect(() => {
    void refreshRecents()
  }, [refreshRecents])

  // Hide the tab's current project from Recents — re-picking it is a no-op.
  const visibleRecents = recentProjects.filter((p) => p !== startPath)

  // Point the tab at `path` (re-home or new tab); errors surface as toasts.
  const pick = async (path: string) => {
    if (threadId) await changeTabDirectory(threadId, path)
    else await newThread(path)
    onClose()
  }

  const open = async (path: string) => {
    setOpening(true)
    await pick(path)
    setOpening(false)
  }

  // Native OS folder chooser (Electron only) — the fastest way to reach a repo
  // anywhere on disk without drilling the in-app tree. Falls through to the
  // normal open flow, which validates that the pick is a git repo.
  const canBrowseNative = !!bridge()?.pickDirectory
  const browseNative = async () => {
    const picked = await bridge()?.pickDirectory()
    if (!picked) return
    // The native dialog can return any folder; if it isn't a repo, offer to
    // initialize it rather than failing.
    const info = await api.browse(picked)
    if (info.isRepo) await open(picked)
    else setPendingInit(picked)
  }

  // A non-repo folder awaiting the user's confirmation to `git init` it.
  const [pendingInit, setPendingInit] = useState<string | null>(null)
  const [initing, setIniting] = useState(false)

  const confirmInit = async () => {
    if (!pendingInit) return
    setIniting(true)
    const r = await api.initRepo(pendingInit)
    setIniting(false)
    if (!r.ok) {
      pushToast(`Couldn't initialize repo: ${r.error ?? 'unknown error'}`, 'error')
      setPendingInit(null)
      return
    }
    const path = pendingInit
    setPendingInit(null)
    await open(path)
  }

  const openRecent = async (path: string) => {
    setOpeningRecent(path)
    await pick(path)
    setOpeningRecent(null)
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">{threadId ? "Change this tab’s folder" : 'Open a project folder'}</span>
          <div className="picker-head-actions">
            {canBrowseNative && (
              <button className="btn" onClick={browseNative} disabled={opening} title="Choose a folder with the system dialog">
                Browse…
              </button>
            )}
            <button className="head-btn" onClick={onClose} title="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>

        {visibleRecents.length > 0 && (
          <div className="picker-recents">
            <div className="recents-head">Recents</div>
            <div className="recents-list">
              {visibleRecents.map((p) => (
                <button
                  key={p}
                  className="recent-row"
                  disabled={openingRecent !== null}
                  onClick={() => openRecent(p)}
                  title={p}
                >
                  <Icon name="folder" />
                  <span className="recent-name">{tailName(p)}</span>
                  <span className="recent-path">{p}</span>
                  {openingRecent === p && <span className="recent-spin" />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="picker-path">
          <button
            className="head-btn"
            disabled={!listing?.parent}
            onClick={() => listing?.parent && load(listing.parent)}
            title="Parent folder"
          >
            <Icon name="left" />
          </button>
          <button
            className="btn"
            onClick={() => load()}
            title="Go to your home folder"
          >
            Home
          </button>
          <span className="picker-cwd" title={listing?.path}>
            {listing?.path ?? '…'}
          </span>
          {listing?.isRepo ? (
            <button className="btn open-here" disabled={opening} onClick={() => open(listing.path)}>
              Open this folder
            </button>
          ) : (
            listing && (
              <button
                className="btn open-here"
                disabled={opening || initing}
                onClick={() => setPendingInit(listing.path)}
                title="git init this folder, then open it"
              >
                Initialize git here
              </button>
            )
          )}
        </div>

        <div className="picker-list">
          {loading && <div className="lane-empty">Loading…</div>}
          {!loading && listing?.entries.length === 0 && (
            <div className="lane-empty">No subfolders here.</div>
          )}
          {!loading &&
            listing?.entries.map((e) => (
              <div key={e.path} className={`picker-row ${e.isRepo ? 'repo' : ''}`}>
                <button className="picker-nav" onClick={() => load(e.path)} title="Open folder">
                  <Icon name="folder" />
                  <span className="picker-name">{e.name}</span>
                </button>
                {e.isRepo && (
                  <button className="btn" disabled={opening} onClick={() => open(e.path)}>
                    Open
                  </button>
                )}
              </div>
            ))}
        </div>

        <div className="picker-foot">
          Only git repositories can be opened — pick a non-repo folder and Freebuff will offer to initialize it.
        </div>
        </div>
      </div>

      {pendingInit && (
        <div
          className="modal-backdrop"
          onClick={() => !initing && setPendingInit(null)}
        >
          <div className="modal init-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="init-confirm-title">Initialize a git repository?</div>
            <p className="init-confirm-body">
              <code>{pendingInit}</code> isn’t a git repository yet. Freebuff will
              run <code>git init</code> and make an initial commit so it can open
              the folder.
            </p>
            <div className="init-confirm-actions">
              <button className="btn" disabled={initing} onClick={() => setPendingInit(null)}>
                Cancel
              </button>
              <button className="btn save" disabled={initing} onClick={confirmInit}>
                {initing ? 'Initializing…' : 'Initialize with git'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
