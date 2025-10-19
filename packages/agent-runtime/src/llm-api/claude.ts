// Simple text block type that doesn't depend on Anthropic SDK
export type TextBlock = {
  text: string
  type: 'text'
}

export type System = string | Array<TextBlock>
