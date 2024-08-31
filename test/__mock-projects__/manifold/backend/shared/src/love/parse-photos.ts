export const removePinnedUrlFromPhotoUrls = async (parsedBody: {
  pinned_url: string | undefined
  photo_urls: string[] | undefined
}) => {
  if (parsedBody.photo_urls && parsedBody.pinned_url) {
    parsedBody.photo_urls = parsedBody.photo_urls.filter(
      (url: string) => url !== parsedBody.pinned_url
    )
  }
}
