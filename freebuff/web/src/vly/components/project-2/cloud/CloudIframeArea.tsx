'use client'

import { api } from '@/convex/_generated/api'
import { FunctionReturnType } from 'convex/server'
import { CloudWorkspaceTabs, type CloudTab } from './CloudWorkspaceTabs'
import { CloudOnboardingChecklist } from './CloudOnboardingChecklist'
import { CloudGitPanel } from './CloudGitPanel'
import { CloudCenterContent, type CloudViewMode } from './CloudCenterContent'
import { CloudGodModePanel } from './CloudGodModePanel'
import { useIsPlatformAdmin } from '@/vly/hooks/useIsPlatformAdmin'
import dynamic from 'next/dynamic'

const IntegrationsView = dynamic(() => import('../IntegrationsView'), { ssr: false })

interface CloudIframeAreaProps {
  project: NonNullable<FunctionReturnType<typeof api.project.getProjectData>>
  semanticIdentifier: string
  cloudTab: CloudTab
  onCloudTabChange: (tab: CloudTab) => void
  isSelectingElement?: boolean
  forceShowClickToTest?: boolean
  onClickToTest?: () => void
  refreshTrigger?: number
  hideTabs?: boolean
  onSendLogsToChat?: (logs: string, previewCommand: string | null) => void
}

/**
 * Cloud-only right pane. Owns the tab row that sits ABOVE the preview (pulled
 * out of the iframe URL bar like Freebuff Web), the onboarding checklist, and
 * routing between the git panel and the preview/code/terminal/env surface.
 */
export function CloudIframeArea({
  project,
  semanticIdentifier,
  cloudTab,
  onCloudTabChange,
  isSelectingElement,
  forceShowClickToTest,
  onClickToTest,
  refreshTrigger,
  hideTabs,
  onSendLogsToChat,
}: CloudIframeAreaProps) {
  const { isPlatformAdmin } = useIsPlatformAdmin()
  const isSpecialTab =
    cloudTab === 'git' || cloudTab === 'integrations' || cloudTab === 'god'

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background">
      {!hideTabs && (
        <CloudOnboardingChecklist
          semanticIdentifier={semanticIdentifier}
          serverDismissed={project.cloud_onboarding_dismissed === true}
          onOpenTab={onCloudTabChange}
        />
      )}
      {!hideTabs && (
        <CloudWorkspaceTabs
          activeTab={cloudTab}
          onChange={onCloudTabChange}
          semanticIdentifier={semanticIdentifier}
          isGodMode={isPlatformAdmin}
        />
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {cloudTab === 'git' ? (
          <CloudGitPanel
            semanticIdentifier={semanticIdentifier}
            repoFullName={project.repo_full_name}
            fallbackBranch={project.current_branch}
          />
        ) : cloudTab === 'integrations' ? (
          <div className="h-full w-full overflow-hidden bg-background px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
            <IntegrationsView semanticIdentifier={semanticIdentifier} />
          </div>
        ) : cloudTab === 'god' && isPlatformAdmin ? (
          <CloudGodModePanel project={project} />
        ) : !isSpecialTab ? (
          <CloudCenterContent
            project={project}
            semanticIdentifier={semanticIdentifier}
            viewMode={cloudTab as CloudViewMode}
            onViewModeChange={(mode) => onCloudTabChange(mode)}
            isSelectingElement={isSelectingElement}
            forceShowClickToTest={forceShowClickToTest}
            onClickToTest={onClickToTest}
            refreshTrigger={refreshTrigger}
            onSendLogsToChat={onSendLogsToChat}
          />
        ) : null}
      </div>
    </div>
  )
}
