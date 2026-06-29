import { useStore } from '../store/store'
import { AgentPicker, ModelPicker } from './AgentSelector'
import { Icon } from './Icon'
import { LoginGate } from './LoginGate'

/**
 * The thread's top bar: project switcher, per-thread agent + Freebuff model
 * pickers, sign-in gate, and the Preview controls. Reads thread/project/agent
 * state from the store; `preview` is owned by ThreadView (shared with the
 * preview iframe in the body), so it arrives as props.
 */
export function ThreadHeader({
  threadId,
  preview,
  onTogglePreview,
  onReloadPreview,
}: {
  threadId: string
  preview: boolean
  onTogglePreview: () => void
  onReloadPreview: () => void
}) {
  const slice = useStore((s) => s.threads[threadId])
  const projectPath = useStore((s) => s.projectPath)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  // The server reports `previewReady` based on whether the project has a
  // previewable entry. Until then, offer "Set up preview" instead so users
  // don't click into a 404.
  const previewReady = useStore((s) => s.previewReady)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const agentOptions = useStore((s) => s.agentOptions)
  const agentHarness = useStore((s) => s.agentHarness)
  const setThreadHarness = useStore((s) => s.setThreadHarness)
  const freebuff = useStore((s) => s.freebuff)
  const setThreadModel = useStore((s) => s.setThreadModel)

  if (!slice) return null
  const projectName = projectPath.split(/[/\\]+/).filter(Boolean).pop() ?? ''
  // The hosted Freebuff agent (model picker + sign-in gate apply to it only).
  const isHostedAgent = (slice.thread.harnessId ?? agentHarness ?? 'codebuff') === 'codebuff'

  return (
    <div className="thread-head">
      <button
        className="thread-head-project"
        onClick={() => setPickerOpen(true)}
        title={projectPath ? `${projectPath} — click to open another project` : 'Open a project'}
      >
        <Icon name="folder" /> {projectName || 'Open project'}
        <Icon name="down" className="caret" />
      </button>
      {agentOptions.length > 0 && (
        <AgentPicker
          harnessId={slice.thread.harnessId}
          options={agentOptions}
          fallbackId={agentHarness ?? undefined}
          onChange={(h) => setThreadHarness(threadId, h)}
        />
      )}
      {/* Freebuff model picker — only for the hosted (Freebuff) agent. */}
      {isHostedAgent && freebuff && freebuff.models.length > 0 && (
        <ModelPicker
          model={slice.thread.freebuffModel}
          models={freebuff.models}
          premiumLocked={!!freebuff.premiumSlotHolder && freebuff.premiumSlotHolder !== threadId}
          onChange={(m) => setThreadModel(threadId, m)}
        />
      )}
      {isHostedAgent && freebuff && !freebuff.authed && <LoginGate />}
      {/* The thread title already lives in the tab above; no need to repeat it
          next to the folder name. */}
      {previewReady && preview && (
        <button className="head-btn" onClick={onReloadPreview} title="Reload preview">
          <Icon name="dot" /> Reload
        </button>
      )}
      {previewReady ? (
        <button
          className={`head-btn ${preview ? 'on' : ''}`}
          onClick={onTogglePreview}
          title="Preview this thread's work in a browser"
        >
          <Icon name="play" /> {preview ? 'Hide preview' : 'Preview'}
        </button>
      ) : (
        <button
          className="head-btn"
          onClick={() => setSettingsOpen(true)}
          title="Set up the preview entry to enable Preview"
        >
          <Icon name="settings" /> Set up preview
        </button>
      )}
    </div>
  )
}
