type CookieOptions = string[][]

const encodeCookie = (name: string, val: string) => {
  return `${name}=${encodeURIComponent(val)}`
}

const decodeCookie = (cookie: string) => {
  const parts = cookie.trim().split('=')
  const rest = parts.slice(1).join('') // there may be more = in the value
  return [parts[0], decodeURIComponent(rest)] as const
}

export const setCookie = (name: string, val: string, opts?: CookieOptions) => {
  const parts = [encodeCookie(name, val)]
  if (opts != null) {
    parts.push(...opts.map((opt) => opt.join('=')))
  }
  const cookie = parts.join('; ')
  document.cookie = cookie
}

// Note that this intentionally ignores the case where multiple cookies have
// the same name but different paths. Hopefully we never need to think about it.
export const getCookiesFromString = (cookiesStr: string) => {
  const data = cookiesStr.trim()
  if (!data) {
    return {}
  } else {
    return Object.fromEntries(data.split(';').map(decodeCookie))
  }
}

export const getCookie = (cookie: string) => {
  return getCookiesFromString(document.cookie)[cookie]
}
