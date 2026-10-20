/** A native app's platform, which `message_sent` reports as its surface.
 * Optional for older clients; never infer a browser from missing metadata.
 * Analytics only: client-supplied attribution is not an authorization signal.
 */
export type MobileClientPlatform = 'ios' | 'android'

export function mobileClientPlatform(
  value: unknown,
): MobileClientPlatform | undefined {
  return value === 'ios' || value === 'android' ? value : undefined
}

/** `message_sent`'s surface: a native app's platform, else the send's own. */
export function messageSentSurface<Surface extends string>(
  surface: Surface,
  platform: unknown,
) {
  return mobileClientPlatform(platform) ?? surface
}
