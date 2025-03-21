'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import Terminal, { ColorMode } from '@/components/ui/terminal'
import TerminalOutput from '@/components/ui/terminal/terminal-output'
import { DecorativeBlocks, BlockColor } from './decorative-blocks'
import { Section } from './section'
import { useIsMobile } from '@/hooks/use-mobile'
import { ChevronRight, BarChart3, Code, ArrowRight, GitCompare } from 'lucide-react'

interface KeyPoint {
  icon: string
  title: string
  description: string
}

// Types for feature illustrations
type IllustrationType = 'code' | 'chart' | 'comparison' | 'workflow' | 'terminal';

interface FeatureIllustration {
  type: IllustrationType;
  content?: React.ReactNode;
  codeSample?: string[];
  chartData?: {
    labels: string[];
    values: number[];
    colors: string[];
  };
  workflowSteps?: {
    title: string;
    description: string;
    icon: string;
  }[];
  comparisonData?: {
    beforeLabel: string;
    afterLabel: string;
    beforeMetrics: {label: string; value: string}[];
    afterMetrics: {label: string; value: string}[];
  };
}

interface FeatureSectionProps {
  title: string
  description: string
  backdropColor?: BlockColor
  imagePosition?: 'left' | 'right'
  codeSample?: string[]
  tagline?: string
  decorativeColors?: BlockColor[]
  keyPoints?: KeyPoint[]
  highlightText?: string
  illustration?: FeatureIllustration
}

// Helper component for highlight text
function HighlightText({ text, isLight }: { text: string, isLight: boolean }) {
  return (
    <motion.div 
      className={cn('p-4 rounded-lg mt-4 text-base font-medium flex items-center', {
        'bg-black/10 border border-black/20 text-black/80': isLight,
        'bg-white/5 border border-white/20 text-white/80': !isLight
      })}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: 0.5 }}
    >
      <div className={cn("mr-3 text-xl", {
        'text-black': isLight,
        'text-green-400': !isLight
      })}>
        ⚡
      </div>
      <div>{text}</div>
    </motion.div>
  )
}

