'use client'

import { useInstallDialog } from '@/hooks/use-install-dialog'
import { ExternalLink } from 'lucide-react'
import Image from 'next/image'
import posthog from 'posthog-js'
import { useRef } from 'react'
import { Dialog, DialogContent } from './dialog'
import { EnhancedCopyButton } from './enhanced-copy-button'

export function InstallDialog() {
  const { isOpen, close } = useInstallDialog()
  const cdCopyButtonRef = useRef<HTMLButtonElement>(null)
  const installCopyButtonRef = useRef<HTMLButtonElement>(null)
  const runCopyButtonRef = useRef<HTMLButtonElement>(null)

  const editors = [
    { name: 'VS Code', href: 'vscode://~/', icon: '/logos/visual-studio.png' },
    { name: 'Cursor', href: 'cursor://~/', icon: '/logos/cursor.png' },
    { name: 'IntelliJ', href: 'idea://~/', icon: '/logos/intellij.png' },
    { name: 'PyCharm', href: 'pycharm://~/', icon: '/logos/pycharm.png' },
  ]

  const handleEditorClick = (editorName: string, href: string) => {
    window.open(href + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : ''), '_blank')
  }

  const handleCdCommandCopy = () => {
    navigator.clipboard.writeText("cd /path/to/your-repo")
    posthog.capture('install_dialog.cd_command_copied')
    cdCopyButtonRef.current?.click()
  }

  const handleRunCommandCopy = () => {
    navigator.clipboard.writeText("codebuff")
    posthog.capture('install_dialog.run_command_copied')
    runCopyButtonRef.current?.click()
  }

  const handleInstallCommandCopy = () => {
    navigator.clipboard.writeText("npm install -g codebuff")
    posthog.capture('home.install_command_copied')
    installCopyButtonRef.current?.click()
  }

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="px-8 sm:px-10">
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Get started with Codebuff</h2>
          <ol className="list-decimal list-inside space-y-6">
            <li className="text-lg leading-relaxed">
              <span>Open your terminal in your favorite IDE</span>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {editors.map(ed => (
                  <button
                    key={ed.name}
                    className="relative w-full bg-zinc-800/60 hover:bg-zinc-800/80 rounded-lg border border-zinc-600/70 hover:border-white/40 flex flex-row items-center justify-start group transition-all duration-200 py-1 px-3"
                    onClick={() => handleEditorClick(ed.name, ed.href)}
                    aria-label={`Open in ${ed.name}`}
                  >
                    <div className="mr-3">
                      <div className={ed.name !== 'Cursor' && ed.name !== 'VS Code' ? 'bg-white inline-flex h-6 w-6 items-center justify-center' : ''}>
                        <Image
                          src={ed.icon}
                          alt={ed.name}
                          width={24}
                          height={24}
                        />
                      </div>
                    </div>
                    <span className="text-white/90 font-mono text-sm">{ed.name}</span>
                    <ExternalLink
                      className="absolute right-2 w-3.5 h-3.5 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                ))}
              </div>
            </li>
            <li className="text-lg leading-relaxed">
              <span>Navigate to your project directory</span>
              <div className="mt-3">
                <div
                  className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group"
                  onClick={handleCdCommandCopy}
                  tabIndex={0}
                  aria-label="Copy command: cd /path/to/your-repo"
                  onKeyDown={(e) => e.key === 'Enter' && handleCdCommandCopy()}
                >
                  <code className="font-mono text-white/90 select-all text-sm">cd /path/to/your-repo</code>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="ml-2"
                  >
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
                  className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group"
                  onClick={handleInstallCommandCopy}
                  tabIndex={0}
                  aria-label="Copy command: npm install -g codebuff"
                  onKeyDown={(e) => e.key === 'Enter' && handleInstallCommandCopy()}
                >
                  <code className="font-mono text-white/90 select-all text-sm">npm install -g codebuff</code>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="ml-2"
                  >
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
                  className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300 cursor-pointer group"
                  onClick={handleRunCommandCopy}
                  tabIndex={0}
                  aria-label="Copy command: codebuff"
                  onKeyDown={(e) => e.key === 'Enter' && handleRunCommandCopy()}
                >
                  <code className="font-mono text-white/90 select-all text-sm">codebuff</code>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="ml-2"
                  >
                    <EnhancedCopyButton
                      value="codebuff"
                      ref={runCopyButtonRef}
                    />
                  </div>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  )
}