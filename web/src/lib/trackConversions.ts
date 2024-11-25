import { linkedInTrack } from 'nextjs-linkedin-insight-tag'

export const LINKED_IN_CAMPAIGN_ID = 719181716 // 'Codebuff YC'

export const trackUpgrade = (
  markConversionComplete: boolean
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

  // test campaign
  const testUtmId = localStorage.getItem('test_utm_id')
  if (testUtmId) {
    if (markConversionComplete) {
      console.log(`test campaign tracked: ${testUtmId}`)
      localStorage.removeItem('test_utm_id')
    }
    params.set('utm_source', 'test')
    params.set('test_utm_id', testUtmId)
  }

  // Handle other campaigns

  return params
}
