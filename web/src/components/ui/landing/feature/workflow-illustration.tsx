import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

interface WorkflowStep {
  title: string
  description: string
  icon: string
}

interface WorkflowIllustrationProps {
  steps: WorkflowStep[]
}

export function WorkflowIllustration({ steps }: WorkflowIllustrationProps) {
  return (
    <div className="rounded-lg overflow-hidden shadow-xl p-2 md:p-4 bg-white border border-black/10 [&_*]:text-black">
      <div className="space-y-2">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            className="p-2 md:p-3 rounded-lg flex items-start bg-black/5"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.15 * index }}
          >
            <div
              className={cn(
                'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-xl mr-3',
                'bg-white/10',
              )}
            >
              {step.icon}
            </div>
            <div>
              <h4 className="font-medium">{step.title}</h4>
              <p className="text-sm mt-1 opacity-70">{step.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
