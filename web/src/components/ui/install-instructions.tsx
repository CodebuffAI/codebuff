'use client'

import { ExternalLink } from 'lucide-react'
import Image from 'next/image'
import posthog from 'posthog-js'
import { useRef } from 'react'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { EnhancedCopyButton } from './enhanced-copy-button'

import { cn } from '@/lib/utils'

export function InstallInstructions() {
  const cdCopyButtonRef = useRef<HTMLButtonElement>(null)
  const installCopyButtonRef = useRef<HTMLButtonElement>(null)
  const runCopyButtonRef = useRef<HTMLButtonElement>(null)

  const editors = [
    { name: 'VS Code', href: 'vscode://~/', icon: '/logos/visual-studio.png' },
    { name: 'Cursor', href: 'cursor://~/', icon: '/logos/cursor.png' },
    {
      name: 'IntelliJ',
      href: 'idea://~/',
      icon: '/logos/intellij.png',
      needsWhiteBg: true,
    },
    {
      name: 'PyCharm',
      href: 'pycharm://~/',
      icon: '/logos/pycharm.png',
      needsWhiteBg: true,
    },
  ]

  const handleEditorClick = (editorName: string, href: string) => {
    window.open(
      href +
        encodeURIComponent(
          typeof window !== 'undefined' ? window.location.pathname : '',
        ),
      '_blank',
    )
  }

  const handleCdCommandCopy = () => {
    navigator.clipboard.writeText('cd /path/to/your-repo')
    posthog.capture(AnalyticsEvent.ONBOARD_PAGE_CD_COMMAND_COPIED)
    cdCopyButtonRef.current?.click()
  }

  const handleRunCommandCopy = () => {
    navigator.clipboard.writeText('codebuff')
    posthog.capture(AnalyticsEvent.ONBOARD_PAGE_RUN_COMMAND_COPIED)
    runCopyButtonRef.current?.click()
  }

  const handleInstallCommandCopy = () => {
    navigator.clipboard.writeText('npm install -g codebuff')
    posthog.capture(AnalyticsEvent.ONBOARD_PAGE_INSTALL_COMMAND_COPIED)
    installCopyButtonRef.current?.click()
  }

  return (
    <div className="bg-background border rounded-lg p-8 max-w-4xl mx-auto">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Get started with Codebuff</h2>
        <ol className="list-decimal list-inside space-y-6">
          <li className="text-lg leading-relaxed">
            <span>Open your terminal in your favorite IDE</span>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {editors.map((ed) => (
                <button
                  key={ed.name}
                  className="relative w-full bg-zinc-800/60 hover:bg-zinc-800/80 rounded-lg border border-zinc-600/70 hover:border-white/40 flex flex-row items-center justify-between group transition-all duration-200 py-1 px-3"
                  onClick={() => handleEditorClick(ed.name, ed.href)}
                  aria-label={`Open in ${ed.name}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-4 h-4 relative flex-shrink-0',
                        ed.needsWhiteBg && 'bg-white rounded-sm p-[1px]',
                      )}
                    >
                      <Image
                        src={ed.icon}
                        alt={ed.name}
                        fill
                        className="object-contain"
                      />
                    </div>
                    <span className="text-white/90 font-mono text-sm">
                      {ed.name}
                    </span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </li>
          <li className="text-lg leading-relaxed">
            <span>Navigate to your project directory</span>
            <div className="mt-3">
              <div
                className="bg-zinc-800/60 border border-zinc-700/50 hover:border-acid-green/50 hover:shadow-[0_0_15px_rgba(0,255,149,0.25)] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group"
                onClick={handleCdCommandCopy}
                tabIndex={0}
                aria-label="Copy command: cd /path/to/your-repo"
                onKeyDown={(e) => e.key === 'Enter' && handleCdCommandCopy()}
              >
                <code className="font-mono text-white/90 select-all text-sm">
                  cd /path/to/your-repo
                </code>
                <div onClick={(e) => e.stopPropagation()} className="ml-2">
                  <EnhancedCopyButton
                    value="cd /path/to/your-repo"
                    ref={cdCopyButtonRef}
                  />
                </div>
              </div>
            </div>
          </li>
          <li className="text-lg leading-relaxed">
            <span>Install Codebuff</span>
            <div className="mt-3">
              <div
                className="bg-zinc-800/60 border border-zinc-700/50 hover:border-acid-green/50 hover:shadow-[0_0_15px_rgba(0,255,149,0.25)] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group"
                onClick={handleInstallCommandCopy}
                tabIndex={0}
                aria-label="Copy command: npm install -g codebuff"
                onKeyDown={(e) =>
                  e.key === 'Enter' && handleInstallCommandCopy()
                }
              >
                <code className="font-mono text-white/90 select-all text-sm">
                  npm install -g codebuff
                </code>
                <div onClick={(e) => e.stopPropagation()} className="ml-2">
                  <EnhancedCopyButton
                    value="npm install -g codebuff"
                    ref={installCopyButtonRef}
                  />
                </div>
              </div>
            </div>
          </li>
          <li className="text-lg leading-relaxed">
            <span>Run Codebuff</span>
            <div className="mt-3">
              <div
                className="bg-zinc-800/60 border border-zinc-700/50 hover:border-acid-green/50 hover:shadow-[0_0_15px_rgba(0,255,149,0.25)] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group"
                onClick={handleRunCommandCopy}
                tabIndex={0}
                aria-label="Copy command: codebuff"
                onKeyDown={(e) => e.key === 'Enter' && handleRunCommandCopy()}
              >
                <code className="font-mono text-white/90 select-all text-sm">
                  codebuff
                </code>
                <div onClick={(e) => e.stopPropagation()} className="ml-2">
                  <EnhancedCopyButton value="codebuff" ref={runCopyButtonRef} />
                </div>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}
