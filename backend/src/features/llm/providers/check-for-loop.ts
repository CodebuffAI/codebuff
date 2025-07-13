import { CoreMessage } from 'ai';
import { z } from 'zod';
import { promptAiSdkStructured } from './vercel-ai-sdk/ai-sdk';
import { models } from '@codebuff/common/constants';
import { getCoreMessagesSubset } from '../../../util/messages';
import { logger } from '../../../util/logger';

const loopCheckSchema = z.object({
  is_loop: z.boolean().describe('Whether the assistant is in a non-productive loop.'),
});

export async function checkForUnproductiveLoop(
  messages: CoreMessage[],
  options: {
    clientSessionId: string;
    fingerprintId: string;
    userInputId: string;
    userId: string | undefined;
  }
): Promise<boolean> {
  const { clientSessionId, fingerprintId, userInputId, userId } = options;

  const relevantMessages = getCoreMessagesSubset(messages, 0).slice(-6);

  if (relevantMessages.length < 4) {
    return false;
  }

  const prompt = `
The following is a sequence of messages between a user and an AI assistant.
Your task is to determine if the assistant is stuck in a non-productive loop.

A non-productive loop is defined as the assistant repeatedly taking similar actions (e.g., using the same tool or running the same terminal command) across multiple turns without making meaningful progress toward resolving the user's request. The assistant might be making small changes, but they don't fix the underlying issue, leading to a cycle of similar errors and attempts.

Analyze the message history and determine if a non-productive loop is occurring.

Respond with a JSON object matching the following schema:
{
  "is_loop": boolean, // true if a loop is detected, false otherwise.
}
`;

  try {
    const result = await promptAiSdkStructured({
      messages: [
        ...relevantMessages,
        { role: 'user', content: prompt },
      ],
      schema: loopCheckSchema,
      model: models.gemini2_5_flash,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      temperature: 0,
    });

    logger.debug({ result }, 'Unproductive loop check result');
    return result.is_loop;
  } catch (error) {
    logger.error({ error }, 'Error checking for unproductive loop');
    return false;
  }
}
