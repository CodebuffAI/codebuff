/**
 * Browser-like user agent passed to ad providers for targeting and fraud
 * screening. Keep this shared by every native client so one surface cannot
 * accidentally fall back to a runtime UA such as `Bun/<version>`.
 *
 * Chrome version needs bumping periodically because stale UAs look bot-like to
 * ad networks. Last bumped: 2026-04-21. Revisit roughly every six months.
 */
const AD_CHROME_VERSION = '124.0.0.0'

const AD_USER_AGENTS: Record<string, string> = {
  darwin: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${AD_CHROME_VERSION} Safari/537.36`,
  win32: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${AD_CHROME_VERSION} Safari/537.36`,
  linux: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${AD_CHROME_VERSION} Safari/537.36`,
}

export function getAdUserAgent(platform: string = process.platform): string {
  const platformKey =
    platform === 'macos'
      ? 'darwin'
      : platform === 'windows'
        ? 'win32'
        : platform
  return AD_USER_AGENTS[platformKey] ?? AD_USER_AGENTS.linux
}
