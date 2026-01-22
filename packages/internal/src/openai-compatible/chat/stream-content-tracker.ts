import type { LanguageModelV2StreamPart } from '@ai-sdk/provider';

const REASONING_ID = 'reasoning-0';
const TEXT_ID = 'txt-0';

export function createStreamContentTracker() {
  let isActiveReasoning = false;
  let isActiveText = false;

  return {
    processReasoningDelta(content: string): LanguageModelV2StreamPart[] {
      const events: LanguageModelV2StreamPart[] = [];

      if (!isActiveReasoning) {
        events.push({ type: 'reasoning-start', id: REASONING_ID });
        isActiveReasoning = true;
      }

      events.push({ type: 'reasoning-delta', id: REASONING_ID, delta: content });
      return events;
    },

    processTextDelta(content: string): LanguageModelV2StreamPart[] {
      const events: LanguageModelV2StreamPart[] = [];

      if (!isActiveText) {
        events.push({ type: 'text-start', id: TEXT_ID });
        isActiveText = true;
      }

      events.push({ type: 'text-delta', id: TEXT_ID, delta: content });
      return events;
    },

    flush(): LanguageModelV2StreamPart[] {
      const events: LanguageModelV2StreamPart[] = [];

      if (isActiveReasoning) {
        events.push({ type: 'reasoning-end', id: REASONING_ID });
      }

      if (isActiveText) {
        events.push({ type: 'text-end', id: TEXT_ID });
      }

      return events;
    },
  };
}

export type StreamContentTracker = ReturnType<typeof createStreamContentTracker>;
