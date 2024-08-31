export function isIOS() {
  return (
    [
      'iPad Simulator',
      'iPhone Simulator',
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod',
    ].includes(navigator.platform) ||
    // iPad on iOS 13 detection
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
  )
}

export function isAndroid() {
  return navigator.userAgent.includes('Android')
}

export function isMac() {
  return navigator.platform.indexOf('Mac') === 0
}
