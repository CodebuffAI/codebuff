import { fetchLinkPreview as fetchLinkPreviewCore } from 'common/link-preview'
import { APIError, type APIHandler } from './helpers/endpoint'

export const fetchLinkPreview: APIHandler<'fetch-link-preview'> = async (
  props
) => {
  const preview = await fetchLinkPreviewCore(props.url)
  if (preview) {
    return preview
  } else {
    throw new APIError(500, 'Error fetching link preview.')
  }
}
