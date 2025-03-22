import { BlockColor } from '../decorative-blocks'

export interface KeyPoint {
  icon: string
  title: string
  description: string
}

export interface SectionTheme {
  background: string | BlockColor
  textColor: string
  decorativeColors: BlockColor[]
}

export type IllustrationType =
  | 'code'
  | 'chart'
  | 'comparison'
  | 'workflow'
  | 'terminal'
  | 'browserComparison'

export interface ChartData {
  labels: string[]
  values: number[]
  colors: string[]
}

export interface WorkflowStep {
  title: string
  description: string
  icon: string
}

export interface ComparisonData {
  beforeLabel: string
  afterLabel: string
  beforeMetrics: { label: string; value: string }[]
  afterMetrics: { label: string; value: string }[]
}

export interface BrowserComparisonData {
  beforeUrl?: string
  afterUrl?: string
  beforeTitle?: string
  afterTitle?: string
  transitionDuration?: number
}

export interface FeatureIllustration {
  type: IllustrationType
  content?: React.ReactNode
  codeSample?: string[]
  chartData?: ChartData
  workflowSteps?: WorkflowStep[]
  comparisonData?: ComparisonData
  browserComparisonData?: BrowserComparisonData
}

export interface FeatureSectionProps {
  title: string
  description: string
  backdropColor?: BlockColor
  decorativeColors?: BlockColor[]
  imagePosition?: 'left' | 'right'
  codeSample?: string[]
  tagline?: string
  keyPoints?: KeyPoint[]
  highlightText?: string
  illustration?: FeatureIllustration
}