"use node";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import axios from "axios";
/**
 * Applies semantic edits given the edit block and the original code
 * @param editBlock
 * @param originalCode
 * @param filePath
 * @param proejctId
 */
export async function fastApply(
  editBlock: string,
  originalCode: string,
  //filePath?: string,
): Promise<string> {
  try {
    const response = await axios.post(
      "https://instantapply.endpoint.relace.run/v1/code/apply",
      {
        initialCode: originalCode,
        editSnippet: editBlock,
        stream: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer rlc-6C1yrgfI5loSt9VgXNvLRop0pDm7TTvsmpASyA",
        },
      },
    );

    const { mergedCode } = response.data;

    return mergedCode as string;
  } catch (error) {
    throw new Error(`API request failed: ${error}`);
  }
}

export async function morphFastApply(
  editBlock: string,
  originalCode: string,
  //filePath?: string,
): Promise<string> {
  const morph = createOpenAICompatible({
    apiKey: "sk-yuAK3dJlNdPFbd9Q_4rupsX9h6DGt0kvJ3qHv7JRPHkyKKbq",
    baseURL: "https://api.morphllm.com/v1",
    name: "morph",
  });

  const response = await generateText({
    model: morph("morph-v3-large"),
    messages: [
      {
        role: "user",
        content: `<code>${originalCode}</code>\n<update>${editBlock}</update>`,
      },
    ],
  });

  return response.text;
}
