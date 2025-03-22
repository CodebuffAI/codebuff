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
            {url}
          </div>
        </div>
      </div>
      {/* Content area */}
      <div className="flex-1 border rounded-b-lg border-gray-200 dark:border-gray-700 p-6">
        {variant === 'before' ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-400 dark:border-gray-700 p-6">
            <h1 className="text-xl font-mono text-gray-700 dark:text-gray-300">
              Weather App
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400 font-mono text-sm">
              Basic frontend with mock data
            </p>
            <div className="mt-4 p-4 bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
              <table
                className="w-full border border-gray-400 dark:border-gray-600"
                cellPadding="5"
              >
                <tbody>
                  <tr className="border-b border-gray-400 dark:border-gray-600">
                    <td className="font-mono text-gray-700 dark:text-gray-300 border-r border-gray-400 dark:border-gray-600">
                      City:
                    </td>
                    <td className="font-mono text-gray-700 dark:text-gray-300">
                      San Francisco
                    </td>
                  </tr>
                  <tr className="border-b border-gray-400 dark:border-gray-600">
                    <td className="font-mono text-gray-700 dark:text-gray-300 border-r border-gray-400 dark:border-gray-600">
                      Temp:
                    </td>
                    <td className="font-mono text-gray-700 dark:text-gray-300">
                      72°F (mock)
                    </td>
                  </tr>
                  <tr className="border-b border-gray-400 dark:border-gray-600">
                    <td className="font-mono text-gray-700 dark:text-gray-300 border-r border-gray-400 dark:border-gray-600">
                      Status:
                    </td>
                    <td className="font-mono text-red-600 dark:text-red-400 font-bold">
                      ERROR: API NOT FOUND
                    </td>
                  </tr>
                  <tr>
                    <td className="font-mono text-gray-700 dark:text-gray-300 border-r border-gray-400 dark:border-gray-600">
                      Last Updated:
                    </td>
                    <td className="font-mono text-gray-700 dark:text-gray-300">
                      N/A
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button className="w-full py-1 bg-blue-500 text-white text-center font-mono">
                REFRESH
              </button>
              <button className="w-full py-1 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-center font-mono">
                CHANGE CITY
              </button>
            </div>
            <div className="mt-4 p-3 border border-red-500 bg-red-100 dark:bg-red-900/30 dark:border-red-700 text-sm text-red-700 dark:text-red-300 font-mono">
              <p>
                <strong>ERROR:</strong> Missing API key configuration. Cannot
                connect to OpenWeatherMap API.
              </p>
            </div>
            <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/40 text-xs text-yellow-800 dark:text-yellow-300 font-mono">
              <p>
                <strong>TODO:</strong> Add API integration code in app.js line
                42
              </p>
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
