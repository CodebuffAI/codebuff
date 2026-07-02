import { useStore } from '../store/store'
import { AgentModelLabel, AgentModelPicker } from './AgentSelector'
import { Icon } from './Icon'
import { LoginGate } from './LoginGate'

/**
 * The thread's top bar. On a FRESH tab it carries the setup choices — project
 * folder + agent/model pickers (the same picks the welcome card offers). Once
 * the thread starts (first message / a turn ran) those become plain labels:
 * a thread's folder, agent, and model are fixed for its lifetime, and a
 * different pick means a new tab. Also hosts the sign-in gate and the Preview
 * controls. `preview` is owned by ThreadView (shared with the preview iframe
 * in the body), so it arrives as props.
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
  const pickProject = useStore((s) => s.pickProject)
  // The server reports `previewReady` based on whether the project has a
  // previewable entry. Until then, offer "Set up preview" instead so users
  // don't click into a 404.
  const previewReady = useStore((s) => s.previewReady)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const agentOptions = useStore((s) => s.agentOptions)
  const agentHarness = useStore((s) => s.agentHarness)
  const freebuff = useStore((s) => s.freebuff)
  const setThreadAgent = useStore((s) => s.setThreadAgent)

  if (!slice) return null
  // Each tab runs in its own repo (see Thread.projectPath); the chip changes THIS
  // tab's directory — but only until the thread starts. After that the folder is
  // fixed (a different repo means a new tab), so the chip renders as a label.
  const projectPath = slice.thread.projectPath
  const projectName = projectPath.split(/[/\\]+/).filter(Boolean).pop() ?? ''
  const started = !!slice.thread.branch || slice.messages.length > 0
  // The hosted Freebuff agent (model picker + sign-in gate apply to it only).
  const isHostedAgent = (slice.thread.harnessId ?? agentHarness ?? 'codebuff') === 'codebuff'

  return (
    <div className="thread-head">
      {started ? (
        <span
          className="thread-head-project static"
          title={`${projectPath} — this thread's folder is locked; open a new tab to work elsewhere`}
        >
          <Icon name="folder" /> {projectName}
        </span>
      ) : (
        <button
          className="thread-head-project"
          onClick={() => void pickProject(threadId)}
          title={
            projectPath
              ? `${projectPath} — click to change this tab’s folder`
              : 'Choose a project folder'
          }
        >
          <Icon name="folder" /> {projectName || 'Choose folder'}
          <Icon name="down" className="caret" />
        </button>
      )}
      {agentOptions.length > 0 &&
        (started ? (
          <AgentModelLabel
            harnessId={slice.thread.harnessId}
            fallbackId={agentHarness ?? undefined}
            agents={agentOptions}
            claudeModel={slice.thread.claudeModel}
            freebuffModel={slice.thread.freebuffModel}
            freebuffModels={freebuff?.models ?? []}
          />
        ) : (
          <AgentModelPicker
            harnessId={slice.thread.harnessId}
            fallbackId={agentHarness ?? undefined}
            agents={agentOptions}
            claudeModel={slice.thread.claudeModel}
            freebuffModel={slice.thread.freebuffModel}
            freebuffModels={freebuff?.models ?? []}
            premiumLocked={
              !!freebuff?.premiumSlotHolder && freebuff.premiumSlotHolder !== threadId
            }
            onSelect={(h, m) => setThreadAgent(threadId, h, m)}
          />
        ))}
      {isHostedAgent && freebuff && !freebuff.authed && <LoginGate />}
      {/* The thread title already lives in the tab above; no need to repeat it
          next to the folder name. */}
      {/* Push the preview controls to the far right — they're a secondary action
          relative to the project + agent/model selectors on the left. */}
      <div className="head-spacer" />
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
