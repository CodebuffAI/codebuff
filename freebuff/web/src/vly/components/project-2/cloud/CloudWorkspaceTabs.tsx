'use client'

import { useRouter } from 'next/navigation'
import {
  Globe2,
  Code2,
  TerminalSquare,
  FileCog,
  GitBranch,
  PanelRight,
  SlidersHorizontal,
  Plug,
  ShieldAlert,
} from 'lucide-react'

export type CloudTab =
  | 'preview'
  | 'code'
  | 'terminal'
  | 'env'
  | 'links'
  | 'git'
  | 'integrations'
  | 'god'

const BASE_TABS: { id: CloudTab; label: string; Icon: typeof Globe2 }[] = [
  { id: 'preview', label: 'Preview', Icon: Globe2 },
  { id: 'code', label: 'Code', Icon: Code2 },
  { id: 'terminal', label: 'Terminal', Icon: TerminalSquare },
  { id: 'env', label: 'API Keys', Icon: FileCog },
  { id: 'links', label: 'Links', Icon: PanelRight },
  { id: 'integrations', label: 'Integrations', Icon: Plug },
  { id: 'git', label: 'Git', Icon: GitBranch },
]

const GOD_TAB = { id: 'god' as CloudTab, label: 'God', Icon: ShieldAlert }

/** Maps a workspace tab to the settings section it deep-links to. */
const TAB_SETTINGS_SECTION: Record<CloudTab, string> = {
  preview: 'preview',
  code: 'preview',
  terminal: 'preview',
  env: 'env',
  links: 'preview',
  integrations: 'preview',
  git: 'git',
  god: 'preview',
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
  isGodMode = false,
}: {
  activeTab: CloudTab
  onChange: (tab: CloudTab) => void
  semanticIdentifier: string
  isGodMode?: boolean
}) {
  const router = useRouter()
  const TABS = isGodMode ? [...BASE_TABS, GOD_TAB] : BASE_TABS

  return (
    <div className="flex w-full flex-shrink-0 items-center gap-2 border-b border-border bg-[#181818] px-1.5 py-1 lg:px-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          const isGodTab = id === 'god'
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={isActive}
              className={`cloud-tab flex h-7 flex-shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors ${
                isGodTab
                  ? isActive
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-amber-400/70 hover:bg-amber-500/10 hover:text-amber-300'
                  : isActive
                    ? 'bg-[#2a2a2a] text-foreground'
                    : 'text-foreground/55 hover:bg-muted hover:text-foreground'
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
        className="cloud-tab flex h-7 flex-shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Open settings for this tab"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Settings</span>
      </button>
    </div>
  )
}
