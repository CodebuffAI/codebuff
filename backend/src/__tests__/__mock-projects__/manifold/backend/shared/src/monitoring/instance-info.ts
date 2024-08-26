import { last } from 'lodash'
import * as metadata from 'gcp-metadata'

export type InstanceInfo = {
  projectId: string
  instanceId: string
  zone: string
}

/** Gets GCP instance info from the local instance metadata service. */
export async function getInstanceInfo() {
  const [projectId, instanceId, fqZone] = await Promise.all([
    metadata.project('project-id'),
    metadata.instance('id'),
    metadata.instance('zone'),
  ])
  // GCP returns zone as `projects/${id}/zones/${zone}
  const zone = last(fqZone.split('/'))
  return { projectId, instanceId, zone } as InstanceInfo
}
