import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ClineVisualizationProps {
  progress: number
  complexity: 'simple' | 'full'
}

export function ClineVisualization({
  progress,
  complexity,
}: ClineVisualizationProps) {
  const errorDelay = 50 // Show error after progress reaches this point

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-medium flex items-center">
            <span className="text-yellow-400 mr-2">🔒</span>
            Cline
            <span className="ml-2 text-xs py-0.5 px-1.5 rounded-full bg-black/30 border border-white/10">
              <span className="text-yellow-400">3x Slower</span>
            </span>
          </h3>
          <p className="text-white/60 mt-1">Limited to specific environments</p>
        </div>
      </div>

      {/* Terminal interface with environment errors */}
      <div className="flex-1 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden relative p-4">
        <div className="text-sm text-white/80 font-mono h-full overflow-y-auto">
          {/* Command input */}
          <div className="mb-4">
            <div className="text-green-400 mb-1">$ cline</div>
            <div className="text-white/90 mb-2">
              Add a new endpoint that returns user profile data
            </div>
          </div>

          {/* Environment error message */}
          {progress > errorDelay && (
            <motion.div
              className="mb-4 bg-yellow-900/20 p-3 rounded-md border-l-2 border-yellow-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
            >
              <div className="text-yellow-300 font-bold mb-2">
                ⚠️ Environment Error
              </div>
              <div className="text-white/80 mb-2">
                Cline requires a compatible Git repository with specific
                structure.
              </div>
              <div className="text-white/80 mb-1">Missing requirements:</div>
              <ul className="list-disc list-inside text-white/70 text-xs space-y-1 mb-3">
                <li>Repository structure must follow Cline conventions</li>
                <li>
                  Must be run from the root directory of a compatible project
                </li>
                <li>Required .cline configuration file not found</li>
                <li>Cannot use with non-standard project layouts</li>
              </ul>

              <div className="text-yellow-200/80 text-xs bg-yellow-950/30 p-2 rounded mt-4">
                Cline only works with compatible project structures, limiting
                its usefulness across different codebases and environments.
              </div>
            </motion.div>
          )}

          {/* No result, blocked by environment */}
          {progress > errorDelay + 30 && (
            <motion.div
              className="mt-4 bg-black/30 p-3 rounded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-white/60 text-sm mb-2">
                Try installing in a compatible project structure:
              </div>
              <div className="text-green-400 text-xs mb-1">
                $ cd ~/projects/compatible-project
              </div>
              <div className="text-green-400 text-xs mb-1">$ cline init</div>
              <div className="text-green-400 text-xs">$ cline configure</div>

              <div className="text-white/70 text-xs mt-4 bg-black/30 p-2 rounded">
                <span className="text-yellow-400">3x slower</span> than Codebuff
                - requires specific environment setup and project structure
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Status display */}
      <div className="mt-3 flex justify-between items-center">
        <div className="text-sm text-white/40">
          <span className="text-yellow-400">Environmental restrictions</span>{' '}
          slow down workflow
        </div>
        <div className="text-xs text-white/30 flex items-center">
          <span className="text-yellow-500 mr-1">🔒</span> Limited compatibility
        </div>
      </div>
    </div>
  )
}