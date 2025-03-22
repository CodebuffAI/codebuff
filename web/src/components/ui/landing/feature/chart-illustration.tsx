import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartIllustrationProps {
  chartData: {
    labels: string[]
    values: number[]
    colors: string[]
  }
  isLight: boolean
}

export function ChartIllustration({
  chartData,
  isLight,
}: ChartIllustrationProps) {
  const maxValue = Math.max(...chartData.values)

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden shadow-xl p-6',
        isLight
          ? 'bg-white border border-black/10'
          : 'bg-black/30 border border-gray-800'
      )}
    >
      <div
        className={cn(
          'flex items-center mb-4',
          isLight ? 'text-black' : 'text-white'
        )}
      >
        <BarChart3 className="mr-2" />
        <h3 className="font-medium">Performance Metrics</h3>
      </div>

      <div className="space-y-4">
        {chartData.labels.map((label, index) => (
          <motion.div key={index} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className={isLight ? 'text-black/70' : 'text-white/70'}>
                {label}
              </span>
              <span className={isLight ? 'text-black/90' : 'text-white/90'}>
                {chartData.values[index]}
              </span>
            </div>
            <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
              <motion.div
                className={`h-full ${chartData.colors[index]}`}
                initial={{ width: 0 }}
                whileInView={{
                  width: `${(chartData.values[index] / maxValue) * 100}%`,
                }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 * index }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}