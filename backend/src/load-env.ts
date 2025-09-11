import('dotenv').then(({ config }) => {
  config({ path: '../.env' })
  console.log('Environment variables loaded')
})