/**
 * Freebuff's chat logo sheen can make the focused input appear to flicker.
 * Keep the animation for Codebuff while leaving the Freebuff chat header static.
 */
export function shouldAnimateChatHeader(
  animationEnabled: boolean,
  isFreebuff: boolean,
): boolean {
  return animationEnabled && !isFreebuff
}
