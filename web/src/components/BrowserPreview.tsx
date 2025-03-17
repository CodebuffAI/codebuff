'use client'

import { cn } from '@/lib/utils'

interface BrowserPreviewProps {
  show?: boolean
  className?: string
}

const BrowserPreview = ({ show, className }: BrowserPreviewProps) => {
  return (
    <div
      className={cn(
        'rounded-lg bg-white dark:bg-gray-900 flex flex-col flex-1',
        className
      )}
    >
      {/* Browser-like title bar */}
      <div className="bg-gray-100 dark:bg-gray-800 p-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        {/* Traffic light circles */}
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        {/* URL bar */}
        <div className="flex-1 ml-2">
          <div className="bg-white dark:bg-gray-700 rounded px-3 py-1 text-sm text-gray-600 dark:text-gray-300 font-mono">
            http://localhost:3000
          </div>
        </div>
      </div>
      {/* Content area */}
      <div className="flex-1 border rounded-b-lg border-gray-200 dark:border-gray-700 p-6">
        <div className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-lg border border-blue-200/20 dark:border-blue-800/20 p-6">
          <h1 className="text-2xl font-bold bg-gradient-to-br from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Hello World! 👋
          </h1>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Let's build something amazing together.
          </p>
          <div className="mt-6 flex gap-4">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Get Started
            </button>
            <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BrowserPreview
