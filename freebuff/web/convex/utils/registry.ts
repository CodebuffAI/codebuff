"use node";

import { bedrock } from "@ai-sdk/amazon-bedrock";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createVertex } from "@ai-sdk/google-vertex/edge";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LanguageModel } from "ai";
import { wrapAISDKModel } from "axiom/ai";
import crypto from "crypto";

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto as any;
}

const vertexConfig = {
  project: process.env.GOOGLE_VERTEX_PROJECT,
  //location: process.env.GOOGLE_VERTEX_LOCATION,
  location: "global",
  googleCredentials: {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL!,
    privateKey: process.env.GOOGLE_PRIVATE_KEY!,
    privateKeyId: process.env.GOOGLE_PRIVATE_KEY_ID!,
  },
};

const vertex = createVertex(vertexConfig);

// Reserved for future use
// const vertexAnthropic = createVertexAnthropic({
//   ...vertexConfig,
//   location: "us-east5",
// });

const cerebras = createOpenAICompatible({
  name: "cerebras",
  baseURL: "https://api.cerebras.ai/v1",
  apiKey: process.env.CEREBRAS_API_KEY,
});

const deepinfra = createOpenAICompatible({
  name: "deepinfra",
  baseURL: "https://api.deepinfra.com/v1/openai",
  apiKey: process.env.DEEPINFRA_API_KEY, // TODO: unhardcode
});

// Reserved for future use
// const _openrouter = createOpenRouter({
//   apiKey: process.env.OPENROUTER_API_KEY,
// });

export const MODELS = {
  SPEC_REFINE_MODEL: vertex("gemini-2.5-flash-lite"),
  QUERY_HYDRATE_MODEL: vertex("gemini-2.5-flash-lite"),
  TYPECHECK_FILTER_MODEL: vertex("gemini-2.5-flash-lite"),
  MAIN_AGENT_MODEL: vertex("gemini-2.5-pro"),
  PRIMARY_MODELS: {
    AUTO: wrapAISDKModel(bedrock("us.anthropic.claude-sonnet-4-6")),

    CLAUDE_4_SONNET: wrapAISDKModel(bedrock("us.anthropic.claude-sonnet-4-6")),
    CLAUDE_BEDROCK: wrapAISDKModel(bedrock("us.anthropic.claude-sonnet-4-6")),
    CLAUDE_3_7_BEDROCK: wrapAISDKModel(
      bedrock("us.anthropic.claude-3-7-sonnet-20250219-v1:0"),
    ),
    CLAUDE_LOW_QOS: wrapAISDKModel(
      createAnthropic({
        apiKey: process.env.ANTHROPIC_LOW_QOS_API_KEY!,
      })("claude-sonnet-4-6"),
    ),
    CLAUDE_ANTHROPIC: wrapAISDKModel(anthropic("claude-sonnet-4-6")),
    CLAUDE_OPUS_BEDROCK: wrapAISDKModel(
      bedrock("us.anthropic.claude-opus-4-6-v1"),
    ),
    CLAUDE_SONNET_GATEWAY: "anthropic/claude-sonnet-4.6" as LanguageModel,

    GEMINI_2_5_PRO: wrapAISDKModel(vertex("gemini-2.5-pro")),
    GEMINI_2_5_FLASH: wrapAISDKModel(vertex("gemini-2.5-flash")),
    GEMINI_2_5_FLASH_LITE: wrapAISDKModel(vertex("gemini-2.5-flash-lite")),
    GEMINI_3_PRO: wrapAISDKModel(vertex("gemini-3.1-pro-preview")),
    GEMINI_3_FLASH: wrapAISDKModel(vertex("gemini-3-flash-preview")),

    GPT_5_1_CODEX: wrapAISDKModel(openai("gpt-5.1-codex")),
    GPT_5_2_CODEX: wrapAISDKModel(openai("gpt-5.2-codex")),
    GPT_5_3_CODEX: wrapAISDKModel(openai("gpt-5.3-codex")),
    GPT_5_4: wrapAISDKModel(openai("gpt-5.4")),
    GPT_5_4_MINI: wrapAISDKModel(openai("gpt-5.4-mini")),
    GPT_5_4_NANO: wrapAISDKModel(openai("gpt-5.4-nano")),
    GPT_5: wrapAISDKModel(openai("gpt-5")),
    O_3: wrapAISDKModel(openai("o3")),
    GPT_OSS: "openai/gpt-oss-120b" as LanguageModel,
    GPT_5_MINI: wrapAISDKModel(openai("gpt-5-mini-2025-08-07")),
    GPT_5_NANO: wrapAISDKModel(openai("gpt-5-nano")),
    GPT_5_GATEWAY: "openai/gpt-5" as LanguageModel,
    GPT_CODEX: wrapAISDKModel(openai("gpt-5-codex")) as LanguageModel,

    QWEN_3_CODER_TURBO: wrapAISDKModel(
      deepinfra("Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo"),
    ),
    QWEN_3_ULTRA_FAST: wrapAISDKModel(cerebras("qwen-3-coder-480b")),
    QWEN_3_CODER_GATEWAY: "alibaba/qwen3-coder" as LanguageModel,
    QWEN_3: "alibaba/qwen-3-235b" as LanguageModel,

    GLM_4_5: "zai/glm-4.5" as LanguageModel,
    GLM_4_6: "zai/glm-4.6" as LanguageModel,
    GLM_4_7: "zai/glm-4.7" as LanguageModel,
    GLM_4_7_FLASHX: "zai/glm-4.7-flashx" as LanguageModel,
    GLM_5: "zai/glm-5" as LanguageModel,
    KIMI_K2: "moonshotai/kimi-k2-0905" as LanguageModel,
    MINIMAX_M2_5: "minimax/minimax-m2.5" as LanguageModel,

    DEEPSEEK_R1: "deepseek/deepseek-r1" as LanguageModel,
    DEEPSEEK_CHAT: "deepseek/deepseek-v3.2-exp" as LanguageModel,
    DEEPSEEK_THINKING: "deepseek/deepseek-v3.2-exp-thinking" as LanguageModel,

    GROK_CODE_FAST: "xai/grok-code-fast-1" as LanguageModel,
    GROK_4_1_FAST: "xai/grok-4.1-fast-reasoning" as LanguageModel,
    GROK_4_FAST: "xai/grok-4-fast-reasoning" as LanguageModel,
  },
  CODE_SUMMARIZER_MODEL: openai("gpt-5.4-nano"),
  HISTORY_COMPACTION_MODEL: openai("gpt-5-nano"),
  ABSTRACTION_MODEL: vertex("gemini-2.5-flash"),
  PROJECT_NAME_GENERATOR_MODEL: vertex("gemini-2.5-flash-lite"),
} as const;
