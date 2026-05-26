import { v, Infer } from "convex/values";

// Model validator - defines all available LLM models
export const modelValidator = v.union(
  v.literal("AUTO"),

  v.literal("CLAUDE_4_SONNET"),
  v.literal("CLAUDE_BEDROCK"),
  v.literal("CLAUDE_3_7_BEDROCK"),
  v.literal("CLAUDE_LOW_QOS"),
  v.literal("CLAUDE_ANTHROPIC"),
  v.literal("CLAUDE_OPUS_BEDROCK"),
  v.literal("CLAUDE_SONNET_GATEWAY"),

  v.literal("GEMINI_2_5_PRO"),
  v.literal("GEMINI_2_5_FLASH"),
  v.literal("GEMINI_2_5_FLASH_LITE"),
  v.literal("GEMINI_3_PRO"),
  v.literal("GEMINI_3_FLASH"),

  v.literal("GPT_5_1_CODEX"),
  v.literal("GPT_5_2_CODEX"),
  v.literal("GPT_5_3_CODEX"),
  v.literal("GPT_5_4"),
  v.literal("GPT_5_4_MINI"),
  v.literal("GPT_5_4_NANO"),
  v.literal("GPT_5"),
  v.literal("O_3"),
  v.literal("GPT_OSS"),
  v.literal("GPT_5_MINI"),
  v.literal("GPT_5_NANO"),
  v.literal("GPT_5_GATEWAY"),
  v.literal("GPT_CODEX"),

  v.literal("QWEN_3_CODER_TURBO"),
  v.literal("QWEN_3_ULTRA_FAST"),
  v.literal("QWEN_3_CODER_GATEWAY"),
  v.literal("QWEN_3"),

  v.literal("GLM_4_5"),
  v.literal("GLM_4_6"),
  v.literal("GLM_4_7"),
  v.literal("GLM_4_7_FLASHX"),
  v.literal("GLM_5"),
  v.literal("KIMI_K2"),
  v.literal("MINIMAX_M2_5"),

  v.literal("DEEPSEEK_R1"),
  v.literal("DEEPSEEK_CHAT"),
  v.literal("DEEPSEEK_THINKING"),

  v.literal("GROK_CODE_FAST"),
  v.literal("GROK_4_1_FAST"),
  v.literal("GROK_4_FAST"),
);

export type Model = Infer<typeof modelValidator>;

// Agent mode validator - defines the available agent operation modes
export const agentModeValidator = v.union(
  // Primary modes - frontend-selectable
  v.literal("POWERFUL"),
  v.literal("EFFICIENT"),
  v.literal("PRECISE"),
  v.literal("CHEAP"),
  v.literal("MINIMAX"),
  v.literal("STANDARD"),
  v.literal("OPUS"),
  v.literal("PLANNING"),
  // Legacy aliases kept for compatibility with stored thread/project values
  v.literal("EXPENSIVE"),
  v.literal("ULTRA_CHEAP"),
  // Secondary modes - internal use only
  v.literal("SUMMARIZER"),
  v.literal("ANALYSIS"),
);

export type AgentMode = Infer<typeof agentModeValidator>;
