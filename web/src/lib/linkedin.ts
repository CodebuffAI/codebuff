export const LINKED_IN_CAMPAIGN_ID = 719181716 // 'Codebuff YC'

export const trackUpgradeClick = (): string => {
  // Came from LinkedIn
  const liFatId = localStorage.getItem('li_fat_id')
  if (liFatId) {
    const { linkedInTrack } = require('nextjs-linkedin-insight-tag')
    linkedInTrack(LINKED_IN_CAMPAIGN_ID)
    localStorage.removeItem('li_fat_id')
    return `?ref=linkedin&li_fat_id=${liFatId}`
  }

  // Handle other campaigns

  return ''
}
