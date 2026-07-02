import { useStore } from '../store/store'
import { AgentModelPicker } from './AgentSelector'
import freebuffLogo from './freebuff-logo.svg'
import { Icon } from './Icon'

/**
 * The empty-thread setup step: before the first message, the user picks WHERE
 * the thread runs (project folder) and WHAT runs it (agent + model), front and
 * center. Both lock in once the thread starts — from then on the header shows
 * them as plain labels and a different pick means a new tab — so this card is
 * the one place the choice happens.
 */

/** Make an absolute path fit on one line: collapse a home directory to `~`,
 *  then middle-truncate so the meaningful tail (the leaf folder) stays visible.
 *  We don't have os.homedir() in the renderer, so match the common home shapes
 *  (`/Users/<u>`, `/home/<u>`, `C:\Users\<u>`) heuristically. */
function displayPath(path: string, max = 52): string {
  const collapsed = path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~')
  if (collapsed.length <= max) return collapsed
  // Keep more of the tail than the head — the leaf folder matters most.
  const head = Math.ceil((max - 1) * 0.4)
  const tail = max - 1 - head
  return `${collapsed.slice(0, head)}…${collapsed.slice(collapsed.length - tail)}`
}

export function ThreadSetup({ threadId }: { threadId: string }) {
  const slice = useStore((s) => s.threads[threadId])
  const pickProject = useStore((s) => s.pickProject)
  const agentOptions = useStore((s) => s.agentOptions)
  const agentHarness = useStore((s) => s.agentHarness)
  const freebuff = useStore((s) => s.freebuff)
  const setThreadAgent = useStore((s) => s.setThreadAgent)

  if (!slice) return null
  const projectPath = slice.thread.projectPath
  const projectName = projectPath.split(/[/\\]+/).filter(Boolean).pop() ?? ''

  return (
    <div className="welcome">
      <img className="welcome-logo" src={freebuffLogo} alt="" />
      <div className="welcome-title">New thread</div>
      <div className="thread-setup">
        <button
          type="button"
          className="setup-chip"
          onClick={() => void pickProject(threadId)}
          title={projectPath ? `${projectPath} — click to choose a different folder` : 'Choose a project folder'}
        >
          <Icon name="folder" />
          <span className="setup-chip-body">
            <span className="setup-chip-title">{projectName || 'Choose folder'}</span>
            {projectPath && <span className="setup-chip-sub">{displayPath(projectPath)}</span>}
          </span>
          <Icon name="down" className="caret" />
        </button>
        {agentOptions.length > 0 && (
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
        )}
      </div>
      <div className="setup-hint">
        Folder, agent, and model lock in with the first message — a different pick means a new
        tab.
      </div>
    </div>
  )
}
