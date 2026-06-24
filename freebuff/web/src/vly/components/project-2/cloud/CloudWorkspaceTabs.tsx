'use client'

import { useRouter } from 'next/navigation'
import {
  Globe2,
  Code2,
  TerminalSquare,
  FileCog,
  GitBranch,
  SlidersHorizontal,
} from 'lucide-react'

export type CloudTab = 'preview' | 'code' | 'terminal' | 'env' | 'git'

const TABS: { id: CloudTab; label: string; Icon: typeof Globe2 }[] = [
  { id: 'preview', label: 'Preview', Icon: Globe2 },
  { id: 'code', label: 'Code', Icon: Code2 },
  { id: 'terminal', label: 'Terminal', Icon: TerminalSquare },
  { id: 'env', label: 'Env', Icon: FileCog },
  { id: 'git', label: 'Git', Icon: GitBranch },
]

/** Maps a workspace tab to the settings section it deep-links to. */
const TAB_SETTINGS_SECTION: Record<CloudTab, string> = {
  preview: 'preview',
  code: 'preview',
  terminal: 'preview',
  env: 'env',
  git: 'git',
}

/**
 * Tab switcher that sits ABOVE the preview/iframe area for Freebuff Cloud
 * (mirrors the Freebuff Web tab row, but pulled out of the iframe URL bar).
 * Includes a GitHub-Desktop-style branch switcher and a deep-link into the
 * matching Settings section.
 */
export function CloudWorkspaceTabs({
  activeTab,
  onChange,
  semanticIdentifier,
}: {
  activeTab: CloudTab
  onChange: (tab: CloudTab) => void
  semanticIdentifier: string
}) {
  const router = useRouter()

  return (
    <div className="flex w-full flex-shrink-0 items-center gap-2 px-2 py-1.5 lg:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={isActive}
              className={`flex h-7 flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-foreground/55 hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() =>
          router.push(
            `/cloud/project/${semanticIdentifier}/settings?section=${TAB_SETTINGS_SECTION[activeTab]}`,
          )
        }
        className="flex h-7 flex-shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Open settings for this tab"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Settings</span>
      </button>
    </div>
  )
}
