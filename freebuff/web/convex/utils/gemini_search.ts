"use node";

import { GoogleGenAI } from "@google/genai";
import { generateText, stepCountIs } from "ai";
import { MODELS } from "./registry";
import { google } from "@ai-sdk/google";

export const geminiSearch = async (query: string) => {
  const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

  // const response = await ai.models.generateContent({
  //   model: "gemini-2.5-flash",
  //   contents: [
  //     `You are a technical researcher that can search the web for information and extract relevant documentation, code examples, code snippets, etc.
  //       You are being queried by a coding agent in need of information relevant to writing code.
  //       Focus on relevant documentation that can solve their problem.
  //       For context, the codebase they are working with is a Typescript, React, Tailwind CSS frontend running a Node js Convex backend.
  //       Do not ever mention these tech stacks but stay relevant to it, ie search for typescript documentation and for convex related integrations.
  //       Pull additional from information from any relevant URLs.
  //       Immediately return the results
  //       `,
  //     `Query: ${query}`,
  //   ],
  //   config: {
  //     tools: [{ urlContext: {} } as any, { googleSearch: {} }],
  //     thinkingConfig: {
  //       thinkingBudget: 1024,
  //     } as any,
  //   },
  // });

  const { text, sources, providerMetadata } = await generateText({
    model: MODELS.PRIMARY_MODELS.GEMINI_2_5_FLASH,
    system: `You are a technical researcher that can search the web for information and extract relevant documentation, code examples, code snippets, etc.
  You are being queried by a coding agent in need of information relevant to writing code.
  Focus on relevant documentation that can solve their problem.
  For context, the codebase they are working with is a Typescript, React, Tailwind CSS frontend running a Node js Convex backend.
  Do not ever mention these tech stacks but stay relevant to it, ie search for typescript documentation and for convex related integrations.
  Pull additional from information from any relevant URLs.
  Immediately return the results. Keep on searching until you have found all the information you need, up to 4 times.`,
    tools: {
      google_search: google.tools.googleSearch({}) as any,
    },
    prompt: "Here is the query to search for: " + query,
    stopWhen: stepCountIs(5),
  });

  return text;
};

export const deepResearch = async (query: string) => {};
