import { describe, expect, it } from 'bun:test';

import {
  defaultOpenAICompatibleErrorStructure,
  openaiCompatibleErrorDataSchema,
} from './openai-compatible-error';

describe('openaiCompatibleErrorDataSchema', () => {
  it('parses Google OpenAI-compatible error arrays', () => {
    const parsed = openaiCompatibleErrorDataSchema.parse([
      {
        error: {
          code: 401,
          message:
            'Request had invalid authentication credentials. Expected OAuth 2 access token.',
          status: 'UNAUTHENTICATED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED',
            },
          ],
        },
      },
    ]);

    expect(defaultOpenAICompatibleErrorStructure.errorToMessage(parsed)).toBe(
      'Request had invalid authentication credentials. Expected OAuth 2 access token. (ACCESS_TOKEN_TYPE_UNSUPPORTED)',
    );
  });
});
