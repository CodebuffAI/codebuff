import { useEffect, useState } from 'react'

import { api } from '../lib/api'
import { useStore } from '../store/store'
import type { BrowseResult } from '../lib/types'
import { Icon } from './Icon'

/**
 * Folder-picker modal. Browses the local filesystem via /api/fs/list (no native
 * OS dialog — the bridge doesn't expose one) and opens the chosen git repo as the
 * active project. A folder is openable only when it's a git repo.
 */
export function ProjectPicker({ onClose }: { onClose: () => void }) {
  const openProject = useStore((s) => s.openProject)
  const projectPath = useStore((s) => s.projectPath)
  const [listing, setListing] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState(false)

  const load = (path?: string) => {
    setLoading(true)
    api
      .browse(path)
      .then(setListing)
      .finally(() => setLoading(false))
  }

  // Start at the parent of the current project so it's one click away.
  useEffect(() => {
    const start = projectPath ? projectPath.replace(/[/\\][^/\\]+$/, '') : undefined
    load(start || undefined)
  }, [])

  const open = async (path: string) => {
    setOpening(true)
    const res = await openProject(path)
    setOpening(false)
    if (res.ok) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">Open project</span>
          <button className="head-btn" onClick={onClose} title="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="picker-path">
          <button
            className="head-btn"
            disabled={!listing?.parent}
            onClick={() => listing?.parent && load(listing.parent)}
            title="Parent folder"
          >
            <Icon name="left" />
          </button>
          <span className="picker-cwd" title={listing?.path}>
            {listing?.path ?? '…'}
          </span>
          {listing?.isRepo && (
            <button className="btn open-here" disabled={opening} onClick={() => open(listing.path)}>
              Open this folder
            </button>
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
          Only git repositories can be opened. Need one? Run <code>git init</code> in the folder first.
        </div>
      </div>
    </div>
  )
}
