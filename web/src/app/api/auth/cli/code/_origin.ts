export function getLoginUrlOrigin(
  req: Request,
  configuredAppUrl: string,
  fallbackOrigin: string,
  allowLocalhost: boolean,
): string {
  const configuredOrigin = getUsableOrigin(configuredAppUrl, allowLocalhost)
  if (configuredOrigin) {
    return configuredOrigin
  }

  return getUsableOrigin(req.url, allowLocalhost) ?? fallbackOrigin
}

function getUsableOrigin(url: string, allowLocalhost: boolean) {
  try {
    const parsedUrl = new URL(url)
    if (!allowLocalhost && isLocalhost(parsedUrl.hostname)) {
      return null
    }
    return parsedUrl.origin
  } catch {
    return null
  }
}

function isLocalhost(hostname: string) {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, '')
  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '0.0.0.0' ||
    normalizedHostname === '::1'
  )
}
