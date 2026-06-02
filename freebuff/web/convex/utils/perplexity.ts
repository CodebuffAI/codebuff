"use node";

import axios, { AxiosError } from "axios";
import { ActionCtx } from "../_generated/server";
import { getAuthUser } from "../users";
import { Doc, Id } from "!/_generated/dataModel";
import { internal } from "!/_generated/api";

interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface PerplexityRequestOptions {
  model: string;
  messages: PerplexityMessage[];
  reasoning_effort?: "low" | "medium" | "high";
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  search_domain_filter?: string | null;
  return_images?: boolean;
  return_related_questions?: boolean;
  search_recency_filter?: string;
  top_k?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: any;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations: string[];
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta: {
      role: string;
      content: string;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Performs a search query using the Perplexity API
 * @param query The search query to send
 * @returns A string containing the response content followed by citation links
 */
export async function perplexity(
  query: string,
  model:
    | "sonar-pro"
    | "sonar-deep-research"
    | "sonar-reasoning-pro" = "sonar-pro",
  system?: string,
  projectId?: Id<"project">,
  ctx?: ActionCtx,
): Promise<{
  content: string;
  log: Doc<"search_logs"> | undefined;
}> {
  try {
    // available models:
    // sonar-pro
    // sonar-deep-research
    // sonar-reasoning-pro
    const requestOptions: PerplexityRequestOptions = {
      model: model,
      reasoning_effort: "high",
      messages: [
        {
          role: "system",
          content: system
            ? system
            : "Be precise and concise. The user is working with a full-stack typescript project, frontend in Vite + React, backend & database on Convex + Node.js.",
        },
        {
          role: "user",
          content: query,
        },
      ],
      max_tokens: 8000,
      temperature: 0.1,
      top_p: 0.5,
      search_domain_filter: null,
      return_images: false,
      return_related_questions: false,
      top_k: 0,
      stream: false,
      presence_penalty: 0,
      frequency_penalty: 1,

      // response_format: object ? {
      //   type: "json_schema",
      //   json_schema: {
      //     schema: zodToJsonSchema(object, {
      //       $refStrategy: "none",
      //       target: "jsonSchema7"
      //     })
      //   }
      // } : null,
      response_format: null,
    };

    const response = await axios.post<PerplexityResponse>(
      "https://api.perplexity.ai/chat/completions",
      requestOptions,
      {
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    // Combine content and citations into a single string
    const content = response.data.choices[0].message.content;
    const citations = response.data.citations || [];

    // let result = content;

    // // Add citations to the result if there are any
    // if (citations.length > 0) {
    //   result += "\n\nReferences:\n";
    //   citations.forEach((citation, index) => {
    //     result += `[${index + 1}] ${citation}\n`;
    //   });
    // }

    // Log the API call if we have a context
    let searchLog: Doc<"search_logs"> | undefined;
    if (ctx) {
      const user = await getAuthUser(ctx);
      if (user && projectId) {
        searchLog =
          (await ctx.runMutation(internal.search.insertSearchLog, {
            projectId: projectId,
            userId: user._id,
            query: query,
            response: content,
            model: model,
            citations: citations,
          })) || undefined;
      }
    }

    return {
      content: content,
      log: searchLog,
    };
  } catch (error) {
    if (error instanceof AxiosError) {
      const errorDetails = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: error.response?.data?.error,
        request: {
          model: model,
          messageCount: system ? 2 : 1,
        },
      };
      console.error(
        "[Perplexity API] Error details:",
        JSON.stringify(errorDetails, null, 2),
      );

      // Extract the most relevant error message
      const errorMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.error ||
        error.message;
      throw new Error(`Perplexity API Error: ${errorMessage}`);
    }
    console.error("[Perplexity API] Unexpected error:", error);
    throw new Error(
      `Unexpected error in Perplexity API call: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