// Code illustration component
function CodeIllustration({ 
  codeSample, 
  isLight 
}: { 
  codeSample: string[], 
  isLight: boolean 
}) {
  return (
    <div className="rounded-lg overflow-hidden border border-gray-800 bg-black/80 shadow-xl">
      <div className="bg-gray-900 p-2 flex items-center">
        <div className="flex space-x-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <div className="ml-2 text-xs text-gray-400 flex items-center">
          <Code size={12} className="mr-1" />
          <span>code.ts</span>
        </div>
      </div>
      <div className="p-4 font-mono text-sm md:text-base text-white/90 max-h-[400px] overflow-auto">
        {codeSample.map((line, i) => (
          <motion.div 
            key={i} 
            className="mb-1 leading-relaxed"
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: 0.1 * i }}
          >
            {line.startsWith('>') ? (
              <span className="text-green-400">{line}</span>
            ) : line.includes("•") ? (
              <span className="text-green-400">{line}</span>
            ) : (
              line
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Chart illustration component
function ChartIllustration({ 
  chartData, 
  isLight 
}: { 
  chartData: { 
    labels: string[], 
    values: number[], 
    colors: string[] 
  }, 
  isLight: boolean 
}) {
  const maxValue = Math.max(...chartData.values);
  
  return (
    <div className={cn(
      "rounded-lg overflow-hidden shadow-xl p-6",
      isLight ? "bg-white border border-black/10" : "bg-black/30 border border-gray-800"
    )}>
      <div className={cn(
        "flex items-center mb-4", 
        isLight ? "text-black" : "text-white"
      )}>
        <BarChart3 className="mr-2" />
        <h3 className="font-medium">Performance Metrics</h3>
      </div>
      
      <div className="space-y-4">
        {chartData.labels.map((label, index) => (
          <motion.div key={index} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className={isLight ? "text-black/70" : "text-white/70"}>{label}</span>
              <span className={isLight ? "text-black/90" : "text-white/90"}>{chartData.values[index]}</span>
            </div>
            <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
              <motion.div 
                className={`h-full ${chartData.colors[index]}`}
                initial={{ width: 0 }}
                whileInView={{ width: `${(chartData.values[index] / maxValue) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 * index }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Workflow illustration component
function WorkflowIllustration({ 
  steps, 
  isLight 
}: { 
  steps: { title: string; description: string; icon: string; }[], 
  isLight: boolean 
}) {
  return (
    <div className={cn(
      "rounded-lg overflow-hidden shadow-xl p-4",
      isLight ? "bg-white/90 border border-black/10" : "bg-black/30 border border-gray-800"
    )}>
      <h3 className={cn(
        "font-medium mb-4 flex items-center", 
        isLight ? "text-black" : "text-white"
      )}>
        <span className="mr-2">Workflow</span>
      </h3>
      
      <div className="space-y-2">
        {steps.map((step, index) => (
          <motion.div 
            key={index}
            className={cn(
              "p-3 rounded-lg flex items-start",
              isLight ? "bg-black/5" : "bg-white/5"
            )}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.15 * index }}
          >
            <div className={cn(
              "flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-xl mr-3",
              isLight ? "bg-black/10" : "bg-white/10"
            )}>
              {step.icon}
            </div>
            <div>
              <h4 className={cn(
                "font-medium",
                isLight ? "text-black" : "text-white"
              )}>
                {step.title}
              </h4>
              <p className={cn(
                "text-sm mt-1",
                isLight ? "text-black/70" : "text-white/70"
              )}>
                {step.description}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div className="absolute ml-4 mt-8 h-[calc(100%-2rem)] border-l-2 border-dashed border-gray-300 dark:border-gray-700 left-4 z-0" />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Comparison illustration component
function ComparisonIllustration({ 
  comparisonData, 
  isLight 
}: { 
  comparisonData: {
    beforeLabel: string;
    afterLabel: string;
    beforeMetrics: { label: string; value: string }[];
    afterMetrics: { label: string; value: string }[];
  }, 
  isLight: boolean 
}) {
  return (
    <div className={cn(
      "rounded-lg overflow-hidden shadow-xl p-4",
      isLight ? "bg-white border border-black/10" : "bg-black/30 border border-gray-800"
    )}>
      <div className={cn(
        "flex items-center mb-4", 
        isLight ? "text-black" : "text-white"
      )}>
        <GitCompare className="mr-2" />
        <h3 className="font-medium">Before vs After</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div 
          className={cn(
            "rounded-lg p-3", 
            isLight ? "bg-black/5" : "bg-white/5"
          )}
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <h4 className={cn(
            "text-sm font-medium border-b pb-2 mb-3",
            isLight ? "text-black/80 border-black/10" : "text-white/80 border-white/10"
          )}>
            {comparisonData.beforeLabel}
          </h4>
          
          <div className="space-y-3">
            {comparisonData.beforeMetrics.map((metric, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className={cn(
                  "text-sm",
                  isLight ? "text-black/70" : "text-white/70"
                )}>
                  {metric.label}
                </span>
                <span className={cn(
                  "font-mono",
                  isLight ? "text-black" : "text-white"
                )}>
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
        
        <motion.div 
          className={cn(
            "rounded-lg p-3", 
            isLight ? "bg-green-50 border border-green-100" : "bg-green-900/20 border border-green-800/30"
          )}
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <h4 className={cn(
            "text-sm font-medium border-b pb-2 mb-3",
            "text-green-600 border-green-100 dark:text-green-400 dark:border-green-800/30"
          )}>
            {comparisonData.afterLabel}
          </h4>
          
          <div className="space-y-3">
            {comparisonData.afterMetrics.map((metric, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className={cn(
                  "text-sm",
                  isLight ? "text-black/70" : "text-white/70"
                )}>
                  {metric.label}
                </span>
                <span className={cn(
                  "font-mono",
                  "text-green-600 dark:text-green-400"
                )}>
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// Terminal illustration component - when terminal is still preferred
function TerminalIllustration({ codeSample }: { codeSample: string[] }) {
  return (
    <div className="rounded-lg overflow-hidden shadow-xl border border-gray-800">
      <Terminal
        name="Terminal"
        colorMode={ColorMode.Dark}
        prompt="> "
        showWindowButtons={true}
      >
        {codeSample.map((line, i) => (
          <TerminalOutput key={i}>{line}</TerminalOutput>
        ))}
      </Terminal>
    </div>
  );
}

export function FeatureSection({
  title,
  description,
  backdropColor = BlockColor.DarkForestGreen,
  imagePosition = 'right',
  codeSample = [],
  tagline,
  decorativeColors = [BlockColor.GenerativeGreen, BlockColor.DarkForestGreen],
  keyPoints = [],
  highlightText,
  illustration,
}: FeatureSectionProps) {
  const isLight = backdropColor === BlockColor.CRTAmber || backdropColor === BlockColor.TerminalYellow
  const isMobile = useIsMobile();

  // Determine which illustration component to use
  const getIllustrationComponent = () => {
    // If a custom illustration is provided
    if (illustration) {
      switch (illustration.type) {
        case 'code':
          return <CodeIllustration 
                   codeSample={illustration.codeSample || codeSample} 
                   isLight={isLight} 
                 />;
        case 'chart':
          return illustration.chartData && 
                 <ChartIllustration 
                   chartData={illustration.chartData} 
                   isLight={isLight} 
                 />;
        case 'workflow':
          return illustration.workflowSteps && 
                 <WorkflowIllustration 
                   steps={illustration.workflowSteps} 
                   isLight={isLight} 
                 />;
        case 'comparison':
          return illustration.comparisonData && 
                 <ComparisonIllustration 
                   comparisonData={illustration.comparisonData} 
                   isLight={isLight} 
                 />;
        case 'terminal':
          return <TerminalIllustration codeSample={illustration.codeSample || codeSample} />;
        default:
          // Fall back to code illustration with default code sample if nothing matches
          return <CodeIllustration codeSample={codeSample} isLight={isLight} />;
      }
    }
    
    // Default illustration is a code display
    return <CodeIllustration codeSample={codeSample} isLight={isLight} />;
  };

  return (
    <Section background={backdropColor}>
      <div className={cn(
        "grid gap-8 items-center", 
        isMobile ? "grid-cols-1" : "lg:grid-cols-2 lg:gap-16"
      )}>
        {/* Mobile view always has content first, illustration second */}
        {isMobile ? (
          <>
            {/* Content for mobile */}
            <motion.div 
              className="space-y-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div>
                <motion.div
                  className={cn('w-16 h-1 rounded mb-3', {
                    'bg-black/30': isLight,
                    'bg-white/30': !isLight
                  })}
                  initial={{ width: 0 }}
                  whileInView={{ width: '4rem' }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                />
                <h2 className={cn('text-3xl lg:text-4xl hero-heading', {
                  'text-black': isLight,
                  'text-white': !isLight,
                })}>
                  {title}
                </h2>
                {tagline && (
                  <motion.span 
                    className={cn('text-xs font-semibold uppercase tracking-wider mt-2 inline-block', {
                      'text-black/70': isLight,
                      'text-white/70': !isLight
                    })}
                    initial={{ opacity: 0, y: 5 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                  >
                    {tagline}
                  </motion.span>
                )}
              </div>
              
              <p className={cn('text-lg leading-relaxed', {
                'text-black/70': isLight,
                'text-white/70': !isLight
              })}>
                {description}
              </p>
              
              {highlightText && (
                <HighlightText text={highlightText} isLight={isLight} />
              )}
              
              {keyPoints.length > 0 && (
                <div className="mt-6 grid gap-4">
                  {keyPoints.map((point, idx) => (
                    <motion.div 
                      key={idx}
                      className="flex items-start gap-3"
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 + (idx * 0.1) }}
                    >
                      <div className={cn('text-xl mt-0.5', {
                        'text-black': isLight,
                        'text-white': !isLight
                      })}>
                        {point.icon}
                      </div>
                      <div>
                        <h3 className={cn('text-base font-semibold', {
                          'text-black': isLight,
                          'text-white': !isLight
                        })}>
                          {point.title}
                        </h3>
                        <p className={cn('text-sm mt-1', {
                          'text-black/70': isLight,
                          'text-white/70': !isLight
                        })}>
                          {point.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
            
            {/* Illustration for mobile */}
            <motion.div
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <DecorativeBlocks
                colors={decorativeColors}
                initialPlacement="bottom-right"
              >
                <div className="relative">
                  {getIllustrationComponent()}
                </div>
              </DecorativeBlocks>
            </motion.div>
          </>
        ) : (
          /* Desktop layout follows imagePosition */
          imagePosition === 'left' ? (
            <>
              <motion.div
                className="relative"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <DecorativeBlocks
                  colors={decorativeColors}
                  initialPlacement="top-left"
                >
                  <div className="relative">
                    {getIllustrationComponent()}
                  </div>
                </DecorativeBlocks>
              </motion.div>
  
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <div>
                  <motion.div
                    className={cn('w-16 h-1 rounded mb-3', {
                      'bg-black/30': isLight,
                      'bg-white/30': !isLight
                    })}
                    initial={{ width: 0 }}
                    whileInView={{ width: '4rem' }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                  />
                  <h2 className={cn('text-3xl lg:text-4xl hero-heading', {
                    'text-black': isLight,
                    'text-white': !isLight,
                  })}>
                    {title}
                  </h2>
                  {tagline && (
                    <motion.span 
                      className={cn('text-xs font-semibold uppercase tracking-wider mt-2 inline-block', {
                        'text-black/70': isLight,
                        'text-white/70': !isLight
                      })}
                      initial={{ opacity: 0, y: 5 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: 0.4 }}
                    >
                      {tagline}
                    </motion.span>
                  )}
                </div>
                
                <p className={cn('text-lg leading-relaxed', {
                  'text-black/70': isLight,
                  'text-white/70': !isLight
                })}>
                  {description}
                </p>
                
                {highlightText && (
                  <HighlightText text={highlightText} isLight={isLight} />
                )}
                
                {keyPoints.length > 0 && (
                  <div className="mt-6 grid gap-4">
                    {keyPoints.map((point, idx) => (
                      <motion.div 
                        key={idx}
                        className="flex items-start gap-3"
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 + (idx * 0.1) }}
                      >
                        <div className={cn('text-xl mt-0.5', {
                          'text-black': isLight,
                          'text-white': !isLight
                        })}>
                          {point.icon}
                        </div>
                        <div>
                          <h3 className={cn('text-base font-semibold', {
                            'text-black': isLight,
                            'text-white': !isLight
                          })}>
                            {point.title}
                          </h3>
                          <p className={cn('text-sm mt-1', {
                            'text-black/70': isLight,
                            'text-white/70': !isLight
                          })}>
                            {point.description}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </>
          ) : (
            <>
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <div>
                  <motion.div
                    className={cn('w-16 h-1 rounded mb-3', {
                      'bg-black/30': isLight,
                      'bg-white/30': !isLight
                    })}
                    initial={{ width: 0 }}
                    whileInView={{ width: '4rem' }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                  />
                  <h2 className={cn('text-3xl lg:text-4xl hero-heading', {
                    'text-black': isLight,
                    'text-white': !isLight,
                  })}>
                    {title}
                  </h2>
                  {tagline && (
                    <motion.span 
                      className={cn('text-xs font-semibold uppercase tracking-wider mt-2 inline-block', {
                        'text-black/70': isLight,
                        'text-white/70': !isLight
                      })}
                      initial={{ opacity: 0, y: 5 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: 0.4 }}
                    >
                      {tagline}
                    </motion.span>
                  )}
                </div>
                
                <p className={cn('text-lg leading-relaxed', {
                  'text-black/70': isLight,
                  'text-white/70': !isLight
                })}>
                  {description}
                </p>
                
                {highlightText && (
                  <HighlightText text={highlightText} isLight={isLight} />
                )}
                
                {keyPoints.length > 0 && (
                  <div className="mt-6 grid gap-4">
                    {keyPoints.map((point, idx) => (
                      <motion.div 
                        key={idx}
                        className="flex items-start gap-3"
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 + (idx * 0.1) }}
                      >
                        <div className={cn('text-xl mt-0.5', {
                          'text-black': isLight,
                          'text-white': !isLight
                        })}>
                          {point.icon}
                        </div>
                        <div>
                          <h3 className={cn('text-base font-semibold', {
                            'text-black': isLight,
                            'text-white': !isLight
                          })}>
                            {point.title}
                          </h3>
                          <p className={cn('text-sm mt-1', {
                            'text-black/70': isLight,
                            'text-white/70': !isLight
                          })}>
                            {point.description}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
  
              <motion.div
                className="relative"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <DecorativeBlocks
                  colors={decorativeColors}
                  initialPlacement="bottom-right"
                >
                  <div className="relative">
                    {getIllustrationComponent()}
                  </div>
                </DecorativeBlocks>
              </motion.div>
            </>
          )
        )}
      </div>
    </Section>
  )
}