'use client'

import { useInstallDialog } from '@/hooks/use-install-dialog'
import { ExternalLink } from 'lucide-react'
import Image from 'next/image'
import posthog from 'posthog-js'
import { Dialog, DialogContent } from './dialog'
import { EnhancedCopyButton, TerminalCopyButton } from './enhanced-copy-button'

export function InstallDialog() {
  const { isOpen, close } = useInstallDialog()

  const editors = [
    { name: 'VS Code', href: 'vscode://~/', icon: '/icons-and-assets/visual-studio.png' },
    { name: 'Cursor', href: 'cursor://~/', icon: '/competitors/cursor.png' },
    { name: 'IntelliJ', href: 'idea://~/', icon: '/icons-and-assets/intellij.png' },
    { name: 'PyCharm', href: 'pycharm://~/', icon: '/icons-and-assets/pycharm.png' },
  ]

  const handleEditorClick = (editorName: string, href: string) => {
    posthog.capture('ide.editor_clicked', {
      editor: editorName,
      source: 'install_dialog'
    })
    window.open(href + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : ''), '_blank')
  }

  const handleInstallCommandCopy = () => {
    posthog.capture('home.install_command_copied')
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
                    className="relative w-full aspect-auto bg-white hover:bg-gray-50 rounded-lg border border-gray-200 flex flex-col items-center justify-center group transition-all duration-200 py-1.5"
                    onClick={() => handleEditorClick(ed.name, ed.href)}
                    aria-label={`Open in ${ed.name}`}
                  >
                    <Image
                      src={ed.icon}
                      alt={ed.name}
                      width={42}
                      height={42}
                      className="mb-1 transition-transform group-hover:scale-110"
                    />
                    <span className="text-black font-mono text-base">{ed.name}</span>
                    <ExternalLink
                      className="absolute top-1.5 right-1.5 w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                ))}
              </div>
            </li>
            <li className="text-lg leading-relaxed">
              <span>Navigate to your project directory</span>
              <div className="mt-3">
                <div className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300">
                  <code className="font-mono text-white/90 select-all text-sm">cd /path/to/your-repo</code>
                  <EnhancedCopyButton 
                    value="cd /path/to/your-repo" 
                    className="ml-2"
                  />
                </div>
              </div>
            </li>
            <li className="text-lg leading-relaxed">
              <span>Install Codebuff</span>
              <div className="mt-3">
                <div className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300">
                  <code className="font-mono text-white/90 select-all text-sm">npm install -g codebuff</code>
                  <EnhancedCopyButton 
                    value="npm install -g codebuff" 
                    className="ml-2"
                    onClick={handleInstallCommandCopy}
                  />
                </div>
              </div>
            </li>
            <li className="text-lg leading-relaxed">
              <span>Run Codebuff</span>
              <div className="mt-3">
                <div className="bg-zinc-800/60 border border-zinc-700/50 hover:border-[#00FF9580] hover:shadow-[0_0_15px_#00FF9540] rounded-md overflow-hidden relative px-3 py-2.5 flex items-center justify-between transition-all duration-300">
                  <code className="font-mono text-white/90 select-all text-sm">codebuff</code>
                  <EnhancedCopyButton 
                    value="codebuff" 
                    className="ml-2"
                  />
                </div>
              </div>
            </li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  )
}