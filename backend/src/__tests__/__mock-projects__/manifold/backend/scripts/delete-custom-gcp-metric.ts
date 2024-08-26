import { MetricServiceClient } from '@google-cloud/monitoring'
import { runScript } from 'run-script'

// mqp: you can't do this with gcloud or the UI as far as i can tell...
async function deleteMetricDescriptor(projectId: string, metricId: string) {
  const client = new MetricServiceClient()
  const fullyQualiiedId = `custom.googleapis.com/${metricId}`
  const name = client.projectMetricDescriptorPath(projectId, fullyQualiiedId)
  await client.deleteMetricDescriptor({ name })
  console.log(`Deleted ${name}.`)
}

if (require.main === module) {
  if (process.argv.length < 3) {
    console.error('usage: delete-custom-gcp-metric.ts [projectId] [metricName]')
    process.exit(1)
  }

  runScript(async () => {
    await deleteMetricDescriptor(process.argv[2], process.argv[3])
  })
}
