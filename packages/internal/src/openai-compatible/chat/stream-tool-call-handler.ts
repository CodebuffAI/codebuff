import { InvalidResponseDataError, LanguageModelV2StreamPart } from '@ai-sdk/provider';
import { generateId, isParsableJson } from '@ai-sdk/provider-utils';

interface ToolCallState {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  hasFinished: boolean;
}

export interface ToolCallDelta {
  index: number;
  id?: string | null;
  function?: {
    name?: string | null;
    arguments?: string | null;
  };
}

function emitToolCallCompletion(
  toolCall: ToolCallState,
  events: LanguageModelV2StreamPart[],
): void {
  events.push({ type: 'tool-input-end', id: toolCall.id });
  events.push({
    type: 'tool-call',
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    input: toolCall.function.arguments,
  });
  toolCall.hasFinished = true;
}

export function createStreamToolCallHandler() {
  const toolCalls: ToolCallState[] = [];

  return {
    processToolCallDelta(toolCallDelta: ToolCallDelta): LanguageModelV2StreamPart[] {
      const events: LanguageModelV2StreamPart[] = [];
      const index = toolCallDelta.index;

      if (toolCalls[index] == null) {
        if (toolCallDelta.id == null) {
          throw new InvalidResponseDataError({
            data: toolCallDelta,
            message: `Expected 'id' to be a string.`,
          });
        }

        if (toolCallDelta.function?.name == null) {
          throw new InvalidResponseDataError({
            data: toolCallDelta,
            message: `Expected 'function.name' to be a string.`,
          });
        }

        events.push({
          type: 'tool-input-start',
          id: toolCallDelta.id,
          toolName: toolCallDelta.function.name,
        });

        toolCalls[index] = {
          id: toolCallDelta.id,
          type: 'function',
          function: {
            name: toolCallDelta.function.name,
            arguments: toolCallDelta.function.arguments ?? '',
          },
          hasFinished: false,
        };

        const toolCall = toolCalls[index];

        if (toolCall.function.arguments.length > 0) {
          events.push({
            type: 'tool-input-delta',
            id: toolCall.id,
            delta: toolCall.function.arguments,
          });
        }

        if (isParsableJson(toolCall.function.arguments)) {
          emitToolCallCompletion(toolCall, events);
        }

        return events;
      }

      const toolCall = toolCalls[index];

      if (toolCall.hasFinished) {
        return events;
      }

      if (toolCallDelta.function?.arguments != null) {
        toolCall.function.arguments += toolCallDelta.function.arguments;

        events.push({
          type: 'tool-input-delta',
          id: toolCall.id,
          delta: toolCallDelta.function.arguments,
        });
      }

      if (isParsableJson(toolCall.function.arguments)) {
        emitToolCallCompletion(toolCall, events);
      }

      return events;
    },

    flushUnfinishedToolCalls(): LanguageModelV2StreamPart[] {
      const events: LanguageModelV2StreamPart[] = [];

      for (const toolCall of toolCalls.filter(tc => !tc.hasFinished)) {
        // Ensure arguments is valid JSON, fallback to empty object if incomplete
        if (!isParsableJson(toolCall.function.arguments)) {
          toolCall.function.arguments = '{}';
        }
        emitToolCallCompletion(toolCall, events);
      }

      return events;
    },
  };
}

export type StreamToolCallHandler = ReturnType<typeof createStreamToolCallHandler>;
