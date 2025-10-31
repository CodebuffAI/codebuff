'use client'

import { cn } from '@/lib/utils'

interface BrowserPreviewProps {
  show?: boolean
  className?: string
  url?: string
  variant?: 'before' | 'after'
}

const BrowserPreview = ({
  show,
  className,
  url = 'http://localhost:3000',
  variant = 'before',
}: BrowserPreviewProps) => {
  return (
    <div
      className={cn(
        'rounded-lg bg-white dark:bg-gray-900 flex flex-col flex-1',
        className,
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
            {url}
          </div>
        </div>
      </div>
      {/* Content area */}
      <div className="flex-1 border rounded-b-lg border-gray-200 dark:border-gray-700 p-6">
        {variant === 'before' ? (
          <div
            className="bg-gray-800 h-full w-full"
            style={{ backgroundColor: '#222' }}
          >
            <div className="text-left p-6">
              <h1 className="text-xl text-white mb-4 font-mono">Weather App</h1>

              <div
                className="p-4 mb-4 border border-gray-700"
                style={{ backgroundColor: '#f0f0f0' }}
              >
                <p className="text-red-600 mb-3 font-medium font-mono">
                  Error: API Key Missing
                </p>
                <p className="text-gray-800 text-sm mb-4 font-mono">
                  Please configure the OpenWeatherMap API key to display weather
                  information.
                </p>
              </div>

              <button className="px-4 py-1 bg-gray-700 border border-gray-600 text-gray-300 text-sm font-mono">
                Configure API
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-sky-100 to-indigo-100 dark:from-sky-900 dark:to-indigo-900 rounded-lg border border-blue-200 dark:border-blue-800 p-6 shadow-2xl">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Weather Dashboard Pro ✨
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Enterprise-grade API integration with real-time updates
            </p>
            <div className="mt-4 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-blue-100 dark:border-blue-900/50">
              <div className="flex items-center">
                <div className="w-16 h-16 mr-4 rounded-full bg-gradient-to-br from-yellow-300 to-orange-400 flex items-center justify-center shadow-lg">
                  <span className="text-4xl">☀️</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    San Francisco
                  </h3>
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold text-gray-800 dark:text-gray-200">
                      72°F
                    </span>
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 rounded-full text-xs">
                      Sunny
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-lg shadow border border-blue-100 dark:border-blue-800/30">
                  <div className="text-xs text-blue-500 dark:text-blue-300 font-semibold uppercase">
                    Humidity
                  </div>
                  <div className="font-medium text-gray-800 dark:text-gray-200 text-lg">
                    45%
                  </div>
                </div>
                <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-lg shadow border border-blue-100 dark:border-blue-800/30">
                  <div className="text-xs text-blue-500 dark:text-blue-300 font-semibold uppercase">
                    Wind
                  </div>
                  <div className="font-medium text-gray-800 dark:text-gray-200 text-lg">
                    8 mph <span className="text-xs text-gray-500">↗️ NE</span>
                  </div>
                </div>
                <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-lg shadow border border-blue-100 dark:border-blue-800/30">
                  <div className="text-xs text-blue-500 dark:text-blue-300 font-semibold uppercase">
                    Pressure
                  </div>
                  <div className="font-medium text-gray-800 dark:text-gray-200 text-lg">
                    1012 hPa
                  </div>
                </div>
                <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-lg shadow border border-blue-100 dark:border-blue-800/30">
                  <div className="text-xs text-blue-500 dark:text-blue-300 font-semibold uppercase">
                    UV Index
                  </div>
                  <div className="font-medium text-gray-800 dark:text-gray-200 text-lg">
                    3{' '}
                    <span className="text-xs text-green-500 font-semibold">
                      Low
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full w-3/4 bg-gradient-to-r from-green-400 to-blue-500 rounded-full"></div>
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Updated 2 min ago</span>
                <span>Next update in 5 min</span>
              </div>
            </div>
            <div className="mt-6 flex gap-4">
              <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 transform hover:-translate-y-0.5 font-medium">
                Refresh Now
              </button>
              <button className="px-6 py-3 border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                Change Location
              </button>
            </div>
            <div className="mt-4 p-3 border border-green-400 bg-green-50 dark:bg-green-900/40 dark:border-green-700 rounded-lg text-sm text-green-800 dark:text-green-300">
              <p>
                <strong>✓ Connected:</strong> API integrated with secure key
                management, caching and load balancing
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BrowserPreview
