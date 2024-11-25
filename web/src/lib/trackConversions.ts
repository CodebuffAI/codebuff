import { linkedInTrack } from 'nextjs-linkedin-insight-tag'

export const LINKED_IN_CAMPAIGN_ID = 719181716 // 'Codebuff YC'

export const trackUpgradeClick = (
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

  // Handle other campaigns

  return params
}
