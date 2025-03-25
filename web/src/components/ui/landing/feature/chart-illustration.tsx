import { motion } from 'framer-motion'
import {
  FileText,
  Brain,
  Code,
  Settings,
  Bug,
  Workflow,
  Star,
  Zap,
} from 'lucide-react'

interface KnowledgeIllustrationProps {
  chartData?: any // Keep for backward compatibility
}

export function ChartIllustration({
  chartData, // Not used but kept for compatibility
}: KnowledgeIllustrationProps) {
  // Define icon for each day and description
  const dayData = [
    { icon: Code, label: 'Code style' },
    { icon: Settings, label: 'Project setup' },
    { icon: Bug, label: 'Error patterns' },
    { icon: Workflow, label: 'Code workflows' },
    { icon: Brain, label: 'Advanced patterns' },
    { icon: Star, label: 'Team preferences' },
    { icon: Zap, label: 'Expert knowledge' },
  ]

  return (
    <div className="relative w-full h-full min-h-[300px] overflow-hidden bg-white p-2 md:p-5 shadow-lg">
      {/* Main Content */}
      <div className="flex flex-col items-center max-w-lg mx-auto">
        {/* Knowledge File */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="w-full bg-white rounded-lg border border-slate-200 shadow-md p-4 flex items-center relative z-20 mb-8"
        >
          <div className="flex-shrink-0 mr-3 bg-green-50 p-2 rounded-full">
            <FileText className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-grow">
            <p className="font-medium text-slate-800">knowledge.md</p>
            <p className="text-xs text-slate-600">
              Your project's brain - learns and evolves with each use
            </p>
          </div>
        </motion.div>

        {/* Knowledge Bar Chart */}
        <div className="w-full relative">
          {/* Bar Chart Container */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="w-full border border-slate-200 rounded-lg p-2 md:p-4 bg-slate-50/50"
          >
            {/* Chart title */}
            <div className="mb-4 text-center">
              <h3 className="text-sm font-semibold text-slate-700">
                Knowledge Growth Over Time
              </h3>
            </div>

            {/* Chart layout with labels properly aligned */}
            <div className="flex">
              {/* Left side with Y-axis labels */}
              <div className="w-8 relative mr-2">
                {/* Vertical axis labels */}
                <div className="h-[150px] flex items-center justify-center relative -rotate-90">
                  {/* Rotated "Mastery" label - top */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="translate-x-14"
                  >
                    <span className="text-xs text-green-600 font-medium whitespace-nowrap">
                      Mastery
                    </span>
                  </motion.div>

                  {/* Rotated "Basics" label - bottom */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                    className="-translate-x-28"
                  >
                    <span className="text-xs text-green-600 font-medium whitespace-nowrap">
                      Basics
                    </span>
                  </motion.div>
                </div>
              </div>

              {/* Right side with chart */}
              <div className="flex-1 flex flex-col">
                {/* Day number labels row */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((dayNum, i) => (
                    <motion.div
                      key={`label-${i}`}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: 0.8 + i * 0.05 }}
                      className="text-center"
                    >
                      <span
                        className="text-xs font-medium"
                        style={{
                          color: `rgba(22, 163, 74, ${0.6 + i * 0.05})`,
                        }}
                      >
                        Day {dayNum}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* Bar Chart */}
                <div className="flex justify-between items-end h-[150px] relative">
                  {/* Grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.div
                        key={`grid-${i}`}
                        initial={{ scaleX: 0, opacity: 0 }}
                        whileInView={{ scaleX: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.7 + i * 0.1 }}
                        className={`h-[1px] origin-left ${i === 0 || i === 3 ? 'bg-slate-300' : 'bg-slate-200'}`}
                      ></motion.div>
                    ))}
                  </div>

                  {/* Bars */}
                  {[1, 2, 3, 4, 5, 6, 7].map((dayNum, i) => {
                    // Exponential growth curve for height
                    const curve = Math.pow(i + 1, 1.7) / Math.pow(7, 1.7)
                    const height = Math.max(15, Math.floor(curve * 140))
                    const Icon = dayData[i].icon

                    return (
                      <div
                        key={`bar-container-${i}`}
                        className="flex flex-col items-center w-[14%] relative"
                      >
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          whileInView={{ height, opacity: 1 }}
                          viewport={{ once: true }}
                          transition={{
                            type: 'spring',
                            damping: 12,
                            stiffness: 100,
                            delay: 1.0 + i * 0.1,
                          }}
                          style={{
                            height: `${height}px`,
                            background: `linear-gradient(to top, rgba(22, 163, 74, ${0.4 + curve * 0.6}), rgba(22, 163, 74, ${0.3 + curve * 0.3}))`,
                          }}
                          className="w-full max-w-[40px] rounded-t group hover:brightness-110 transition-all duration-200 relative border-t-0 border border-green-200"
                        ></motion.div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Bottom indicator */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 1.7 }}
          className="text-center mt-6"
        >
          <div className="flex items-center justify-center text-sm text-green-600 font-medium">
            <span>
              Codebuff automatically gets better every time you use it
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
