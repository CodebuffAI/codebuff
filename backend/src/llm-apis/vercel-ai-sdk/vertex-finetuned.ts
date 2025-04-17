import { createVertex } from '@ai-sdk/google-vertex'

const VERTEX_PROJECT = 'codebuff'
const VERTEX_LOCATION = 'us-west1'

// This takes a fetch request, and patches it to replace a non-finetuning endpoint:
// eg: https://${location}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${location}/publishers/google/models/${MODEL_ID}:generateContent -d \
// with the identical finetuning endpoint:
// https://TUNING_JOB_REGION-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/TUNING_JOB_REGION/endpoints/${ENDPOINT_ID}:generateContent
// Notably: this keeps the same {location}, {project}, and {model}

function patchedFetchForFinetune(
  requestInfo: RequestInfo | URL,
  requestInit?: RequestInit
): Promise<Response> {
  function patchString(str: string) {
    return str.replace(`/publishers/google/models`, `/endpoints`)
  }

  if (requestInfo instanceof URL) {
    let patchedUrl = new URL(requestInfo)
    patchedUrl.pathname = patchString(patchedUrl.pathname)
    return fetch(patchedUrl, requestInit)
  }
  if (requestInfo instanceof Request) {
    let patchedUrl = patchString(requestInfo.url)
    let patchedRequest = new Request(patchedUrl, requestInfo)
    return fetch(patchedRequest, requestInit)
  }
  if (typeof requestInfo === 'string') {
    let patchedUrl = patchString(requestInfo)
    return fetch(patchedUrl, requestInit)
  }
  // Should never happen
  throw new Error('Unexpected requestInfo type: ' + typeof requestInfo)
}

export const vertexFinetuned = createVertex({
  project: VERTEX_PROJECT,
  location: VERTEX_LOCATION,
  fetch: patchedFetchForFinetune,
})
