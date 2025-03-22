import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface WorkflowStep {
  title: string
  description: string
  icon: string
}

interface WorkflowIllustrationProps {
  steps: WorkflowStep[]
  isLight: boolean
}

export function WorkflowIllustration({
  steps,
  isLight,
}: WorkflowIllustrationProps) {
  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden shadow-xl p-4',
        isLight
          ? 'bg-white border border-black/10'
          : 'bg-black/30 border border-gray-800'
      )}
    >
      <div className="space-y-2">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            className={cn(
              'p-3 rounded-lg flex items-start',
              isLight ? 'bg-black/5' : 'bg-white/5'
            )}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.15 * index }}
          >
            <div
              className={cn(
                'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-xl mr-3',
                isLight ? 'bg-black/10' : 'bg-white/10'
              )}
            >
              {step.icon}
            </div>
            <div>
              <h4
                className={cn(
                  'font-medium',
                  isLight ? 'text-black' : 'text-white'
                )}
              >
                {step.title}
              </h4>
              <p
                className={cn(
                  'text-sm mt-1',
                  isLight ? 'text-black/70' : 'text-white/70'
                )}
              >
                {step.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}