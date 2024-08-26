import { runScript } from './run-script'
import { trackSignupFB } from 'shared/fb-analytics'

if (require.main === module) {
  runScript(async () => {
    await trackSignupFB(
      process.env.FB_ACCESS_TOKEN ?? '',
      '',
      '',
      ''
    )
  })
}
