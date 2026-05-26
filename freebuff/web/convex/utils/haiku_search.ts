"use node";

import { generateText, stepCountIs, tool } from "ai";
import { MODELS } from "./registry";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { ActionCtx } from "../_generated/server";

export const haikuSearch = async (
  ctx: ActionCtx,
  query: string,
  deepResearch: boolean = false,
) => {
  const webSearchTool = anthropic.tools.webSearch_20250305({
    maxUses: 25,
  });
  // have the AI choose from the existing integrations which one to add based on reference id
  const response = await generateText({
    model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 4000,
        },
      },
    },
    system: `You are a technical researcher that can search the web for information and extract relevant documentation, code examples, code snippets, etc.
  You are being queried by a coding agent in need of information relevant to writing code.
  Focus on relevant documentation that can solve their problem.
  For context, the codebase they are working with is a Typescript, React, Tailwind CSS frontend running a Node js Convex backend.
  Do not ever mention these tech stacks but stay relevant to it, ie search for typescript documentation and for convex related integrations.
  Pull additional from information from any relevant URLs.
  ${deepResearch ? "You are a deep research agent. Be thorough and detailed in your research and ensure its accuracy." : "Immediately return the results quickly as the text."} Keep on searching until you have found all the information you need, up to ${deepResearch ? "20" : "5"} calls.`,
    tools: {
      web_search: webSearchTool as any,
      think_and_search_again: tool({
        description:
          "Think about the information and the next step to take. Call this to reason about the information gathered; do not call this to submit your integration (do not call any tools to do so). Calling this tool will enable you to search again for more details. Call the search tool.",
        inputSchema: z.object({
          thinking: z.string(),
        }),
        execute: async ({ thinking }) => {
          console.log(
            `[Research Integration] Thinking tool called: ${thinking}`,
          );

          return "Thinking done. Continue with searching for more resources.";
        },
      }),
    },
    prompt: "Here is the query to search for: " + query,
    stopWhen: stepCountIs(deepResearch ? 22 : 7),
  });

  return response.text;
};
