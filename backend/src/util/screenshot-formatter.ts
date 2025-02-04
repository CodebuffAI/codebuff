import { MessageContentObject } from 'common/actions'
import { Model, models } from 'common/constants'
import { match, P } from 'ts-pattern'

export function createImageBlock(
  base64Data: string,
  model: Model
): MessageContentObject {
  // Base image block structure
  const imageBlock: MessageContentObject = {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: base64Data,
    },
  }

  const textBlock: MessageContentObject = {
    type: 'text' as const,
    text: base64Data,
  }

  return match(model)
    .with(models.sonnet, () => imageBlock)
    .with(
      models.gpt4o,
      models.gpt4omini,
      models.generatePatch,
      () =>
      base64Data.length > 200000
        ? { ...imageBlock, cache_control: { type: 'ephemeral' as const } }
        : imageBlock
    )
    .with(
      models.o3mini,
      models.deepseekReasoner,
      models.deepseekChat,
      models.gemini2flash,
      models.haiku,
      () => textBlock
    )
    .exhaustive()
}
