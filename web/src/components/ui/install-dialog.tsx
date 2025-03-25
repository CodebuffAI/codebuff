'use client'

import Link from 'next/link'
import { CodeDemo } from '../docs/mdx/code-demo'
import { Dialog, DialogContent } from './dialog'
import { useInstallDialog } from '@/hooks/use-install-dialog'

export function InstallDialog() {
  const { isOpen, close } = useInstallDialog()

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="px-8 sm:px-10">
        <div className="space-y-8">
          <h2 className="text-2xl font-bold">Get Started with Codebuff</h2>
          <ol className="list-decimal list-inside space-y-8">
            <li className="text-lg leading-relaxed">
              Open your favorite terminal.
            </li>
            <li className="text-lg leading-relaxed">
              Install Codebuff globally via{' '}
              <Link
                href="https://www.npmjs.com/package/codebuff"
                target="_blank"
                className="text-blue-500 hover:text-blue-400 underline"
              >
                npm
              </Link>
              :
              <div className="mt-3">
                <CodeDemo language="bash">npm install -g codebuff</CodeDemo>
              </div>
            </li>
            <li className="text-lg leading-relaxed">
              Run Codebuff in a project directory:
              <div className="mt-3">
                <CodeDemo language="bash">codebuff</CodeDemo>
              </div>
            </li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  )
}