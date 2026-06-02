export const DEFAULT_CONTEXT_LENGTH = "small" as const;

export type ContextLength = "small" | "medium" | "long";

export interface ContextLengthPreset {
  label: string;
  description: string;
  /** Max chat messages loaded from DB for agent context (getContextData). */
  maxContextMessages: number;
  chatThresholds: {
    firstThreshold: number;
    secondThreshold: number;
    thirdThreshold: number;
  };
  historyCompaction: {
    compactAtTokens: number;
    targetSummaryTokens: number;
  };
  fileTokensInContext: number;
  costMultiplier: number;
}

export const CONTEXT_LENGTH_PRESETS: Record<
  ContextLength,
  ContextLengthPreset
> = {
  small: {
    label: "Short",
    description: "Compact at 40k tokens and shrink summaries to 5k max",
    maxContextMessages: 48,
    chatThresholds: {
      firstThreshold: 5000,
      secondThreshold: 6000,
      thirdThreshold: 9000,
    },
    historyCompaction: {
      compactAtTokens: 40_000,
      targetSummaryTokens: 5_000,
    },
    fileTokensInContext: 14000,
    costMultiplier: 1,
  },
  medium: {
    label: "Medium",
    description: "Compact at 80k tokens and shrink summaries to 10k max",
    maxContextMessages: 100,
    chatThresholds: {
      firstThreshold: 7500,
      secondThreshold: 9000,
      thirdThreshold: 13500,
    },
    historyCompaction: {
      compactAtTokens: 80_000,
      targetSummaryTokens: 10_000,
    },
    fileTokensInContext: 21000,
    costMultiplier: 1.5,
  },
  long: {
    label: "Long",
    description: "Compact at 150k tokens and shrink summaries to 30k max",
    maxContextMessages: 160,
    chatThresholds: {
      firstThreshold: 10000,
      secondThreshold: 12000,
      thirdThreshold: 18000,
    },
    historyCompaction: {
      compactAtTokens: 150_000,
      targetSummaryTokens: 30_000,
    },
    fileTokensInContext: 28000,
    costMultiplier: 2,
  },
};
