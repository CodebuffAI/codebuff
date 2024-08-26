import { useEffect, useState } from 'react'

export const useBrowserOS = () => {
  const [browser, setBrowser] = useState<
    'chrome' | 'safari' | 'firefox' | 'ie' | 'unknown'
  >('unknown')
  const [os, setOS] = useState<
    'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown'
  >('unknown')
  useEffect(() => {
    const userAgent = window.navigator.userAgent

    if (userAgent.indexOf('Chrome') > -1) {
      setBrowser('chrome')
    } else if (userAgent.indexOf('Safari') > -1) {
      setBrowser('safari')
    } else if (userAgent.indexOf('Firefox') > -1) {
      setBrowser('firefox')
    } else if (userAgent.indexOf('MSIE') > -1 || 'Trident' in window) {
      setBrowser('ie')
    } else {
      setBrowser('unknown')
    }
  }, [])
  useEffect(() => {
    const userAgent = window.navigator.userAgent
    const platform = window.navigator.platform

    if (/Mac/.test(platform)) {
      setOS('mac')
    } else if (/Win/.test(platform)) {
      setOS('windows')
    } else if (/Linux/.test(platform)) {
      setOS('linux')
    } else if (/iPhone|iPad|iPod/.test(userAgent)) {
      setOS('ios')
    } else if (/Android/.test(userAgent)) {
      setOS('android')
    } else {
      setOS('unknown')
    }
  }, [])
  return { os, browser }
}
