import { useEffect, useState } from 'react'

import { useStore } from '../store/store'
import type { ProjectSettings } from '../lib/types'
import { Icon } from './Icon'

/**
 * Project-settings modal. v1 keeps the form to a single Preview-entry field —
 * the only knob users need today to make the per-thread Preview button do
 * something useful when their entry file isn't at the root. The JSON toggle
 * stays open so future fields slot in without UI churn.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings)
  const settingsPath = useStore((s) => s.settingsPath)
  const loadError = useStore((s) => s.settingsLoadError)
  const save = useStore((s) => s.saveSettings)
  const pushToast = useStore((s) => s.pushToast)

  // Local copy so the user can edit freely; only commit on Save.
  const [draft, setDraft] = useState<ProjectSettings>(settings)
  const [showJson, setShowJson] = useState(false)
  // Re-sync on outside changes (e.g. another panel / a save that came back via SSE).
  useEffect(() => setDraft(settings), [settings])

  const entry = draft.preview.entry ?? ''
  const setEntry = (next: string) =>
    setDraft({ ...draft, preview: { ...draft.preview, entry: next.trim() || undefined } })

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const valid = !entry || (entry.length > 0 && !entry.startsWith('/') && !entry.includes('..'))

  const onSave = async () => {
    if (!valid) return
    await save(draft)
    if (!useStore.getState().settingsLoadError) pushToast('Settings saved')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">Project settings</span>
          <button className="head-btn" onClick={onClose} title="Close">
            <Icon name="x" />
          </button>
        </div>

        {loadError && (
          <div className="picker-foot" style={{ color: 'var(--danger)' }}>
            {loadError}
          </div>
        )}

        <div className="messages" style={{ padding: '14px 16px', gap: 12, display: 'flex', flexDirection: 'column' }}>
          {!showJson ? (
            <>
              <label className="welcome-sub" style={{ textAlign: 'left' }}>
                <div style={{ marginBottom: 4, color: 'var(--text)' }}>Preview entry</div>
                <div style={{ marginBottom: 8, maxWidth: 'unset' }}>
                  Path within the project root (or thread worktree) that the in-app
                  Preview iframe serves. Default <code>index.html</code>. For example
                  <code> dist/index.html</code> for built apps, <code>public/index.html</code>
                  for some setups.
                </div>
                <input
                  autoFocus
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder="index.html"
                  spellCheck={false}
                  style={{
                    width: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    padding: '7px 9px',
                    outline: 'none',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
                {!valid && (
                  <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>
                    Must be a relative path without <code>..</code>
                  </div>
                )}
              </label>
            </>
          ) : (
            <textarea
              autoFocus
              value={JSON.stringify(draft, null, 2)}
              onChange={(e) => {
                try {
                  const next = JSON.parse(e.target.value) as ProjectSettings
                  if (next && typeof next === 'object') setDraft(next)
                } catch {
                  /* allow partial edits — Save is the validation gate */
                }
              }}
              spellCheck={false}
              style={{
                width: '100%',
                height: 220,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                padding: '8px 10px',
                outline: 'none',
                color: 'var(--text)',
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 12.5,
                resize: 'vertical',
              }}
            />
          )}
        </div>

        <div className="picker-foot" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <code title={settingsPath ?? ''}>{settingsPath ?? 'in-memory defaults (file absent)'}</code>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={() => setShowJson((v) => !v)}>
              {showJson ? 'Form' : 'Show JSON'}
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn save"
              disabled={!dirty || !valid}
              onClick={onSave}
              title={!valid ? 'Fix invalid entry' : dirty ? 'Save settings' : 'Nothing to save'}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
