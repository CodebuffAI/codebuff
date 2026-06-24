'use client'

import { api } from '@/convex/_generated/api'
import { FunctionReturnType } from 'convex/server'
import { CloudWorkspaceTabs, type CloudTab } from './CloudWorkspaceTabs'
import { CloudOnboardingChecklist } from './CloudOnboardingChecklist'
import { CloudGitPanel } from './CloudGitPanel'
import { CloudCenterContent, type CloudViewMode } from './CloudCenterContent'

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
}: CloudIframeAreaProps) {
  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background">
      {!hideTabs && (
        <CloudOnboardingChecklist
          semanticIdentifier={semanticIdentifier}
          onOpenTab={onCloudTabChange}
        />
      )}
      {!hideTabs && (
        <CloudWorkspaceTabs
          activeTab={cloudTab}
          onChange={onCloudTabChange}
          semanticIdentifier={semanticIdentifier}
        />
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {cloudTab === 'git' ? (
          <CloudGitPanel
            semanticIdentifier={semanticIdentifier}
            repoFullName={project.repo_full_name}
            fallbackBranch={project.current_branch}
          />
        ) : (
          <CloudCenterContent
            project={project}
            semanticIdentifier={semanticIdentifier}
            viewMode={cloudTab as CloudViewMode}
            onViewModeChange={(mode) => onCloudTabChange(mode)}
            isSelectingElement={isSelectingElement}
            forceShowClickToTest={forceShowClickToTest}
            onClickToTest={onClickToTest}
            refreshTrigger={refreshTrigger}
          />
        )}
      </div>
    </div>
  )
}
