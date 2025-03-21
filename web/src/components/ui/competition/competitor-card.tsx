'use client'

import { cn } from '@/lib/utils'
import { DecorativeBlocks, BlockColor } from '@/components/ui/decorative-blocks'
import { CursorMaze } from './cursor-maze'
import { CodebuffPath } from './codebuff-path'
import { TimelineProgress } from './timeline-progress'
import { motion } from 'framer-motion'

export type CompetitorType = 'cursor' | 'claude-code' | 'cline'

interface CompetitorCardProps {
  type: CompetitorType
  className?: string
  progress?: number
  complexity?: 'simple' | 'full'
}

interface CompetitorConfig {
  title: string
  description: string
  colors: BlockColor[]
  timeMultiplier: number
  efficiency: number // percentage of efficiency (100% is perfect)
  events: Array<{
    timestamp: number
    type: 'error' | 'success' | 'retry'
    emotion: 'confused' | 'frustrated' | 'confident'
    label?: string
  }>
}

const competitorConfigs: Record<CompetitorType, CompetitorConfig> = {
  cursor: {
    title: 'Cursor',
    description: 'Long winding journey with many dead ends',
    colors: [BlockColor.CRTAmber, BlockColor.DarkForestGreen],
    timeMultiplier: 4, // 4x longer than Codebuff (verified in benchmarks)
    efficiency: 25, // 25% efficient (75% wasted time)
    events: [
      { timestamp: 5000, type: 'retry', emotion: 'confused', label: 'Ambiguous query' },
      { timestamp: 10000, type: 'retry', emotion: 'confused', label: 'Wrong file' },
      { timestamp: 15000, type: 'error', emotion: 'frustrated', label: 'Dead end' },
      { timestamp: 20000, type: 'error', emotion: 'frustrated', label: 'Starting over' },
    ],
  },
  'claude-code': {
    title: 'Claude Code',
    description: 'Multi-step process, higher cost than Codebuff',
    colors: [BlockColor.GenerativeGreen, BlockColor.AcidMatrix],
    timeMultiplier: 2, // 2x longer than Codebuff
    efficiency: 50, // 50% efficient (50% wasted time)
    events: [
      { timestamp: 5000, type: 'retry', emotion: 'confused', label: 'Permission needed' },
      { timestamp: 10000, type: 'success', emotion: 'confident', label: 'Multiple steps' },
    ],
  },
  cline: {
    title: 'Cline',
    description: 'Limited to specific IDE environments',
    colors: [BlockColor.TerminalYellow, BlockColor.DarkForestGreen],
    timeMultiplier: 3, // 3x longer than Codebuff
    efficiency: 33, // 33% efficient (67% wasted time)
    events: [
      { timestamp: 7500, type: 'error', emotion: 'frustrated', label: 'Environment error' },
      { timestamp: 15000, type: 'success', emotion: 'confident', label: 'Limited access' },
    ],
  },
}

