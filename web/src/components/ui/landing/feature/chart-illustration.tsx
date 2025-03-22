import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'

interface ChartData {
  labels: string[]
  values: number[]
  colors: string[]
}

interface ChartIllustrationProps {
  chartData: ChartData
}

export function ChartIllustration({
  chartData,
}: ChartIllustrationProps) {
  const maxValue = Math.max(...chartData.values)

  return (
    <div
      className="rounded-lg overflow-hidden shadow-xl p-6 bg-white border border-black/10 [&_*]:text-black [&_*]:invert dark:invert-0"
    >
      <div className="flex items-center mb-4">
        <BarChart3 className="mr-2" />
        <h3 className="font-medium">Performance Metrics</h3>
      </div>

      <div className="space-y-4">
        {chartData.labels.map((label, index) => (
          <motion.div key={index} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="opacity-70">{label}</span>
              <span className="opacity-90">{chartData.values[index]}</span>
            </div>
            <div className="h-2 w-full bg-black/20 rounded overflow-hidden">
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