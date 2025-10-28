import { linkedInTrack } from 'nextjs-linkedin-insight-tag'

export const LINKED_IN_CAMPAIGN_ID = 719181716 // 'Codebuff YC'

export const storeSearchParams = (searchParams: URLSearchParams) => {
  const liFatId = searchParams.get('li_fat_id')
  if (liFatId) {
    localStorage.setItem('li_fat_id', liFatId)
  }

  const utm_source = searchParams.get('utm_source')
  if (utm_source) {
    localStorage.setItem('utm_source', utm_source)
  }

  const referrer = searchParams.get('referrer')
  if (referrer) {
    localStorage.setItem('referrer', referrer)
  }
}

export const trackUpgrade = (
  markConversionComplete: boolean,
): URLSearchParams => {
  const params = new URLSearchParams()

  // Came from LinkedIn
  const liFatId = localStorage.getItem('li_fat_id')
  if (liFatId) {
    if (markConversionComplete) {
      linkedInTrack(LINKED_IN_CAMPAIGN_ID)
      localStorage.removeItem('li_fat_id')
    }
    params.set('utm_source', 'linkedin')
    params.set('li_fat_id', liFatId)
  }

  // utm campaign
  const utm_source = localStorage.getItem('utm_source')
  if (utm_source) {
    if (markConversionComplete) {
      console.log(`test campaign tracked: ${utm_source}`)
      localStorage.removeItem('utm_source')
    }
    params.set('utm_source', utm_source)
  }

  // referrer
  const referrer = localStorage.getItem('referrer')
  if (referrer) {
    if (markConversionComplete) {
      console.log(`referrer tracked: ${referrer}`)
      localStorage.removeItem('referrer')
    }
    params.set('referrer', referrer)
  }

  // Handle other campaigns

  return params
}
