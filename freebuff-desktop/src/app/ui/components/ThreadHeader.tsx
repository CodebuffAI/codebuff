import { baseName } from '../lib/file-drop'
import { useStore } from '../store/store'
import { activeFreebuffModelOption, AgentModelLabel, AgentModelPicker } from './AgentSelector'
import { Icon } from './Icon'

/** Session units for the badge: whole numbers plain, fractional to one
 *  decimal (units are charged in 0.1 steps server-side). */
const formatUnits = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1)

/**
 * The thread's top bar. On a FRESH tab it carries the setup choices — project
 * folder + agent/model pickers (the same picks the welcome card offers). Once
 * the thread starts (first message / a turn ran) those become plain labels:
 * a thread's folder, agent, and model are fixed for its lifetime, and a
 * different pick means a new tab. Also hosts the Preview controls (the
 * sign-in gate is window-global and lives in the tab bar's account slot).
 * `preview` is owned by ThreadView (shared with the preview iframe in the
 * body), so it arrives as props.
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
  const projectName = baseName(projectPath)
  const started = !!slice.thread.branch || slice.messages.length > 0
  // The hosted Freebuff agent (the API-host badge applies to it only).
  const isHostedAgent = (slice.thread.harnessId ?? agentHarness ?? 'codebuff') === 'codebuff'
  // Session-quota badge for the tab's model — resolved via the picker's own
  // helper so badge and pill can never describe different models. Only
  // quota-metered models have an entry: the premium pool on full tier, every
  // model on limited tier.
  const selectedFreebuffModel = activeFreebuffModelOption(
    freebuff?.models ?? [],
    slice.thread.freebuffModel,
  )
  const quota =
    isHostedAgent && selectedFreebuffModel
      ? freebuff?.rateLimitsByModel?.[selectedFreebuffModel.id]
      : undefined

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
      {quota && (
        <span
          className={`head-quota ${quota.recentCount >= quota.limit ? 'exhausted' : ''}`}
          title={`Free sessions used on this model's ${
            quota.period === 'pacific_week' ? 'weekly' : 'daily'
          } pool — resets ${new Date(quota.resetAt).toLocaleString([], {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}`}
        >
          {formatUnits(Math.min(quota.recentCount, quota.limit))}/{formatUnits(quota.limit)} sessions
        </span>
      )}
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
          className={`head-btn preview-btn ${preview ? 'on' : 'icon-only'}`}
          onClick={onTogglePreview}
          title="Preview this thread's work in a browser"
          aria-label={preview ? 'Hide preview' : 'Preview'}
        >
          <Icon name="play" />
          {preview && 'Hide preview'}
        </button>
      ) : (
        <button
          className="head-btn icon-only"
          onClick={() => setSettingsOpen(true)}
          title="Set up preview"
          aria-label="Set up preview"
        >
          <Icon name="settings" />
        </button>
      )}
    </div>
  )
}
