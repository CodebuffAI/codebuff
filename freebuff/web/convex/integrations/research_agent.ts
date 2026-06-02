"use node";

import { ActionCtx } from "../_generated/server";
import { perplexity } from "../utils/perplexity";
import { Doc, Id } from "!/_generated/dataModel";
import { internal } from "!/_generated/api";

/**
 * DEPRECATED: Use addIntegration instead
 */
export async function researchIntegration(
  ctx: ActionCtx,
  args: {
    threadId: Id<"thread">;
    query: string;
    integrationReferenceId?: string;
    deepResearch?: boolean;
  },
) {
  let integration: Doc<"integration"> | undefined;
  if (args.integrationReferenceId) {
    integration = await ctx.runMutation(
      internal.thread.addIntegrationIdToContext,
      {
        threadId: args.threadId,
        integrationReferenceId: args.integrationReferenceId,
      },
    );
  }

  // Enhanced system prompt that prioritizes cached Context7 data
  const systemPrompt = `You are an expert integration support agent with access to comprehensive cached documentation and deep web search capabilities.

  RESEARCH STRATEGY (Follow this priority order):
  1. **Primary Source: Cached Context7 Documentation** - Use the provided integration's LLM instructions, user instructions, and documentation URLs first
  2. **Secondary Source: Deep Web Search** - Supplement with EXA deep research for additional context, recent updates, or missing information
  3. **Focus on Practical Solutions** - Provide actionable code examples, troubleshooting steps, and implementation guidance

  ANSWER REQUIREMENTS:
  - Start with information from the cached integration documentation
  - Supplement with web search findings when helpful
  - Provide specific, actionable solutions with code examples
  - Reference both cached documentation URLs and any additional sources found
  - Focus on TypeScript/JavaScript solutions
  - Be comprehensive but concise

  When cached integration data is available, treat it as the authoritative source for:
  - Implementation instructions and code patterns
  - Environment variable setup
  - API configuration and authentication
  - Official documentation references

  Use web search to supplement with:
  - Recent updates or changes not in cached data
  - Additional code examples and use cases
  - Troubleshooting for specific error scenarios
  - Community best practices and tips`;

  // Enhanced query that includes Context7 cached data prominently
  const query = `
  User Question: ${args.query}

  ${
    integration
      ? `
  CACHED INTEGRATION DOCUMENTATION (Primary Source):
  
  **${integration.title}**
  ${integration.description}
  
  **Implementation Instructions (from Context7 cache):**
  ${integration.llm_instructions}
  
  **User Setup Instructions:**
  ${integration.user_instructions}
  
  **Environment Variables:**
  ${JSON.stringify(integration.env_variables, null, 2)}
  
  **Official Documentation URLs:**
  ${integration.documentation_urls.join("\n")}
  
  **Additional Notes:**
  ${integration.human_added_notes || "None"}
  
  Please answer the user's question using this cached Context7 documentation as your primary source. If you need additional information beyond what's cached, supplement with web search.
  `
      : `
  No specific integration context provided. Use deep web research to answer the user's question about integrations or development topics.
  `
  }`;

  console.log(
    "[Research Agent] Processing query with Context7 cache + EXA search:",
    args.query,
  );

  const response = await perplexity(
    query,
    args.deepResearch ? "sonar-deep-research" : "sonar-pro",
    systemPrompt,
    undefined,
    ctx,
  );

  console.log(
    "[Research Agent] Research completed using cached Context7 data + EXA",
  );

  return response;
}
