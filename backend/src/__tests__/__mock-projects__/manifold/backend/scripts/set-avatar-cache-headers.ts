import { initAdmin } from 'shared/init-admin'
import { log } from 'shared/utils'

const app = initAdmin()
const ONE_YEAR_SECS = 60 * 60 * 24 * 365
const AVATAR_EXTENSION_RE = /\.(gif|tiff|jpe?g|png|webp)$/i

const processAvatars = async () => {
  const storage = app.storage()
  const bucket = storage.bucket(`${app.options.projectId}.appspot.com`)
  const [files] = await bucket.getFiles({ prefix: 'user-images' })
  log(`${files.length} avatar images to process.`)
  for (const file of files) {
    if (AVATAR_EXTENSION_RE.test(file.name)) {
      log(`Updating metadata for ${file.name}.`)
      await file.setMetadata({
        cacheControl: `public, max-age=${ONE_YEAR_SECS}`,
      })
    } else {
      log(`Skipping ${file.name} because it probably isn't an avatar.`)
    }
  }
}

if (require.main === module) {
  processAvatars().catch((e) => console.error(e))
}
