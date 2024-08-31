export function removeEmojis(str: string) {
  return str
    .replace(
      /\p{Extended_Pictographic}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}|\p{Emoji_Modifier}/gu,
      ''
    )
    .trim()
}
