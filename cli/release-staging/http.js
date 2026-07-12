const http = require('http')
const https = require('https')
const tls = require('tls')

function createReleaseHttpClient({
  env = process.env,
  userAgent,
  requestTimeout,
  httpModule = http,
  httpsModule = https,
  tlsModule = tls,
}) {
  const MAX_REDIRECTS = 5
  function getProxyUrl() {
    return (
      env.HTTPS_PROXY ||
      env.https_proxy ||
      env.HTTP_PROXY ||
      env.http_proxy ||
      null
    )
  }

  function shouldBypassProxy(hostname) {
    const noProxy = env.NO_PROXY || env.no_proxy || ''
    if (!noProxy) return false

    const domains = noProxy
      .split(',')
      .map((domain) => domain.trim().toLowerCase().replace(/:\d+$/, ''))
    const host = hostname.toLowerCase()

    return domains.some((domain) => {
      if (domain === '*') return true
      if (domain.startsWith('.')) {
        return host.endsWith(domain) || host === domain.slice(1)
      }
      return host === domain || host.endsWith(`.${domain}`)
    })
  }

  function connectThroughProxy(proxyUrl, targetHost, targetPort) {
    return new Promise((resolve, reject) => {
      const proxy = new URL(proxyUrl)
      const isHttpsProxy = proxy.protocol === 'https:'
      const connectOptions = {
        hostname: proxy.hostname,
        port: proxy.port || (isHttpsProxy ? 443 : 80),
        method: 'CONNECT',
        path: `${targetHost}:${targetPort}`,
        headers: {
          Host: `${targetHost}:${targetPort}`,
        },
      }

      if (proxy.username || proxy.password) {
        const auth = Buffer.from(
          `${decodeURIComponent(proxy.username || '')}:${decodeURIComponent(
            proxy.password || '',
          )}`,
        ).toString('base64')
        connectOptions.headers['Proxy-Authorization'] = `Basic ${auth}`
      }

      const transport = isHttpsProxy ? httpsModule : httpModule
      const req = transport.request(connectOptions)

      req.on('connect', (res, socket) => {
        if (res.statusCode === 200) {
          resolve(socket)
          return
        }

        socket.destroy()
        reject(new Error(`Proxy CONNECT failed with status ${res.statusCode}`))
      })

      req.on('error', (error) => {
        reject(new Error(`Proxy connection failed: ${error.message}`))
      })

      req.setTimeout(requestTimeout, () => {
        req.destroy()
        reject(new Error('Proxy connection timeout.'))
      })

      req.end()
    })
  }

  async function buildRequestOptions(url, options = {}) {
    const parsedUrl = new URL(url)
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': userAgent,
        ...options.headers,
      },
    }

    const proxyUrl = getProxyUrl()
    if (!proxyUrl || shouldBypassProxy(parsedUrl.hostname)) {
      return reqOptions
    }

    const tunnelSocket = await connectThroughProxy(
      proxyUrl,
      parsedUrl.hostname,
      parsedUrl.port || 443,
    )

    class TunnelAgent extends httpsModule.Agent {
      createConnection(_options, callback) {
        const secureSocket = tlsModule.connect({
          socket: tunnelSocket,
          servername: parsedUrl.hostname,
        })

        if (typeof callback === 'function') {
          if (typeof secureSocket.once === 'function') {
            let settled = false
            const finish = (error) => {
              if (settled) return
              settled = true
              callback(error || null, error ? undefined : secureSocket)
            }

            secureSocket.once('secureConnect', () => finish(null))
            secureSocket.once('error', (error) => finish(error))
          } else {
            callback(null, secureSocket)
          }
        }

        return secureSocket
      }
    }

    reqOptions.agent = new TunnelAgent({ keepAlive: false })
    return reqOptions
  }

  async function httpGet(url, options = {}) {
    const reqOptions = await buildRequestOptions(url, options)
    const redirectCount = options.redirectCount || 0

    return new Promise((resolve, reject) => {
      const req = httpsModule.get(reqOptions, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          if (!res.headers.location) {
            res.resume()
            reject(
              new Error(`Redirect response missing Location header: ${url}`),
            )
            return
          }
          if (redirectCount >= MAX_REDIRECTS) {
            res.resume()
            reject(new Error(`Too many redirects while requesting ${url}`))
            return
          }
          res.resume()
          httpGet(new URL(res.headers.location, url).href, {
            ...options,
            redirectCount: redirectCount + 1,
          })
            .then(resolve)
            .catch(reject)
          return
        }

        resolve(res)
      })

      req.on('error', reject)
      req.setTimeout(options.timeout || requestTimeout, () => {
        req.destroy()
        reject(new Error('Request timeout.'))
      })
    })
  }

  return {
    getProxyUrl,
    httpGet,
  }
}

module.exports = {
  createReleaseHttpClient,
}
