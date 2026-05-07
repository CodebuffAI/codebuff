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
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  )
}