export function CompetitorCard({ 
  type, 
  className, 
  progress = 50,
  complexity = 'full'
}: CompetitorCardProps) {
  const config = competitorConfigs[type]
  
  // Scale progress to match the competitor's timeline
  const scaledProgress = Math.min(progress * config.timeMultiplier, 100)
  
  return (
    <div className={cn('h-full p-4', className)}>
      <div className="h-full flex flex-col">
        {/* Header with competitor info */}
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h3 className={cn(
              "text-xl font-medium flex items-center gap-2",
              type === 'cursor' ? "text-red-400" :
              type === 'claude-code' ? "text-purple-400" :
              "text-yellow-400"
            )}>
              {config.title}
              {/* Show vs Codebuff tag */}
              <span className="text-xs py-0.5 px-1.5 rounded bg-gradient-to-r from-black/20 to-black/40 text-white/70">
                vs Codebuff
              </span>
            </h3>
            <p className="text-sm text-white/60">{config.description}</p>
          </div>
          
          <ComparisonMetric
            type={type}
            progress={progress}
          />
        </div>
        
        {/* Competitor vs Codebuff stats - enhanced comparison */}
        {complexity === 'full' && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatsCard 
              title={config.title} 
              value={`${config.timeMultiplier}X Slower`} 
              color={type === 'cursor' ? "bg-red-950/50" : 
                     type === 'claude-code' ? "bg-purple-950/50" : 
                     "bg-yellow-950/50"} 
              textColor={type === 'cursor' ? "text-red-400" : 
                         type === 'claude-code' ? "text-purple-400" : 
                         "text-yellow-400"} 
            />
            <StatsCard 
              title="Codebuff" 
              value={`${Math.round(100 - config.efficiency)}% Faster`} 
              color="bg-green-950/50" 
              textColor="text-green-400" 
              icon="⚡"
            />
          </div>
        )}
        
        <div className="flex-1 relative">
          <DecorativeBlocks colors={config.colors} initialPlacement="top-left">
            <div className="bg-black/40 backdrop-blur-sm rounded-lg overflow-hidden p-4 h-full">
              {type === 'cursor' ? (
                <CursorMaze progress={scaledProgress} complexity={complexity} />
              ) : type === 'claude-code' ? (
                <div className="py-2">
                  <TimelineProgress 
                    progress={scaledProgress} 
                    events={config.events}
                    className="mb-4"
                  />
                  <CodebuffPath 
                    progress={scaledProgress} 
                    complexity={complexity}
                  />
                </div>
              ) : (
                <div className="py-2">
                  <TimelineProgress 
                    progress={scaledProgress} 
                    events={config.events}
                    className="mb-4" 
                  />
                  <EnvironmentRestriction progress={scaledProgress} />
                </div>
              )}
            </div>
          </DecorativeBlocks>
        </div>
        
        {/* Bottom key points - emphasize the comparison */}
        {progress > 30 && (
          <div className="mt-4">
            <CompetitorKeyPoints type={type} progress={progress} />
          </div>
        )}
        
        {/* Codebuff advantage tooltip - shows at high progress */}
        {progress > 85 && (
          <motion.div
            className="absolute bottom-4 right-4 bg-green-950/90 border border-green-500/30 px-3 py-2 rounded-lg shadow-lg max-w-[200px] z-20"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            <div className="text-xs font-medium text-green-400 mb-1 flex items-center gap-1">
              <span>⚡</span>
              <span>Codebuff Advantage</span>
            </div>
            <p className="text-xs text-green-300/80">
              Codebuff solves this {Math.round(config.timeMultiplier)}x faster with precise edits and deep code understanding.
            </p>
            <div className="mt-1 text-2xs flex gap-1.5 flex-wrap">
              <span className="px-1 py-0.5 bg-green-500/20 rounded-sm text-green-300">Lower CPU Usage</span>
              <span className="px-1 py-0.5 bg-green-500/20 rounded-sm text-green-300">Lower Cost</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

interface ComparisonMetricProps {
  type: CompetitorType
  progress: number
}

function ComparisonMetric({ type, progress }: ComparisonMetricProps) {
  // Each competitor takes different amounts of time
  const timeMultiplier = competitorConfigs[type].timeMultiplier;
  
  // For visualization purposes
  const baseTime = 5; // Codebuff base time in seconds
  const competitorTime = baseTime * timeMultiplier;
  
  // Calculate time difference for better visualization
  const timeDifference = competitorTime - baseTime;
  
  // Only show the full competitor time when progress is high enough
  const showTime = progress > 50;
  
  return (
    <motion.div 
      className={cn(
        "rounded-full px-3 py-1 text-sm",
        type === 'cursor' ? "bg-red-950/40" :
        type === 'claude-code' ? "bg-purple-950/40" :
        "bg-yellow-950/40"
      )}
      animate={{ opacity: showTime ? 1 : 0.6 }}
    >
      <motion.span
        className="font-mono"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {type === 'cursor' ? (
          <span className="text-red-400">{competitorTime}min</span>
        ) : type === 'claude-code' ? (
          <span className="text-purple-400">{competitorTime}min</span>
        ) : (
          <span className="text-yellow-400">{competitorTime}min</span>
        )}
        {showTime && (
          <motion.span 
            className="flex items-center gap-1"
            animate={{ x: [-1, 1, -1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <span className="text-white/60 mx-1">vs</span>
            <span className="text-green-400 font-bold">5min</span>
            <motion.span 
              className="text-xs text-green-400"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              ⚡
            </motion.span>
            <span className="text-green-400/70 text-xs ml-1">(save {timeDifference}min)</span>
          </motion.span>
        )}
      </motion.span>
    </motion.div>
  )
}

interface EnvironmentRestrictionProps {
  progress: number;
}

function EnvironmentRestriction({ progress }: EnvironmentRestrictionProps) {
  const stages = [
    { threshold: 30, message: "Checking environment compatibility..." },
    { threshold: 50, message: "Unsupported platform detected..." },
    { threshold: 70, message: "Requires specific JetBrains IDE version" },
    { threshold: 85, message: "Missing required extensions..." },
    { threshold: 100, message: "Consider using Codebuff instead" },
  ];
  
  const currentStage = stages.findIndex(s => progress <= s.threshold);
  const displayedStages = currentStage === -1 
    ? stages 
    : stages.slice(0, currentStage + 1);
  
  return (
    <div className="bg-black rounded-lg p-4 font-mono text-sm overflow-hidden h-[300px]">
      <div className="flex flex-col gap-4">
        {displayedStages.map((stage, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.3 }}
            className="text-yellow-400"
          >
            <span className="opacity-50 mr-2">&gt;</span> {stage.message}
          </motion.div>
        ))}
        
        {progress > 60 && (
          <motion.div 
            className="mt-4 border border-yellow-400/30 rounded-lg p-3 bg-yellow-400/5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            <div className="text-yellow-400 font-semibold mb-2">Environment Requirements:</div>
            <ul className="text-yellow-200/70 space-y-1 text-xs">
              <li>✘ JetBrains IDE (version 2023.1+)</li>
              <li>✘ Local language server</li>
              <li>✘ Specific language plugins</li>
              <li>✘ Admin privileges</li>
            </ul>
          </motion.div>
        )}
        
        {progress > 80 && (
          <motion.div
            className="relative mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
          >
            <div className="absolute -top-2 -right-2 z-10">
              <span className="inline-flex items-center justify-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Codebuff Works Everywhere
              </span>
            </div>
            <div className="bg-green-950/20 border border-green-500/20 rounded-lg p-3">
              <p className="text-xs text-green-400">
                Unlike Cline, Codebuff works in any terminal on any platform with no special environment requirements.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

interface CompetitorKeyPointsProps {
  type: CompetitorType;
  progress: number;
}

function CompetitorKeyPoints({ type, progress }: CompetitorKeyPointsProps) {
  if (progress < 50) return null;
  
  const keyPoints = {
    cursor: [
      { label: "4x Slower", color: "bg-red-500/20 text-red-400" },
      { label: "Frequent Dead Ends", color: "bg-red-500/20 text-red-400" },
      { label: "File Rewrites", color: "bg-red-500/20 text-red-400" },
    ],
    'claude-code': [
      { label: "2x Slower", color: "bg-purple-500/20 text-purple-400" },
      { label: "Higher Cost", color: "bg-purple-500/20 text-purple-400" },
      { label: "Limited Context Awareness", color: "bg-purple-500/20 text-purple-400" },
    ],
    cline: [
      { label: "IDE Required", color: "bg-yellow-500/20 text-yellow-400" },
      { label: "Environment Restrictions", color: "bg-yellow-500/20 text-yellow-400" },
      { label: "Setup Complexity", color: "bg-yellow-500/20 text-yellow-400" },
    ]
  };
  
  // Show Codebuff advantages for comparison
  const codebuffAdvantages = [
    { label: "4x Faster", color: "bg-green-500/20 text-green-400" },
    { label: "Deep Context Awareness", color: "bg-green-500/20 text-green-400" },
    { label: "Works in Any Terminal", color: "bg-green-500/20 text-green-400" },
  ];
  
  // Only show if we've progressed enough
  const visiblePoints = progress < 75 
    ? keyPoints[type].slice(0, 1) 
    : progress < 90 
      ? keyPoints[type].slice(0, 2)
      : keyPoints[type];
  
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visiblePoints.map((point, index) => (
          <motion.span
            key={index}
            className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${point.color}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.2 }}
          >
            {point.label}
          </motion.span>
        ))}
      </div>
      
      {progress > 90 && (
        <motion.div
          className="flex flex-wrap gap-2 mt-1 pt-2 border-t border-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span className="text-xs text-white/60 px-1">Codebuff Advantage:</span>
          {codebuffAdvantages.map((advantage, index) => (
            <motion.span
              key={index}
              className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${advantage.color}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 + (index * 0.2) }}
            >
              {advantage.label}
            </motion.span>
          ))}
        </motion.div>
      )}
    </div>
  );
}

interface StatsCardProps {
  title: string;
  value: string;
  color: string;
  textColor: string;
  icon?: string;
}

function StatsCard({ title, value, color, textColor, icon }: StatsCardProps) {
  return (
    <motion.div 
      className={`rounded-lg p-2 ${color} border border-white/10 relative overflow-hidden`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.03 }}
    >
      {/* Animated gradient background for Codebuff card */}
      {title === 'Codebuff' && (
        <motion.div 
          className="absolute inset-0 opacity-20"
          style={{
            background: 'linear-gradient(45deg, transparent 0%, rgba(74, 222, 128, 0.3) 50%, transparent 100%)',
            backgroundSize: '200% 200%',
          }}
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
          }}
          transition={{ repeat: Infinity, duration: 3 }}
        />
      )}
      
      <div className="text-xs text-white/60 flex items-center gap-1">
        {title}
        {icon && <span className="text-xs">{icon}</span>}
      </div>
      <div className={`text-sm font-medium ${textColor} flex items-center gap-1`}>
        {value}
        {title === 'Codebuff' && (
          <motion.span 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-xs"
          >
            🚀
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}